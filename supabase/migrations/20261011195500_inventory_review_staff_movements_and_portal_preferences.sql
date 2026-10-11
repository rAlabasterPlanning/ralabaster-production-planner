begin;

alter table public.inventory_items
  add column if not exists vein_pct numeric,
  add column if not exists gross_weight_kg numeric,
  add column if not exists pallet_tare_kg numeric,
  add column if not exists net_weight_kg numeric,
  add column if not exists initial_quantity numeric,
  add column if not exists initial_total_weight_kg numeric,
  add column if not exists review_status text not null default 'approved',
  add column if not exists reviewed_at timestamptz,
  add column if not exists reviewed_by uuid references auth.users(id) on delete set null;

update public.inventory_items set vein_pct=transparency_pct where vein_pct is null and transparency_pct is not null;
alter table public.inventory_items drop constraint if exists inventory_items_vein_pct_check;
alter table public.inventory_items add constraint inventory_items_vein_pct_check check (vein_pct is null or vein_pct between 0 and 100);
alter table public.inventory_items drop constraint if exists inventory_items_review_status_check;
alter table public.inventory_items add constraint inventory_items_review_status_check check (review_status in ('pending','approved','rejected'));

alter table public.inventory_movements
  add column if not exists employee_name text,
  add column if not exists product_name text,
  add column if not exists project_name text;

create table if not exists public.inventory_recounts (
  id uuid primary key default gen_random_uuid(),
  workspace_id text not null default 'ralabaster',
  item_id uuid not null references public.inventory_items(id) on delete cascade,
  status text not null default 'requested' check (status in ('requested','completed','cancelled')),
  requested_by uuid references auth.users(id) on delete set null,
  assigned_to text,
  baseline_quantity numeric not null,
  counted_quantity numeric,
  quantity_difference numeric,
  baseline_net_weight_kg numeric,
  counted_gross_weight_kg numeric,
  pallet_tare_kg numeric,
  counted_net_weight_kg numeric,
  weight_difference_kg numeric,
  photo_path text,
  notes text not null default '',
  requested_at timestamptz not null default now(),
  completed_at timestamptz
);
alter table public.inventory_recounts enable row level security;
drop policy if exists inventory_recounts_admin_all on public.inventory_recounts;
create policy inventory_recounts_admin_all on public.inventory_recounts for all to authenticated using (public.portal_is_admin()) with check (public.portal_is_admin());
grant select,insert,update,delete on public.inventory_recounts to authenticated;
create index if not exists inventory_recounts_status_idx on public.inventory_recounts(workspace_id,status,requested_at desc);

create or replace function public.inventory_staff_consume_internal(p_item_id uuid,p_order_id text,p_quantity numeric,p_employee_name text,p_product_name text,p_project_name text)
returns numeric language plpgsql security definer set search_path=public,pg_temp as $$
declare v_balance numeric;
begin
 if p_quantity is null or p_quantity<=0 then raise exception 'Aantal moet groter zijn dan nul.'; end if;
 if length(trim(coalesce(p_order_id,'')))<1 then raise exception 'Kies een order.'; end if;
 if length(trim(coalesce(p_employee_name,'')))<2 then raise exception 'Kies wie de voorraad pakt.'; end if;
 select quantity into v_balance from public.inventory_items where id=p_item_id and workspace_id='ralabaster' and status='active' for update;
 if v_balance is null then raise exception 'Voorraadpartij niet gevonden.'; end if;
 if p_quantity>v_balance then raise exception 'Onvoldoende voorraad. Beschikbaar: %.',v_balance; end if;
 v_balance:=v_balance-p_quantity;
 update public.inventory_items set quantity=v_balance,status=case when v_balance=0 then 'depleted' else 'active' end,updated_at=now() where id=p_item_id;
 insert into public.inventory_movements(item_id,movement_type,quantity_delta,balance_after,order_id,note,employee_name,product_name,project_name)
 values(p_item_id,'consume',-p_quantity,v_balance,p_order_id,'Via personeelsapp',trim(p_employee_name),nullif(trim(p_product_name),''),nullif(trim(p_project_name),''));
 return v_balance;
end $$;
revoke all on function public.inventory_staff_consume_internal(uuid,text,numeric,text,text,text) from public,anon,authenticated;
grant execute on function public.inventory_staff_consume_internal(uuid,text,numeric,text,text,text) to service_role;

create or replace function public.inventory_complete_recount_internal(p_recount_id uuid,p_quantity numeric,p_gross_weight numeric,p_tare_weight numeric,p_photo_path text,p_notes text)
returns numeric language plpgsql security definer set search_path=public,pg_temp as $$
declare r public.inventory_recounts%rowtype;v_net numeric;v_old numeric;
begin
 select * into r from public.inventory_recounts where id=p_recount_id and status='requested' for update;
 if r.id is null then raise exception 'Hertelling niet gevonden of al afgerond.'; end if;
 if p_quantity is null or p_quantity<0 then raise exception 'Vul een geldig aantal in.'; end if;
 v_net:=case when p_gross_weight is null then null else greatest(0,p_gross_weight-coalesce(p_tare_weight,0)) end;
 select quantity into v_old from public.inventory_items where id=r.item_id for update;
 update public.inventory_items set quantity=p_quantity,total_weight_kg=coalesce(v_net,total_weight_kg),weight_kg=coalesce(v_net,weight_kg),gross_weight_kg=p_gross_weight,pallet_tare_kg=p_tare_weight,net_weight_kg=v_net,status=case when p_quantity=0 then 'depleted' else 'active' end,photo_paths=case when nullif(p_photo_path,'') is null then photo_paths else array_append(photo_paths,p_photo_path) end,updated_at=now() where id=r.item_id;
 update public.inventory_recounts set status='completed',counted_quantity=p_quantity,quantity_difference=p_quantity-r.baseline_quantity,counted_gross_weight_kg=p_gross_weight,pallet_tare_kg=p_tare_weight,counted_net_weight_kg=v_net,weight_difference_kg=case when v_net is null or r.baseline_net_weight_kg is null then null else v_net-r.baseline_net_weight_kg end,photo_path=nullif(p_photo_path,''),notes=coalesce(p_notes,''),completed_at=now() where id=r.id;
 insert into public.inventory_movements(item_id,movement_type,quantity_delta,balance_after,note,photo_path) values(r.item_id,'count',p_quantity-v_old,p_quantity,'Hertelling via personeelsapp',nullif(p_photo_path,''));
 return p_quantity;
end $$;
revoke all on function public.inventory_complete_recount_internal(uuid,numeric,numeric,numeric,text,text) from public,anon,authenticated;
grant execute on function public.inventory_complete_recount_internal(uuid,numeric,numeric,numeric,text,text) to service_role;

alter table public.portal_customers add column if not exists preferences jsonb not null default '{}'::jsonb;
create or replace function public.portal_update_preferences(p_preferences jsonb)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare v_uid uuid:=(select auth.uid());v_customer text;v_language text;
begin
 if v_uid is null then raise exception 'Aanmelding vereist.' using errcode='42501'; end if;
 select customer_id into v_customer from public.portal_customer_users where user_id=v_uid and active limit 1;
 if v_customer is null then raise exception 'Geen actief klantaccount.' using errcode='42501'; end if;
 v_language:=lower(coalesce(p_preferences->>'language','nl'));
 if v_language not in ('nl','en','de') then raise exception 'Ongeldige taal.'; end if;
 update public.portal_customers set preferred_language=v_language,preferences=jsonb_strip_nulls(jsonb_build_object(
  'language',v_language,'invoice_email',nullif(trim(p_preferences->>'invoice_email'),''),'packing_slip_email',nullif(trim(p_preferences->>'packing_slip_email'),''),
  'order_confirmation_email',nullif(trim(p_preferences->>'order_confirmation_email'),''),'logistics_email',nullif(trim(p_preferences->>'logistics_email'),''),
  'phone',nullif(trim(p_preferences->>'phone'),''),'invoice_reference',nullif(trim(p_preferences->>'invoice_reference'),''),
  'delivery_notes',nullif(trim(p_preferences->>'delivery_notes'),''),'marketing_opt_in',coalesce((p_preferences->>'marketing_opt_in')::boolean,false)
 )),updated_at=now() where customer_id=v_customer;
 return found;
end $$;
revoke all on function public.portal_update_preferences(jsonb) from public,anon;
grant execute on function public.portal_update_preferences(jsonb) to authenticated;

commit;

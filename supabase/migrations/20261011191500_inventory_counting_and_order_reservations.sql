alter table public.inventory_items
 add column if not exists weight_entry_mode text,
 add column if not exists unit_weight_kg numeric,
 add column if not exists total_weight_kg numeric;

alter table public.inventory_items drop constraint if exists inventory_items_weight_entry_mode_check;
alter table public.inventory_items add constraint inventory_items_weight_entry_mode_check check (weight_entry_mode is null or weight_entry_mode in ('unit','total','calculated'));
alter table public.inventory_items drop constraint if exists inventory_items_unit_weight_check;
alter table public.inventory_items add constraint inventory_items_unit_weight_check check (unit_weight_kg is null or unit_weight_kg >= 0);
alter table public.inventory_items drop constraint if exists inventory_items_total_weight_check;
alter table public.inventory_items add constraint inventory_items_total_weight_check check (total_weight_kg is null or total_weight_kg >= 0);

create table if not exists public.inventory_location_checks (
 workspace_id text not null default 'ralabaster',
 location_number integer not null check (location_number between 1 and 57),
 location_state text not null check (location_state in ('occupied','empty')),
 item_id uuid references public.inventory_items(id) on delete set null,
 photo_path text,
 notes text not null default '',
 checked_at timestamptz not null default now(),
 created_by uuid references auth.users(id) on delete set null,
 primary key(workspace_id,location_number)
);

alter table public.inventory_location_checks enable row level security;
create policy inventory_location_checks_admin_all on public.inventory_location_checks for all to authenticated using (public.portal_is_admin()) with check (public.portal_is_admin());
grant select,insert,update,delete on public.inventory_location_checks to authenticated;
create index if not exists inventory_location_checks_state_idx on public.inventory_location_checks(workspace_id,location_state,checked_at desc);
create index if not exists inventory_location_checks_item_idx on public.inventory_location_checks(item_id) where item_id is not null;
create index if not exists inventory_location_checks_creator_idx on public.inventory_location_checks(created_by) where created_by is not null;

create or replace function public.inventory_reserve_for_order(p_item_id uuid,p_order_id text,p_quantity numeric,p_note text default '')
returns numeric language plpgsql security invoker set search_path=public,pg_temp as $$
declare v_balance numeric;
begin
 if not public.portal_is_admin() then raise exception 'Alleen plannerbeheerders mogen voorraad koppelen.' using errcode='42501'; end if;
 if p_quantity is null or p_quantity<=0 then raise exception 'Aantal moet groter zijn dan nul.'; end if;
 select quantity into v_balance from public.inventory_items where id=p_item_id and workspace_id='ralabaster' and status='active' for update;
 if v_balance is null then raise exception 'Voorraadpartij niet gevonden.'; end if;
 if p_quantity>v_balance then raise exception 'Onvoldoende voorraad. Beschikbaar: %.',v_balance; end if;
 v_balance:=v_balance-p_quantity;
 update public.inventory_items set quantity=v_balance,status=case when v_balance=0 then 'depleted' else 'active' end,updated_at=now() where id=p_item_id;
 insert into public.inventory_movements(item_id,movement_type,quantity_delta,balance_after,order_id,note,created_by) values(p_item_id,'reserve',-p_quantity,v_balance,p_order_id,coalesce(p_note,''),(select auth.uid()));
 return v_balance;
end $$;
revoke all on function public.inventory_reserve_for_order(uuid,text,numeric,text) from public,anon;
grant execute on function public.inventory_reserve_for_order(uuid,text,numeric,text) to authenticated;

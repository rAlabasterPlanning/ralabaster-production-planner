begin;

alter table public.inventory_items
  add column if not exists previous_item_id uuid references public.inventory_items(id) on delete set null,
  add column if not exists comparison_status text not null default 'new',
  add column if not exists comparison_details jsonb not null default '{}'::jsonb;

alter table public.inventory_items drop constraint if exists inventory_items_comparison_status_check;
alter table public.inventory_items add constraint inventory_items_comparison_status_check
  check (comparison_status in ('new','matches','review'));
create index if not exists inventory_items_previous_item_idx on public.inventory_items(previous_item_id);

create or replace function public.inventory_approve_count(p_item_id uuid)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare v_uid uuid:=(select auth.uid());v_item public.inventory_items%rowtype;
begin
 if v_uid is null or not public.portal_is_admin() then raise exception 'Geen beheerderstoegang.' using errcode='42501'; end if;
 select * into v_item from public.inventory_items where id=p_item_id and workspace_id='ralabaster' for update;
 if v_item.id is null then raise exception 'Voorraadtelling niet gevonden.'; end if;
 if v_item.review_status<>'pending' then return v_item.id; end if;
 if v_item.previous_item_id is not null then
  update public.inventory_items set status='depleted',updated_at=now()
  where id=v_item.previous_item_id and id<>v_item.id;
 end if;
 update public.inventory_items set review_status='approved',reviewed_at=now(),reviewed_by=v_uid where id=v_item.id;
 return v_item.id;
end $$;
revoke all on function public.inventory_approve_count(uuid) from public,anon;
grant execute on function public.inventory_approve_count(uuid) to authenticated;

commit;

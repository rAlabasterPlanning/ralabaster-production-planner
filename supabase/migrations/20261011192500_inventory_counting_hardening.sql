create index if not exists inventory_location_checks_item_idx on public.inventory_location_checks(item_id) where item_id is not null;
create index if not exists inventory_location_checks_creator_idx on public.inventory_location_checks(created_by) where created_by is not null;
alter function public.inventory_reserve_for_order(uuid,text,numeric,text) security invoker;

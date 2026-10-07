create index if not exists inventory_items_created_by_idx on public.inventory_items(created_by);
create index if not exists inventory_movements_created_by_idx on public.inventory_movements(created_by);

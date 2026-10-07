alter table public.inventory_items
 add column if not exists semi_finished_type text not null default '';

create index if not exists inventory_items_semi_finished_type_idx
 on public.inventory_items(workspace_id,semi_finished_type)
 where category='semi' and status='active';

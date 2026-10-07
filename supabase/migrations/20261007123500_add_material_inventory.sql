create table if not exists public.inventory_items (
 id uuid primary key default gen_random_uuid(), workspace_id text not null default 'ralabaster', stock_number text not null,
 category text not null check (category in ('raw','slab','semi')), description text not null default '', material text not null default 'Alabaster',
 quantity numeric not null default 0 check (quantity >= 0), unit text not null default 'stuks', weight_kg numeric check (weight_kg is null or weight_kg >= 0),
 length_mm numeric check (length_mm is null or length_mm >= 0), width_mm numeric check (width_mm is null or width_mm >= 0), height_mm numeric check (height_mm is null or height_mm >= 0), diameter_mm numeric check (diameter_mm is null or diameter_mm >= 0),
 rack text not null default '', shelf text not null default '', position text not null default '', photo_paths text[] not null default '{}', notes text not null default '',
 status text not null default 'active' check (status in ('active','depleted','blocked')), created_by uuid references auth.users(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(workspace_id,stock_number)
);
create table if not exists public.inventory_product_links (
 item_id uuid not null references public.inventory_items(id) on delete cascade, product_template_id text not null,
 units_per_item numeric not null default 0 check (units_per_item >= 0), confidence numeric not null default 0 check (confidence between 0 and 1),
 source text not null default 'manual' check (source in ('manual','dimensions','photo')), accepted boolean not null default false, created_at timestamptz not null default now(),
 primary key(item_id,product_template_id)
);
create table if not exists public.inventory_movements (
 id bigint generated always as identity primary key, item_id uuid not null references public.inventory_items(id) on delete cascade,
 movement_type text not null check (movement_type in ('opening','count','receipt','reserve','release','consume','adjust')), quantity_delta numeric not null default 0,
 balance_after numeric not null check (balance_after >= 0), order_id text, note text not null default '', photo_path text, created_by uuid references auth.users(id), created_at timestamptz not null default now()
);
create index if not exists inventory_items_category_location_idx on public.inventory_items(workspace_id,category,rack,shelf,position);
create index if not exists inventory_movements_item_created_idx on public.inventory_movements(item_id,created_at desc);
create index if not exists inventory_product_links_product_idx on public.inventory_product_links(product_template_id) where accepted;
alter table public.inventory_items enable row level security;
alter table public.inventory_product_links enable row level security;
alter table public.inventory_movements enable row level security;
create policy inventory_items_admin_all on public.inventory_items for all to authenticated using (public.portal_is_admin()) with check (public.portal_is_admin());
create policy inventory_links_admin_all on public.inventory_product_links for all to authenticated using (public.portal_is_admin()) with check (public.portal_is_admin());
create policy inventory_movements_admin_all on public.inventory_movements for all to authenticated using (public.portal_is_admin()) with check (public.portal_is_admin());
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('inventory-photos','inventory-photos',false,10485760,array['image/jpeg','image/png','image/webp'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
create policy inventory_photos_admin_select on storage.objects for select to authenticated using (bucket_id='inventory-photos' and public.portal_is_admin());
create policy inventory_photos_admin_insert on storage.objects for insert to authenticated with check (bucket_id='inventory-photos' and public.portal_is_admin());
create policy inventory_photos_admin_update on storage.objects for update to authenticated using (bucket_id='inventory-photos' and public.portal_is_admin()) with check (bucket_id='inventory-photos' and public.portal_is_admin());
create policy inventory_photos_admin_delete on storage.objects for delete to authenticated using (bucket_id='inventory-photos' and public.portal_is_admin());

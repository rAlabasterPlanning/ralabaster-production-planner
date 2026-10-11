create extension if not exists pgcrypto;

alter table public.inventory_items
 add column if not exists shape_type text,
 add column if not exists transparency_pct numeric,
 add column if not exists calculated_weight_kg numeric,
 add column if not exists contour_dxf text,
 add column if not exists capture_source text not null default 'planner';

alter table public.inventory_items drop constraint if exists inventory_items_shape_type_check;
alter table public.inventory_items add constraint inventory_items_shape_type_check check (shape_type is null or shape_type in ('disc','cylinder','block','irregular'));
alter table public.inventory_items drop constraint if exists inventory_items_transparency_pct_check;
alter table public.inventory_items add constraint inventory_items_transparency_pct_check check (transparency_pct is null or transparency_pct between 0 and 100);

create table if not exists public.inventory_capture_links (
 id uuid primary key default gen_random_uuid(),
 workspace_id text not null default 'ralabaster',
 label text not null default 'Personeel voorraadinvoer',
 token_hash text not null unique,
 active boolean not null default true,
 expires_at timestamptz,
 last_used_at timestamptz,
 created_by uuid references auth.users(id),
 created_at timestamptz not null default now()
);
alter table public.inventory_capture_links enable row level security;
create policy inventory_capture_links_admin_all on public.inventory_capture_links for all to authenticated using (public.portal_is_admin()) with check (public.portal_is_admin());

create or replace function public.inventory_capture_token_valid(p_token text)
returns boolean language sql security definer set search_path=public,extensions as $$
 select exists(select 1 from public.inventory_capture_links where token_hash=encode(digest(p_token,'sha256'),'hex') and active and (expires_at is null or expires_at>now()));
$$;
revoke all on function public.inventory_capture_token_valid(text) from public;
grant execute on function public.inventory_capture_token_valid(text) to anon,authenticated;

create index if not exists inventory_capture_links_active_idx on public.inventory_capture_links(workspace_id,active) where active;
create index if not exists inventory_items_matching_dims_idx on public.inventory_items(workspace_id,category,shape_type,diameter_mm,length_mm,width_mm,height_mm) where status='active';


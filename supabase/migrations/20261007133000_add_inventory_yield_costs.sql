alter table public.inventory_items
 add column if not exists density_kg_dm3 numeric not null default 2.70,
 add column if not exists purchase_total_eur numeric,
 add column if not exists price_per_kg_eur numeric;

alter table public.inventory_items
 add constraint inventory_density_positive check (density_kg_dm3 > 0),
 add constraint inventory_purchase_total_nonnegative check (purchase_total_eur is null or purchase_total_eur >= 0),
 add constraint inventory_price_per_kg_nonnegative check (price_per_kg_eur is null or price_per_kg_eur >= 0);

alter table public.inventory_product_links
 add column if not exists material_kg_per_unit numeric,
 add column if not exists material_cost_per_unit numeric,
 add column if not exists yield_kg_pct numeric,
 add column if not exists yield_value_pct numeric;

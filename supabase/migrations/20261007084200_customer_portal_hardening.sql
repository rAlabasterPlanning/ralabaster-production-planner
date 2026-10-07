-- Harden trigger-only functions and keep portal queries efficient.
revoke execute on function public.portal_sync_order_trigger() from public, anon, authenticated;
revoke execute on function public.portal_sync_metadata_trigger() from public, anon, authenticated;
revoke execute on function public.sync_planner_task_order_active() from public, anon, authenticated;

create index if not exists portal_order_lines_product_idx on public.portal_order_lines(product_id);
create index if not exists portal_orders_created_by_idx on public.portal_orders(created_by);
create index if not exists portal_product_requests_created_by_idx on public.portal_product_requests(created_by);

-- FOR ALL also participates in SELECT. Split writes so each table has one SELECT policy.
drop policy if exists portal_customers_admin_write on public.portal_customers;
create policy portal_customers_admin_insert on public.portal_customers for insert to authenticated with check (public.portal_is_admin());
create policy portal_customers_admin_update on public.portal_customers for update to authenticated using (public.portal_is_admin()) with check (public.portal_is_admin());
create policy portal_customers_admin_delete on public.portal_customers for delete to authenticated using (public.portal_is_admin());

drop policy if exists portal_users_admin_write on public.portal_customer_users;
create policy portal_users_admin_insert on public.portal_customer_users for insert to authenticated with check (public.portal_is_admin());
create policy portal_users_admin_update on public.portal_customer_users for update to authenticated using (public.portal_is_admin()) with check (public.portal_is_admin());
create policy portal_users_admin_delete on public.portal_customer_users for delete to authenticated using (public.portal_is_admin());

drop policy if exists portal_products_admin_write on public.portal_products;
create policy portal_products_admin_insert on public.portal_products for insert to authenticated with check (public.portal_is_admin());
create policy portal_products_admin_update on public.portal_products for update to authenticated using (public.portal_is_admin()) with check (public.portal_is_admin());
create policy portal_products_admin_delete on public.portal_products for delete to authenticated using (public.portal_is_admin());

drop policy if exists portal_orders_admin_write on public.portal_orders;
create policy portal_orders_admin_insert on public.portal_orders for insert to authenticated with check (public.portal_is_admin());
create policy portal_orders_admin_update on public.portal_orders for update to authenticated using (public.portal_is_admin()) with check (public.portal_is_admin());
create policy portal_orders_admin_delete on public.portal_orders for delete to authenticated using (public.portal_is_admin());

drop policy if exists portal_order_lines_admin_write on public.portal_order_lines;
create policy portal_order_lines_admin_insert on public.portal_order_lines for insert to authenticated with check (public.portal_is_admin());
create policy portal_order_lines_admin_update on public.portal_order_lines for update to authenticated using (public.portal_is_admin()) with check (public.portal_is_admin());
create policy portal_order_lines_admin_delete on public.portal_order_lines for delete to authenticated using (public.portal_is_admin());

drop policy if exists portal_quotes_admin_write on public.portal_quotes;
create policy portal_quotes_admin_insert on public.portal_quotes for insert to authenticated with check (public.portal_is_admin());
create policy portal_quotes_admin_update on public.portal_quotes for update to authenticated using (public.portal_is_admin()) with check (public.portal_is_admin());
create policy portal_quotes_admin_delete on public.portal_quotes for delete to authenticated using (public.portal_is_admin());

drop policy if exists portal_quote_lines_admin_write on public.portal_quote_lines;
create policy portal_quote_lines_admin_insert on public.portal_quote_lines for insert to authenticated with check (public.portal_is_admin());
create policy portal_quote_lines_admin_update on public.portal_quote_lines for update to authenticated using (public.portal_is_admin()) with check (public.portal_is_admin());
create policy portal_quote_lines_admin_delete on public.portal_quote_lines for delete to authenticated using (public.portal_is_admin());

drop policy if exists portal_requests_admin_write on public.portal_product_requests;
create policy portal_requests_admin_insert on public.portal_product_requests for insert to authenticated with check (public.portal_is_admin());
create policy portal_requests_admin_update on public.portal_product_requests for update to authenticated using (public.portal_is_admin()) with check (public.portal_is_admin());
create policy portal_requests_admin_delete on public.portal_product_requests for delete to authenticated using (public.portal_is_admin());

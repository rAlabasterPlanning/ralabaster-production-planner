begin;

create table if not exists public.portal_order_change_requests (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.portal_orders(id) on delete cascade,
  customer_id text not null references public.portal_customers(customer_id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete restrict,
  requested_delivery_date date,
  line_changes jsonb not null default '[]'::jsonb,
  message text,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  admin_response text,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null
);

create index if not exists portal_order_change_requests_customer_idx
  on public.portal_order_change_requests(customer_id,created_at desc);
create index if not exists portal_order_change_requests_order_idx
  on public.portal_order_change_requests(order_id,created_at desc);

alter table public.portal_order_change_requests enable row level security;

create policy portal_order_change_requests_read on public.portal_order_change_requests
  for select to authenticated
  using (public.portal_is_admin() or customer_id=public.portal_current_customer_id());
create policy portal_order_change_requests_admin_update on public.portal_order_change_requests
  for update to authenticated
  using (public.portal_is_admin()) with check (public.portal_is_admin());
create policy portal_order_change_requests_admin_delete on public.portal_order_change_requests
  for delete to authenticated using (public.portal_is_admin());

revoke all on public.portal_order_change_requests from anon;
grant select,update,delete on public.portal_order_change_requests to authenticated;

create or replace function public.portal_request_order_change(
  p_order_id uuid,
  p_requested_delivery_date date,
  p_line_changes jsonb,
  p_message text
) returns uuid
language plpgsql security definer
set search_path=public,pg_temp
as $$
declare
  v_uid uuid := (select auth.uid());
  v_customer text;
  v_id uuid := gen_random_uuid();
  v_change jsonb;
  v_line uuid;
  v_quantity numeric;
begin
  if v_uid is null then raise exception 'Aanmelding vereist.' using errcode='42501'; end if;
  select customer_id into v_customer from public.portal_customer_users where user_id=v_uid and active;
  if v_customer is null then raise exception 'Geen actief klantaccount.' using errcode='42501'; end if;
  if not exists(
    select 1 from public.portal_orders
    where id=p_order_id and customer_id=v_customer and status not in ('completed','cancelled')
  ) then raise exception 'Deze bestelling kan niet worden gewijzigd.' using errcode='42501'; end if;

  p_line_changes := coalesce(p_line_changes,'[]'::jsonb);
  if jsonb_typeof(p_line_changes) <> 'array' then raise exception 'Ongeldige productregels.'; end if;
  for v_change in select value from jsonb_array_elements(p_line_changes) loop
    begin
      v_line := (v_change->>'line_id')::uuid;
      v_quantity := (v_change->>'quantity')::numeric;
    exception when others then
      raise exception 'Ongeldige productregel.';
    end;
    if v_quantity <= 0 or not exists(
      select 1 from public.portal_order_lines where id=v_line and order_id=p_order_id
    ) then raise exception 'Ongeldige productregel of aantal.'; end if;
  end loop;

  if p_requested_delivery_date is null
     and jsonb_array_length(p_line_changes)=0
     and length(trim(coalesce(p_message,'')))<2
  then raise exception 'Geef aan wat u wilt wijzigen.'; end if;

  insert into public.portal_order_change_requests(
    id,order_id,customer_id,created_by,requested_delivery_date,line_changes,message
  ) values (
    v_id,p_order_id,v_customer,v_uid,p_requested_delivery_date,p_line_changes,nullif(trim(p_message),'')
  );
  return v_id;
end $$;

revoke all on function public.portal_request_order_change(uuid,date,jsonb,text) from public,anon;
grant execute on function public.portal_request_order_change(uuid,date,jsonb,text) to authenticated;

commit;

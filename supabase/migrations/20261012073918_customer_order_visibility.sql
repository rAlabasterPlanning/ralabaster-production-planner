begin;
alter table public.portal_orders add column hidden_from_customer boolean not null default false;
create policy portal_orders_customer_visibility on public.portal_orders as restrictive
 for select to authenticated using (public.portal_is_admin() or not hidden_from_customer);
create policy portal_order_changes_customer_visibility on public.portal_order_change_requests as restrictive
 for select to authenticated using (public.portal_is_admin() or exists(
  select 1 from public.portal_orders o where o.id=portal_order_change_requests.order_id
  and o.customer_id=public.portal_current_customer_id() and not o.hidden_from_customer));

create function public.portal_set_order_visibility(p_order_id uuid,p_customer_id text,p_hidden boolean)
returns void language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 if (select auth.uid()) is null or not public.portal_is_admin() then
  raise exception 'Alleen beheerders mogen orderzichtbaarheid wijzigen.' using errcode='42501';
 end if;
 if p_hidden is null then raise exception 'Zichtbaarheid is verplicht.'; end if;
 update public.portal_orders set hidden_from_customer=p_hidden,updated_at=now()
 where id=p_order_id and customer_id=p_customer_id;
 if not found then raise exception 'Order niet gevonden bij deze klant.'; end if;
end $$;
revoke all on function public.portal_set_order_visibility(uuid,text,boolean) from public,anon;
grant execute on function public.portal_set_order_visibility(uuid,text,boolean) to authenticated;

-- Existing customer-change RPC must also refuse hidden orders, despite its definer privileges.
do $$
declare definition text;
begin
 definition:=pg_get_functiondef('public.portal_request_order_change(uuid,date,jsonb,text)'::regprocedure);
 if position('and not hidden_from_customer' in definition)=0 then
  if position('where id=p_order_id and customer_id=v_customer and status not in' in definition)=0 then
   raise exception 'Onverwachte wijzigingsfunctie; migratie afgebroken.';
  end if;
  execute replace(definition,'where id=p_order_id and customer_id=v_customer and status not in',
   'where id=p_order_id and customer_id=v_customer and not hidden_from_customer and status not in');
 end if;
end $$;
commit;

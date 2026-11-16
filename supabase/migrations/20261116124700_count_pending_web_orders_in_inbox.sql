-- The request inbox also contains submitted web orders awaiting production review.
create or replace function public.planner_new_request_count()
returns bigint language sql stable security invoker set search_path='' as $$
 select count(*) from (
  select 'portal'::text as source,id,status from public.portal_product_requests
  union all select 'acquisition',id,status from public.acquisition_requests where kind='quote'
  union all select 'web_order',id,'new' from public.portal_orders
   where source_order_id is null and status='submitted' and coalesce(cardinality(internal_order_ids),0)=0
 ) r left join public.planner_request_reviews v on v.source=r.source and v.request_id=r.id
 where public.portal_is_admin() and coalesce(v.status,r.status)='new';
$$;
revoke all on function public.planner_new_request_count() from public,anon;
grant execute on function public.planner_new_request_count() to authenticated;

begin;
select set_config('request.jwt.claim.sub',(select user_id::text from public.portal_admins limit 1),true);
set local role authenticated;
do $$
declare before_count bigint; cid text; submitted uuid:=gen_random_uuid(); processed uuid:=gen_random_uuid(); projected uuid:=gen_random_uuid(); member_id uuid;
begin
 select customer_id into cid from public.portal_customers where active limit 1;
 before_count:=public.planner_new_request_count();
 insert into public.portal_orders(id,customer_id,order_no,status) values(submitted,cid,'__WEB_INBOX_PENDING__','submitted');
 assert public.planner_new_request_count()=before_count+1;
 insert into public.portal_orders(id,customer_id,order_no,status,internal_order_ids) values(processed,cid,'__WEB_INBOX_PROCESSED__','submitted',array['__existing_internal_order__']);
 insert into public.portal_orders(id,customer_id,order_no,status,source_order_id) values(projected,cid,'__WEB_INBOX_PROJECTION__','submitted','__planner_projection_'||projected);
 assert public.planner_new_request_count()=before_count+1;
 update public.portal_orders set status='processing' where id=submitted;
 assert public.planner_new_request_count()=before_count;
 select user_id into member_id from public.portal_customer_users u where active and not exists(select 1 from public.portal_admins a where a.user_id=u.user_id) limit 1;
 perform set_config('request.jwt.claim.sub',member_id::text,true);
 assert public.planner_new_request_count()=0;
 assert not has_function_privilege('anon','public.planner_new_request_count()','execute');
end $$;
rollback;
select 'PASS: submitted web orders counted, linked and projected orders excluded, processed requests removed and customer count protected' as result;

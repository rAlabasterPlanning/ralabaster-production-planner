-- Run in a transaction: no test requests, notifications, or activity survive.
begin;
do $$
declare u public.portal_customer_users%rowtype; q uuid:=gen_random_uuid();o uuid:=gen_random_uuid();p uuid:=gen_random_uuid();a uuid:=gen_random_uuid();j public.quote_request_notifications%rowtype;
begin
 select * into u from public.portal_customer_users where active limit 1;
 if u.user_id is null then raise exception 'Need an existing portal member for transactional test';end if;
 insert into public.portal_product_requests(id,customer_id,created_by,request_type,product_name,description) values
 (q,u.customer_id,u.user_id,'quote','Transactional test','Rollback test only'),
 (o,u.customer_id,u.user_id,'order','Transactional test','Rollback test only');
 if (select count(*) from public.quote_request_notifications where request_id=q)<>1 then raise exception 'Quote not queued exactly once';end if;
 if exists(select 1 from public.quote_request_notifications where request_id=o) then raise exception 'Order incorrectly queued';end if;
 update public.portal_product_requests set status='reviewing' where id=q;
 if (select count(*) from public.quote_request_notifications where request_id=q)<>1 then raise exception 'Update duplicated queue';end if;
 insert into public.acquisition_prospects(id,domain,company,review_day,data) values(p,p::text||'.example.test','Transactional fixture',current_date,'{}');
 insert into public.acquisition_requests(id,prospect_id,request_id,kind,data) values(a,p,gen_random_uuid(),'quote','{"company":"Transactional fixture"}');
 if (select count(*) from public.quote_request_notifications where request_id=a)<>1 then raise exception 'Acquisition quote not queued';end if;
 if has_table_privilege('authenticated','public.quote_request_notifications','SELECT') or has_function_privilege('authenticated','public.claim_quote_notification()','EXECUTE') then raise exception 'Queue exposed to browser';end if;
 if not (select relrowsecurity from pg_class where oid='public.planner_request_reviews'::regclass) then raise exception 'Review RLS missing';end if;
 -- Isolate this test's work when checking the atomic claim, without persisting any updates.
 update public.quote_request_notifications set available_at=now()+interval '1 day' where request_id not in(q,a);
 select * into j from public.claim_quote_notification();
 if j.request_id not in(q,a) or j.status<>'claimed' or j.attempts<>1 then raise exception 'Claim failed';end if;
 if (select count(*) from public.claim_quote_notification())<>1 then raise exception 'Second item not claimable';end if;
 if exists(select 1 from public.claim_quote_notification()) then raise exception 'Claim duplicated work';end if;
end $$;
set local role authenticated;
do $$ begin
 if exists(select 1 from public.planner_request_reviews) then raise exception 'Unauthenticated role read reviews';end if;
 if public.planner_new_request_count()<>0 then raise exception 'Non-admin read request count';end if;
end $$;
reset role;
select 'quote queue, claim, filtering and RLS passed; rolling back fixtures' as result;
rollback;

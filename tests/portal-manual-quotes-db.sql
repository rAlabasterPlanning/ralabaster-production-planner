-- Run after the migration, inside a rollback-only transaction.
begin;
set local statement_timeout='20s';
create temporary table manual_quote_fixture(workspace_id text,data jsonb) on commit drop;
create trigger manual_quote_fixture_sync after insert on manual_quote_fixture
 for each row execute function public.portal_sync_metadata_trigger();
do $$
declare baseline jsonb; fixture jsonb; cid text; foreign_cid text; member_id uuid; portal_id uuid;
begin
 select data into baseline from public.planner_shared_state where workspace_id='ralabaster';
 select customer_id,user_id into cid,member_id from public.portal_customer_users where active limit 1;
 select customer_id into foreign_cid from public.portal_customers where customer_id<>cid limit 1;
 assert cid is not null and foreign_cid is not null;
 fixture:=jsonb_build_object('workspace','ralabaster','customers',baseline->'customers','quotes',jsonb_build_array(
  jsonb_build_object('id','__manual_one','quoteNo','__MANUAL_PORTAL__','customerId',cid,'status','concept','lineNo',1,'name','Manual one','qty',2,'saleUnit',10,'total',20,'created','2026-11-11'),
  jsonb_build_object('id','__manual_two','quoteNo','__MANUAL_PORTAL__','customerId',cid,'status','concept','lineNo',2,'name','Manual two','qty',3,'saleUnit',15,'total',45,'created','2026-11-11'),
  jsonb_build_object('id','__foreign','quoteNo','__FOREIGN_PORTAL__','customerId',foreign_cid,'status','concept','qty',1,'total',10),
  jsonb_build_object('id','__unknown','quoteNo','__UNKNOWN_PORTAL__','customerId','__no_such_customer','status','concept'),
  jsonb_build_object('id','__request','quoteNo','AAN-__REQUEST__','sourceRequest','portal:__REQUEST__','customerId',cid,'status','concept')
 ));
 insert into manual_quote_fixture values('another_workspace',fixture);
 assert not exists(select 1 from public.portal_quotes where quote_no='__MANUAL_PORTAL__');
 insert into manual_quote_fixture values('ralabaster',fixture);
 select id into portal_id from public.portal_quotes where customer_id=cid and quote_no='__MANUAL_PORTAL__';
 assert portal_id is not null;
 assert (select status='concept' and total=65 from public.portal_quotes where id=portal_id);
 assert (select count(*)=2 and sum(line_total)=65 from public.portal_quote_lines where quote_id=portal_id);
 assert not exists(select 1 from public.portal_quotes where quote_no in ('__UNKNOWN_PORTAL__','AAN-__REQUEST__'));
 -- A second sync neither duplicates lines nor adds to the previous total.
 insert into manual_quote_fixture values('ralabaster',fixture);
 assert (select count(*)=1 and min(total)=65 from public.portal_quotes where quote_no='__MANUAL_PORTAL__' and customer_id=cid);
 assert (select count(*)=2 from public.portal_quote_lines where quote_id=portal_id);
 update public.portal_quotes set status='customer_declined' where id=portal_id;
 insert into manual_quote_fixture values('ralabaster',fixture);
 assert (select status='customer_declined' from public.portal_quotes where id=portal_id);
 assert (select data=baseline from public.planner_shared_state where workspace_id='ralabaster');
 assert not has_function_privilege('authenticated','public.portal_sync_metadata_trigger()','execute');
 assert not has_function_privilege('anon','public.portal_sync_metadata_trigger()','execute');
 perform set_config('request.jwt.claim.sub',member_id::text,true);
 execute 'set local role authenticated';
 assert exists(select 1 from public.portal_quotes where id=portal_id);
 assert not exists(select 1 from public.portal_quotes where quote_no='__FOREIGN_PORTAL__');
 assert (select count(*)=2 from public.portal_quote_lines where quote_id=portal_id);
end $$;
rollback;
select 'PASS: manual quotes, grouping, totals, retry, decisions, unchanged planner state and customer isolation' as result;

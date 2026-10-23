-- Test synthetic acceptance only. Every write, including portal projections, is rolled back.
begin;
set local statement_timeout='15s';
select set_config('request.jwt.claim.sub',(select user_id::text from public.portal_admins limit 1),true);
set local role authenticated;
do $$
declare q jsonb; lines jsonb; choices jsonb; result jsonb; retry jsonb; baseline jsonb; cid text; o jsonb;
begin
 select customer_id into cid from public.portal_customers limit 1;
 assert cid is not null;
 q:=jsonb_build_object('id','__po_accept_line','quoteNo','__PO_ACCEPT_TEST__','lineNo',1,'customerId',cid,'customerReference','Original reference','name','Synthetic PO test','qty',2,'saleUnit',100,'materialCost',10,'materialMode','unit','customerReadyDate','2026-11-01','estimatedReadyDate','2026-11-10','ops','[]'::jsonb,'customerSnapshot','{}'::jsonb);
 lines:=jsonb_build_array(q,q||'{"id":"__po_accept_line2","lineNo":2}'::jsonb);
 update public.planner_shared_state set data=jsonb_set(data,'{quotes}',coalesce(data->'quotes','[]')||lines) where workspace_id='ralabaster';
 select data->'quotes' into baseline from public.planner_shared_state where workspace_id='ralabaster';
 choices:='[{"lineId":"__po_accept_line","qty":2,"tierQty":2,"confirmed":false,"reason":""},{"lineId":"__po_accept_line2","qty":2,"tierQty":2,"confirmed":false,"reason":""}]';
 result:=public.planner_accept_quote_v2('ralabaster','__PO_ACCEPT_TEST__',lines,choices,' PO-CUSTOMER-123 ','2026-12-01','2026-12-15');
 assert jsonb_array_length(result->'orders')=2;
 for o in select value from jsonb_array_elements(result->'orders') loop
  assert o->>'customerReference'='PO-CUSTOMER-123';
  assert o->>'customerReadyDate'='2026-12-01';
  assert o->>'requestedDeliveryDate'='2026-12-01';
  assert o->>'communicatedDeadline'='2026-12-15';
  assert o->>'deadline'='2026-12-15';
  assert o->'sourceQuoteSnapshot'->>'customerReference'='Original reference';
  assert exists(select 1 from public.portal_orders where source_order_id=o->>'id' and customer_reference='PO-CUSTOMER-123' and requested_delivery_date='2026-12-01' and confirmed_delivery_date='2026-12-15');
 end loop;
 assert (select data->'quotes' from public.planner_shared_state where workspace_id='ralabaster')=baseline;
 retry:=public.planner_accept_quote_v2('ralabaster','__PO_ACCEPT_TEST__',lines,choices,'PO-CUSTOMER-123','2026-12-01','2026-12-15');
 assert (retry->>'existing')::boolean;
 assert (select count(*) from public.planner_orders_v2 where data->>'sourceQuoteNo'='__PO_ACCEPT_TEST__')=2;
 begin
  perform public.planner_accept_quote_v2('ralabaster','__PO_ACCEPT_TEST__',lines,choices,'DIFFERENT','2026-12-01','2026-12-15');
  raise exception 'Changed PO accepted on retry';
 exception when raise_exception then if sqlerrm not like '%andere ordergegevens%' then raise; end if;end;
 begin
  perform public.planner_accept_quote_v2('ralabaster','__PO_ACCEPT_TEST__',lines,choices,'PO-CUSTOMER-123','2026-12-02','2026-12-15');
  raise exception 'Changed date accepted on retry';
 exception when raise_exception then if sqlerrm not like '%andere ordergegevens%' then raise; end if;end;
 assert not has_function_privilege('anon','public.planner_accept_quote_v2(text,text,jsonb,jsonb,text,date,date)','execute');
 assert not (select prosecdef from pg_proc where oid='public.planner_accept_quote_v2(text,text,jsonb,jsonb,text,date,date)'::regprocedure);
end $$;
rollback;
select 'PASS: PO, two delivery dates, all product lines, portal projection, immutable quote, retry and permissions' as result;

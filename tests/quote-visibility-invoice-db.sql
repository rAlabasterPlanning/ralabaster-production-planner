-- All synthetic quotations and invoice changes roll back.
begin;
set local statement_timeout='30s';
select set_config('request.jwt.claim.sub',(select user_id::text from public.portal_admins limit 1),true);
set local role authenticated;
do $$
declare baseline jsonb; admin_id uuid:=auth.uid(); cid text; member_id uuid; other_cid text; pid uuid; other_pid uuid; fixture jsonb; reply jsonb; original_order jsonb; order_id text;
begin
 select customer_id,user_id into cid,member_id from public.portal_customer_users u where active and not exists(select 1 from public.portal_admins a where a.user_id=u.user_id) limit 1;
 select customer_id into other_cid from public.portal_customers where customer_id<>cid limit 1;
 assert cid is not null and other_cid is not null;
 select data into baseline from public.planner_shared_state where workspace_id='ralabaster';
 fixture:=jsonb_build_array(
 jsonb_build_object('id','__visibility_one','customerId',cid,'quoteNo','__VISIBILITY_TEST__','lineNo',1,'status','concept','qty',2,'saleUnit',10,'total',20),
 jsonb_build_object('id','__visibility_two','customerId',cid,'quoteNo','__VISIBILITY_TEST__','lineNo',2,'status','concept','qty',3,'saleUnit',10,'total',30),
 jsonb_build_object('id','__visibility_other','customerId',other_cid,'quoteNo','__VISIBILITY_TEST__','lineNo',1,'status','concept','qty',1,'saleUnit',10,'total',10));
 update public.planner_shared_state set data=jsonb_set(data,'{quotes}',(data->'quotes')||fixture) where workspace_id='ralabaster';
 select id into pid from public.portal_quotes where customer_id=cid and quote_no='__VISIBILITY_TEST__';
 select id into other_pid from public.portal_quotes where customer_id=other_cid and quote_no='__VISIBILITY_TEST__';
 assert pid is not null and other_pid is not null;
 reply:=public.portal_set_quote_visibility(cid,'__VISIBILITY_TEST__',false);
 assert reply->'visible'='false'::jsonb;
 assert (select hidden_from_customer and total=50 and status='concept' from public.portal_quotes where id=pid);
 assert (select not hidden_from_customer and total=10 from public.portal_quotes where id=other_pid);
 assert (select count(*)=2 from public.portal_quote_lines where quote_id=pid);
 assert (select jsonb_agg(q-'portalVisible' order by n)=fixture from public.planner_shared_state s,jsonb_array_elements(s.data->'quotes') with ordinality a(q,n) where s.workspace_id='ralabaster' and q->>'id' like '__visibility_%');
 perform set_config('request.jwt.claim.sub',member_id::text,true);
 assert not exists(select 1 from public.portal_quotes where id in (pid,other_pid));
 assert not exists(select 1 from public.portal_quote_lines where quote_id in (pid,other_pid));
 assert not public.portal_quote_decision(pid,'accepted');
 begin
  perform public.portal_set_quote_visibility(cid,'__VISIBILITY_TEST__',true);
  raise exception 'Customer changed quote visibility';
 exception when insufficient_privilege then null;
 end;
 begin
  perform public.planner_set_invoice_sent('__any_order__',true);
  raise exception 'Customer changed invoice status';
 exception when insufficient_privilege then null;
 end;
 perform set_config('request.jwt.claim.sub',admin_id::text,true);
 perform public.portal_set_quote_visibility(cid,'__VISIBILITY_TEST__',true);
 assert (select not hidden_from_customer and status='concept' and total=50 from public.portal_quotes where id=pid);
 begin
  perform public.portal_set_quote_visibility('__wrong_customer__','__VISIBILITY_TEST__',false);
  raise exception 'Wrong customer accepted';
 exception when raise_exception then if sqlerrm<>'Offerte niet gevonden bij deze klant.' then raise; end if;
 end;
 select data,planner_orders_v2.order_id into original_order,order_id from public.planner_orders_v2 where workspace_id='ralabaster' and not deleted and not active limit 1;
 assert order_id is not null;
 reply:=public.planner_set_invoice_sent(order_id,true);
 assert reply->'invoiceSent'='true'::jsonb and reply->>'invoiceSentAt' is not null;
 assert reply-array['invoiceSent','invoiceSentAt','invoiceStatusUpdatedAt']=original_order-array['invoiceSent','invoiceSentAt','invoiceStatusUpdatedAt'];
 reply:=public.planner_set_invoice_sent(order_id,false);
 assert reply->'invoiceSent'='false'::jsonb and reply->>'invoiceSentAt' is null;
 assert reply-array['invoiceSent','invoiceSentAt','invoiceStatusUpdatedAt']=original_order-array['invoiceSent','invoiceSentAt','invoiceStatusUpdatedAt'];
 perform set_config('request.jwt.claim.sub',member_id::text,true);
 assert exists(select 1 from public.portal_quotes where id=pid);
 assert (select count(*)=2 from public.portal_quote_lines where quote_id=pid);
 assert not exists(select 1 from public.portal_quotes where id=other_pid);
end $$;
rollback;
select 'PASS: quote hide/show, all product lines, same-number customer isolation, hidden decisions blocked, admin-only changes, invoice on/off and unchanged order fields' as result;

begin;
set local statement_timeout='30s';
select set_config('request.jwt.claim.sub',(select user_id::text from public.portal_admins limit 1),true);
set local role authenticated;
do $$
declare oid text:='__reopen_'||gen_random_uuid(); rid uuid:=gen_random_uuid(); original jsonb; task_original jsonb; r jsonb; customer text; member_id uuid;
begin
 select customer_id into customer from public.portal_customers where active limit 1;
 original:=jsonb_build_object('id',oid,'orderNo','REOPEN-TEST','customerId',customer,'product','Test','qty',10,'saleUnit',25,'active',false,'closed',true,'status','completed','completedAt','2026-11-10T10:00:00Z','orderCompletionUpdatedAt','2026-11-10T10:00:00Z','completedQty',10,'completedRevenue',250,'postCalculationCheckedAt','2026-11-10T10:00:00Z','financialCloseoutAt','2026-11-10T10:00:00Z','invoiceSent',true,'invoiceSentAt','2026-11-10T11:00:00Z','packingSlipSentAt','2026-11-10T12:00:00Z','deliveries',jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'qty',10)),'deliveredQty',10,'backorderQty',0);
 insert into public.planner_orders_v2(workspace_id,order_id,order_no,status,active,data) values('ralabaster',oid,'REOPEN-TEST','completed',false,original);
 task_original:=jsonb_build_object('id',oid||'_t','orderId',oid,'seq',1,'name','Polijsten','machine','Polijsten','status','done','actual',42,'doneQty',10,'estimate',30,'completedAt','2026-11-10','completedAtDT','2026-11-10T10:00:00Z','taskProgressUpdatedAt','2026-11-10T10:00:00Z');
 insert into public.planner_tasks_v2(workspace_id,task_id,order_id,seq,status,order_active,data) values('ralabaster',oid||'_t',oid,1,'done',false,task_original),('ralabaster',oid||'_t2',oid,2,'done',false,task_original||jsonb_build_object('id',oid||'_t2','seq',2,'name','Inpakken'));
 begin
  perform public.planner_reopen_order_v1(oid,'',oid||'_t',rid,original->>'orderCompletionUpdatedAt');raise exception 'TEST blank reason allowed';
 exception when raise_exception then if sqlerrm not like 'Vul een reden%' then raise; end if; end;
 begin
  perform public.planner_reopen_order_v1(oid,'Herstel','__foreign_task__',rid,original->>'orderCompletionUpdatedAt');raise exception 'TEST foreign task allowed';
 exception when raise_exception then if sqlerrm not like 'Deze productiestap hoort niet%' then raise; end if; end;
 begin
  perform public.planner_reopen_order_v1(oid,'Herstel',oid||'_t',rid,'old revision');raise exception 'TEST stale revision allowed';
 exception when raise_exception then if sqlerrm not like 'De order is intussen gewijzigd%' then raise; end if; end;
 r:=public.planner_reopen_order_v1(oid,'Opnieuw polijsten',oid||'_t',rid,original->>'orderCompletionUpdatedAt');
 assert r#>>'{order,active}'='true' and r#>>'{order,closed}'='false' and r#>>'{order,status}'='in_progress';
 assert r#>>'{order,completedAt}' is null and r#>>'{order,postCalculationCheckedAt}' is null;
 assert r#>>'{order,lastCompletedAt}'=original->>'completedAt';
 assert r#>'{order,deliveries}'=original->'deliveries' and r#>>'{order,deliveredQty}'='10';
 assert r#>>'{order,invoiceSent}'='true' and r#>>'{order,invoiceSentAt}'=original->>'invoiceSentAt';
 assert r#>>'{order,packingSlipSentAt}'=original->>'packingSlipSentAt';
 assert r#>'{order,reopenHistory,0,previousTask}'=task_original;
 assert (select data->>'status'='open' and data->>'actual'='42' and data->>'doneQty'='10' and order_active from public.planner_tasks_v2 where task_id=oid||'_t' and workspace_id='ralabaster');
 assert (select status='done' and order_active from public.planner_tasks_v2 where task_id=oid||'_t2' and workspace_id='ralabaster');
 assert (select status='in_progress' from public.portal_orders where source_order_id=oid and customer_id=customer);
 r:=public.planner_reopen_order_v1(oid,'Opnieuw polijsten',oid||'_t',rid,original->>'orderCompletionUpdatedAt');
 assert jsonb_array_length(r#>'{order,reopenHistory}')=1;
 -- Stale pre-reopen saves cannot re-archive the order or erase its history.
 update public.planner_orders_v2 set active=false,status='completed',data=original where workspace_id='ralabaster' and order_id=oid;
 assert (select active and status='in_progress' and jsonb_array_length(data->'reopenHistory')=1 from public.planner_orders_v2 where workspace_id='ralabaster' and order_id=oid);
 -- Another explicit closeout is allowed and an old reopening request stays closed.
 update public.planner_orders_v2 set active=false,status='completed',data=data||jsonb_build_object('active',false,'closed',true,'status','completed','completedAt','2099-01-01T00:00:00Z','orderCompletionUpdatedAt','2099-01-01T00:00:00Z') where workspace_id='ralabaster' and order_id=oid;
 begin
  perform public.planner_reopen_order_v1(oid,'Opnieuw polijsten',oid||'_t',rid,original->>'orderCompletionUpdatedAt');raise exception 'TEST retry reopens reclosed order';
 exception when raise_exception then if sqlerrm not like 'Deze heropening is inmiddels weer afgerond%' then raise; end if; end;
 r:=public.planner_reopen_order_v1(oid,'Administratieve correctie',null,gen_random_uuid(),'2099-01-01T00:00:00Z');
 assert r#>>'{order,status}'='confirmed' and jsonb_array_length(r#>'{order,reopenHistory}')=2;
 select user_id into member_id from public.portal_customer_users u where active and not exists(select 1 from public.portal_admins a where a.user_id=u.user_id) limit 1;
 perform set_config('request.jwt.claim.sub',member_id::text,true);
 begin
  perform public.planner_reopen_order_v1(oid,'Not allowed',null,gen_random_uuid(),null);raise exception 'TEST customer reopens order';
 exception when insufficient_privilege then null; end;
 assert not has_function_privilege('anon','public.planner_reopen_order_v1(text,text,text,uuid,text)','execute');
end $$;
rollback;
select 'PASS: reopening, optional route step, preserved times/counts/invoice/delivery, customer portal, retry, stale browser, re-close and admin-only access' as result;

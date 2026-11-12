begin;
set local statement_timeout='30s';
select set_config('request.jwt.claim.sub',(select user_id::text from public.portal_admins limit 1),true);
set local role authenticated;
do $$
declare oid text:='__overdelivery_'||gen_random_uuid(); rid uuid:=gen_random_uuid(); r jsonb; source jsonb; first_packing jsonb; member_id uuid;
begin
 source:=jsonb_build_object('id',oid,'orderNo','OVER-135','product','Overdelivery test','qty',135,'saleUnit',10.5,'totalSale',1417.5,'active',true,'status','confirmed');
 insert into public.planner_orders_v2(workspace_id,order_id,order_no,status,active,data) values('ralabaster',oid,'OVER-135','confirmed',true,source);
 begin
  perform public.planner_record_delivery_v2(oid,139,0,rid,'',false);
  raise exception 'TEST unconfirmed extra allowed';
 exception when raise_exception then if sqlerrm not like 'Bevestig de overlevering%' then raise; end if; end;
 r:=public.planner_record_delivery_v2(oid,139,0,rid,'Extra 4 stuks',true);
 assert r#>>'{order,qty}'='135' and r#>>'{order,deliveredQty}'='139';
 assert r#>>'{order,overdeliveredQty}'='4' and r#>>'{order,backorderQty}'='0';
 assert (r#>>'{order,totalSale}')::numeric=1417.5;
 assert r#>>'{order,billableQty}'='139' and (r#>>'{order,billableRevenue}')::numeric=1459.5;
 assert (r#>>'{order,overdeliveryAmount}')::numeric=42;
 assert r#>>'{delivery,packing,completedQty}'='139' and r#>>'{delivery,packing,orderedQty}'='135';
 assert r#>>'{delivery,packing,overdeliveryQty}'='4' and r#>>'{delivery,overdeliveryConfirmed}'='true';
 r:=public.planner_record_delivery_v2(oid,139,0,rid,'Extra 4 stuks',true);
 assert r->>'existing'='true' and jsonb_array_length(r#>'{order,deliveries}')=1;
 update public.planner_orders_v2 set data=source where workspace_id='ralabaster' and order_id=oid;
 assert (select data->>'overdeliveredQty'='4' and data->>'billableQty'='139' from public.planner_orders_v2 where workspace_id='ralabaster' and order_id=oid);
 begin
  update public.planner_orders_v2 set data=jsonb_set(data,'{qty}','134') where workspace_id='ralabaster' and order_id=oid;
  raise exception 'TEST lowered ordered quantity accepted';
 exception when raise_exception then if sqlerrm not like 'Orderaantal kan niet lager%' then raise; end if; end;
 update public.planner_orders_v2 set active=false,status='completed',data=data||jsonb_build_object('status','completed','active',false,'closed',true,'completedQty',139,'completedRevenue',1459.5,'orderCompletionUpdatedAt','2099-01-01T00:00:00Z') where workspace_id='ralabaster' and order_id=oid;
 assert (select not active and data->>'qty'='135' and data->>'completedQty'='139' from public.planner_orders_v2 where workspace_id='ralabaster' and order_id=oid);
 -- The second delivery can cross the ordered quantity; earlier slips stay immutable.
 oid:=oid||'_partial';source:=source||jsonb_build_object('id',oid);
 insert into public.planner_orders_v2(workspace_id,order_id,order_no,status,active,data) values('ralabaster',oid,'OVER-135','confirmed',true,source);
 r:=public.planner_record_delivery_v2(oid,100,0,gen_random_uuid(),'',false);first_packing:=r#>'{delivery,packing}';
 assert r#>>'{order,backorderQty}'='35';
 r:=public.planner_record_delivery_v2(oid,39,100,gen_random_uuid(),'',true);
 assert r#>>'{order,deliveredQty}'='139' and r#>>'{delivery,overdeliveryQty}'='4';
 assert r#>'{order,deliveries,0,packing}'=first_packing;
 begin
  perform public.planner_record_delivery_v2(oid,1,100,gen_random_uuid(),'',true);
  raise exception 'TEST stale delivery accepted';
 exception when raise_exception then if sqlerrm not like 'De leveringsstand is gewijzigd%' then raise; end if; end;
 begin
  perform public.planner_record_delivery_v1(oid,1,139,gen_random_uuid(),'');
  raise exception 'TEST old endpoint allows extra';
 exception when raise_exception then if sqlerrm not like 'Het aantal is groter%' then raise; end if; end;
 select user_id into member_id from public.portal_customer_users u where active and not exists(select 1 from public.portal_admins a where a.user_id=u.user_id) limit 1;
 perform set_config('request.jwt.claim.sub',member_id::text,true);
 begin
  perform public.planner_record_delivery_v2(oid,1,139,gen_random_uuid(),'',true);
  raise exception 'TEST customer can overdeliver';
 exception when raise_exception then if sqlerrm<>'Log in als plannerbeheerder' then raise; end if; end;
 assert not has_function_privilege('anon','public.planner_record_delivery_v2(text,integer,integer,uuid,text,boolean)','execute');
end $$;
rollback;
select 'PASS: 135 ordered / 139 delivered / 4 extra billed, explicit confirmation, immutable slips, retries, stale writes, closeout and admin permissions' as result;

begin;
select set_config('request.jwt.claim.sub',(select user_id::text from public.portal_admins limit 1),true);
select set_config('request.jwt.claims',jsonb_build_object('sub',(select user_id from public.portal_admins limit 1),'role','authenticated')::text,true);
set local role authenticated;
do $$
declare oid text:='__delivery_test_'||gen_random_uuid()::text; a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid(); r jsonb; first_packing jsonb; original jsonb; task_before jsonb; stored jsonb;
begin
 original:=jsonb_build_object('id',oid,'orderNo','__DELIVERY_TEST__','product','Test product','qty',25,'saleUnit',100,'totalSale',2500,'active',true,'status','confirmed');
 task_before:=jsonb_build_object('id',oid||'_t','orderId',oid,'name','Draaien','estimate',100,'actual',10,'status','in_progress','doneQty',7,'planSegments',jsonb_build_array(jsonb_build_object('date','2026-11-02','minutes',90)));
 insert into public.planner_orders_v2(workspace_id,order_id,order_no,active,status,data) values('ralabaster',oid,'__DELIVERY_TEST__',true,'confirmed',original);
 insert into public.planner_tasks_v2(workspace_id,task_id,order_id,status,data) values('ralabaster',oid||'_t',oid,'in_progress',task_before);
 r:=public.planner_record_delivery_v1(oid,20,0,a,'Breekbaar');first_packing:=r->'delivery'->'packing';
 assert (r->'order'->>'qty')::int=25 and (r->'order'->>'deliveredQty')::int=20 and (r->'order'->>'backorderQty')::int=5;
 assert r->'order'->>'active'='true' and r->'order'->>'status'='confirmed';
 assert (r->'order'->>'totalSale')::numeric=2500;
 assert (first_packing->>'completedQty')::int=20 and first_packing->>'orderNo'='__DELIVERY_TEST__-DL01';
 assert (select data from public.planner_tasks_v2 where workspace_id='ralabaster' and task_id=oid||'_t')=task_before;
 r:=public.planner_record_delivery_v1(oid,20,0,a,'Breekbaar');assert r->>'existing'='true' and jsonb_array_length(r->'order'->'deliveries')=1;
 begin perform public.planner_record_delivery_v1(oid,5,0,b,'');raise exception 'TEST stale expected count accepted';exception when others then if sqlerrm like 'TEST %' then raise;end if;end;
 begin perform public.planner_record_delivery_v1(oid,6,20,b,'');raise exception 'TEST overdelivery accepted';exception when others then if sqlerrm like 'TEST %' then raise;end if;end;
 update public.planner_orders_v2 set data=original where workspace_id='ralabaster' and order_id=oid;
 select data into stored from public.planner_orders_v2 where workspace_id='ralabaster' and order_id=oid;
 assert jsonb_array_length(stored->'deliveries')=1 and (stored->>'deliveredQty')::int=20;
 begin update public.planner_orders_v2 set active=false,status='completed',data=data||jsonb_build_object('active',false,'closed',true,'status','completed','orderCompletionUpdatedAt','2099-01-01T00:00:00Z') where workspace_id='ralabaster' and order_id=oid;raise exception 'TEST pending backorder archived';exception when others then if sqlerrm like 'TEST %' then raise;end if;end;
 r:=public.planner_record_delivery_v1(oid,5,20,b,'Laatste levering');
 assert (r->'order'->>'deliveredQty')::int=25 and (r->'order'->>'backorderQty')::int=0;
 assert (r->'delivery'->'packing'->>'completedQty')::int=5 and r->'delivery'->'packing'->>'orderNo'='__DELIVERY_TEST__-DL02';
 assert r->'order'->'deliveries'->0->'packing'=first_packing;
 insert into public.planner_orders_v2(workspace_id,order_id,order_no,active,status,data)
 values('ralabaster',oid||'_many','__DELIVERY_TEST__',true,'confirmed',original||jsonb_build_object('id',oid||'_many','qty',101,'deliveredQty',99,'deliveries',(select jsonb_agg(jsonb_build_object('id',gen_random_uuid(),'qty',1)) from generate_series(1,99))));
 r:=public.planner_record_delivery_v1(oid||'_many',1,99,gen_random_uuid(),'');assert r->'delivery'->'packing'->>'orderNo'='__DELIVERY_TEST__-DL100';
 assert not has_function_privilege('anon','public.planner_record_delivery_v1(text,integer,integer,uuid,text)','execute');
 assert not (select prosecdef from pg_proc p where p.oid='public.planner_record_delivery_v1(text,integer,integer,uuid,text)'::regprocedure);
end $$;
rollback;


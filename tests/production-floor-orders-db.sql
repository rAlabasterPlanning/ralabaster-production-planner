-- Run inside BEGIN / ROLLBACK only. No real order or employee history is persisted.
select set_config('request.jwt.claims',(select jsonb_build_object('sub',user_id,'role','authenticated')::text from public.portal_admins limit 1),true);
set local role authenticated;
insert into public.planner_orders_v2(workspace_id,order_id,order_no,active,status,data) values('ralabaster','__floor_order_test__','TEST-ORDER',true,'confirmed','{"id":"__floor_order_test__","qty":500,"product":"TEST"}');
insert into public.planner_tasks_v2(workspace_id,task_id,order_id,seq,status,machine,task_type,order_active,data) values
('ralabaster','__floor_order_prev__','__floor_order_test__',1,'open','Doppen lijmen','internal',true,'{"id":"__floor_order_prev__","name":"Doppen lijmen","doneQty":0,"actual":12,"taskProgressUpdatedAt":"2026-10-12T06:00:00.000Z"}'),
('ralabaster','__floor_order_turn__','__floor_order_test__',2,'open','Mori ZL15 #1','internal',true,'{"id":"__floor_order_turn__","name":"Draaien","dependsPrev":true,"doneQty":0,"actual":0}');
do $$declare p timestamptz:=clock_timestamp();w text;s1 uuid:=gen_random_uuid();s2 uuid:=gen_random_uuid();r jsonb;begin
select value->>'id' into w from public.planner_shared_state,jsonb_array_elements(data->'workplaces') where value->>'name'='Mori ZL15 #1' limit 1;
r:=public.production_command(gen_random_uuid(),'start',jsonb_build_object('employee','Shaffi','session_id',s1,'workplace_id',w,'order_id','__floor_order_test__','overtime',true),p);
if not exists(select 1 from public.production_sessions where id=s1 and task_id is null and order_id='__floor_order_test__' and operation='Orderwerk') then raise exception 'order start attribution failed';end if;
if (select status from public.planner_tasks_v2 where task_id='__floor_order_prev__')<>'open' then raise exception 'skip must leave previous task open';end if;
r:=public.production_command(gen_random_uuid(),'stop',jsonb_build_object('employee','Shaffi','session_id',s1,'good',40,'scrap',2,'rework',0,'reason','Steenbreuk'),clock_timestamp());
if (select (data->>'doneQty')::int from public.planner_tasks_v2 where task_id='__floor_order_turn__')<>0 then raise exception 'order count must not invent task completion';end if;
begin
perform public.production_command(gen_random_uuid(),'start',jsonb_build_object('employee','Shaffi','session_id',s2,'workplace_id',w,'order_id','__floor_order_test__','overtime',true,'completed_predecessors',jsonb_build_array(jsonb_build_object('id','__floor_order_prev__','revision','stale'))),clock_timestamp());raise exception 'stale confirmation accepted';exception when others then if sqlerrm='stale confirmation accepted' then raise;end if;end;
r:=public.production_command(gen_random_uuid(),'start',jsonb_build_object('employee','Shaffi','session_id',s2,'workplace_id',w,'order_id','__floor_order_test__','overtime',true,'completed_predecessors',jsonb_build_array(jsonb_build_object('id','__floor_order_prev__','revision','2026-10-12T06:00:00.000Z'))),clock_timestamp());
if not exists(select 1 from public.planner_tasks_v2 where task_id='__floor_order_prev__' and status='done' and data->>'doneQty'='500' and data->>'actual'='12' and data->>'completionSource'='production-order-start') then raise exception 'explicit previous task completion failed';end if;
if not exists(select 1 from public.production_events where session_id=s2 and payload->'completed_predecessors'->0->>'id'='__floor_order_prev__') then raise exception 'completion not audited';end if;
if (select phase from public.production_sessions where id=s2)<>'production' then raise exception 'order phase mismatch';end if;
if (public.production_snapshot()->'tasks') is null then raise exception 'snapshot failed';end if;
end$$;
select 'order start, skip, completion, revision conflict, quantities and audit passed' as result;

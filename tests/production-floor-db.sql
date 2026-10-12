-- Transactional fixture: run after migration inside BEGIN / ROLLBACK only.
select set_config('request.jwt.claims',(select jsonb_build_object('sub',user_id,'role','authenticated')::text from public.portal_admins limit 1),true);
set local role authenticated;
insert into public.planner_orders_v2(workspace_id,order_id,order_no,active,status,data) values('ralabaster','__production_test__','TEST-FLOOR',true,'confirmed','{"id":"__production_test__","qty":100,"product":"TEST"}');
insert into public.planner_tasks_v2(workspace_id,task_id,order_id,seq,status,machine,task_type,order_active,data) values('ralabaster','__floor_t1__','__production_test__',1,'open','Mori ZL15 #1','internal',true,'{"id":"__floor_t1__","name":"Draaien","machine":"Mori ZL15 #1","qty":100,"estimate":600,"doneQty":0,"actual":0}'),('ralabaster','__floor_t2__','__production_test__',2,'open','Mori ZL15 #2','internal',true,'{"id":"__floor_t2__","name":"Draaien","machine":"Mori ZL15 #2","qty":100,"estimate":600,"doneQty":0,"actual":0}');
do $$declare p timestamptz:=((now() at time zone 'Europe/Amsterdam')::date+time '09:00') at time zone 'Europe/Amsterdam';w1 text;w2 text;r jsonb;uid uuid:='11111111-1111-4111-8111-111111111111';a numeric;
begin
select value->>'id' into w1 from public.planner_shared_state,jsonb_array_elements(data->'workplaces') where value->>'name'='Mori ZL15 #1' limit 1;
select value->>'id' into w2 from public.planner_shared_state,jsonb_array_elements(data->'workplaces') where value->>'name'='Mori ZL15 #2' limit 1;
r:=public.production_command('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','start',jsonb_build_object('employee','Shaffi','session_id',uid,'workplace_id',w1,'task_id','__floor_t1__'),p);
r:=public.production_command('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','start',jsonb_build_object('employee','Shaffi','session_id',uid,'workplace_id',w1,'task_id','__floor_t1__'),p);
if (select count(*) from public.production_sessions where task_id='__floor_t1__')<>1 then raise exception 'idempotency failed';end if;
r:=public.production_command(gen_random_uuid(),'start',jsonb_build_object('employee','Shaffi','session_id','22222222-2222-4222-8222-222222222222','workplace_id',w2,'task_id','__floor_t2__'),p+interval '30 minutes');
r:=public.production_command(gen_random_uuid(),'phase',jsonb_build_object('employee','Shaffi','session_id',uid,'phase','downtime','engaged',false,'reason','Machine'),p+interval '90 minutes');
select sum(labor_minutes) into a from public.production_sessions where employee='Shaffi';
if a<>75 then raise exception 'parallel labor failed: % expected 75',a;end if;
if public.production_minutes(p,p+interval '5 hours',true)<>255 then raise exception 'break deductions failed';end if;
r:=public.production_command(gen_random_uuid(),'counts',jsonb_build_object('employee','Shaffi','session_id',uid,'good',10,'scrap',2,'rework',1,'reason','Steenbreuk'),p+interval '95 minutes');
if (select (data->>'doneQty')::int from public.planner_tasks_v2 where task_id='__floor_t1__')<>10 then raise exception 'task good count not synced';end if;
begin
 perform public.production_command(gen_random_uuid(),'counts',jsonb_build_object('employee','Shaffi','session_id',uid,'good',-1,'scrap',0,'rework',0),clock_timestamp());raise exception 'negative count allowed';
 exception when others then if sqlerrm='negative count allowed' then raise;end if;end;
 r:=public.production_command(gen_random_uuid(),'close_day',jsonb_build_object('employee','Shaffi','rows',jsonb_build_array(jsonb_build_object('session_id',uid,'good',0,'scrap',0,'rework',0),jsonb_build_object('session_id','22222222-2222-4222-8222-222222222222','good',5,'scrap',0,'rework',0))),clock_timestamp());
 if exists(select 1 from public.production_sessions where employee='Shaffi' and ended_at is null) then raise exception 'day close left running sessions';end if;
 if (public.production_snapshot()->'sessions') is null then raise exception 'snapshot failed';end if;
end$$;
select 'all database workflow assertions passed' as result;

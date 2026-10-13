-- Run inside BEGIN / ROLLBACK only; all dates relative to Amsterdam today.
select set_config('request.jwt.claims',(select jsonb_build_object('sub',user_id,'role','authenticated')::text from public.portal_admins limit 1),true);
set local role authenticated;
insert into public.planner_orders_v2(workspace_id,order_id,order_no,active,status,data) values('ralabaster','__backfill_order1__','BACKFILL-1',true,'confirmed','{"id":"__backfill_order1__","qty":500,"product":"TEST"}'),('ralabaster','__backfill_order2__','BACKFILL-2',false,'completed','{"id":"__backfill_order2__","qty":500,"product":"TEST ARCHIVED","active":false,"status":"completed"}');
insert into public.planner_tasks_v2(workspace_id,task_id,order_id,seq,status,machine,task_type,order_active,data) values('ralabaster','__backfill_task1__','__backfill_order1__',1,'open','Mori ZL15 #1','internal',true,'{"id":"__backfill_task1__","name":"Draaien","doneQty":0,"actual":0}'),('ralabaster','__backfill_task2__','__backfill_order2__',1,'done','Mori ZL15 #1','internal',false,'{"id":"__backfill_task2__","name":"Draaien","doneQty":500,"actual":40}');
do $$declare d date:=(now() at time zone 'Europe/Amsterdam')::date-1;a timestamptz;b timestamptz;w1 text;w2 text;w3 text;m uuid;unknown_m uuid;req uuid:=gen_random_uuid();s1 uuid:=gen_random_uuid();s2 uuid:=gen_random_uuid();old_s uuid:=gen_random_uuid();extra uuid:=gen_random_uuid();live_s uuid:=gen_random_uuid();r jsonb;p jsonb;v numeric;
begin
a:=(d+time '09:00') at time zone 'Europe/Amsterdam';b:=(d+time '11:00') at time zone 'Europe/Amsterdam';
select value->>'id' into w1 from public.planner_shared_state,jsonb_array_elements(data->'workplaces') where value->>'name'='Mori ZL15 #1' limit 1;
select value->>'id' into w2 from public.planner_shared_state,jsonb_array_elements(data->'workplaces') where value->>'name'='Mori ZL15 #2' limit 1;
select value->>'id' into w3 from public.planner_shared_state,jsonb_array_elements(data->'workplaces') where value->>'name'='Mori SL25' limit 1;
r:=public.production_material_command(gen_random_uuid(),'{"action":"create","name":"TEST tool","sku":"__backfill_tool__","unit":"stuks","category":"tool","minimum":5,"quantity":20}');m:=(r->>'material_id')::uuid;
r:=public.production_material_command(gen_random_uuid(),'{"action":"create","name":"TEST unknown","sku":"__backfill_unknown__","unit":"stuks","category":"tool"}');unknown_m:=(r->>'material_id')::uuid;
p:=jsonb_build_object('employee','Shaffi','workplace_id',w1,'order_id','__backfill_order1__','session_id',s1,'start',a,'end',b,'good',40,'scrap',2,'rework',0,'stone_used_pieces',42,'stone_used_kg',20,'reason','Gisteren niet ingeklokt','materials',jsonb_build_array(jsonb_build_object('material_id',m,'quantity',3,'kind','used'),jsonb_build_object('material_id',unknown_m,'quantity',2,'kind','used')),'stone_loss_kg',1.2);
r:=public.production_backfill(req,p);perform public.production_backfill(req,p);
if (select good from public.production_sessions where id=s1)<>40 then raise exception 'retry duplicated quantities';end if;
if (select stock from public.production_materials where id=m)<>20 then raise exception 'late usage deducted already-counted stock';end if;
if (select stock from public.production_materials where id=unknown_m)<>-2 then raise exception 'uncounted historic stock movement missing';end if;
if not exists(select 1 from public.production_material_moves where request_id=req and material_id=m and quantity=3 and stock_delta=0 and (occurred_at at time zone 'Europe/Amsterdam')::date=d and recorded_at>=now()-interval '1 minute') then raise exception 'historic material attribution/audit failed';end if;
if not exists(select 1 from public.production_sessions where id=s1 and is_backfill and ended_at=b and stone_used_pieces=42 and stone_used_kg=20) then raise exception 'historical stones/time missing';end if;
begin perform public.production_backfill(gen_random_uuid(),p||jsonb_build_object('session_id',gen_random_uuid()));raise exception 'duplicate period allowed';exception when others then if sqlerrm='duplicate period allowed' then raise;end if;end;
perform public.production_backfill(gen_random_uuid(),p||jsonb_build_object('session_id',s2,'workplace_id',w2,'order_id','__backfill_order2__','good',25,'scrap',0,'materials','[]'::jsonb,'stone_loss_kg',0));
select sum(labor_minutes) into v from public.production_sessions where id in(s1,s2);if v<>105 then raise exception 'parallel hour double count: %',v;end if;
if (select labor_minutes from public.production_sessions where id=s1)<>52.5 then raise exception 'parallel hours not equally divided';end if;
perform public.production_backfill(gen_random_uuid(),p||jsonb_build_object('existing_session',s1,'expected_good',40,'expected_scrap',2,'expected_rework',0,'good',5,'scrap',0,'materials','[]'::jsonb,'stone_used_pieces',null,'stone_used_kg',null,'stone_loss_kg',0));
if (select good from public.production_sessions where id=s1)<>45 or (select stone_used_pieces from public.production_sessions where id=s1)<>42 then raise exception 'existing supplement failed';end if;
if not exists(select 1 from public.planner_orders_v2 where order_id='__backfill_order2__' and not active and status='completed') then raise exception 'archive was reopened';end if;
if (select status from public.planner_tasks_v2 where task_id='__backfill_task1__')<>'open' then raise exception 'backfill must not mark route complete';end if;
-- Preserve an existing closed labor timeline and split it with an overlapping past assignment.
a:=(d+time '13:00') at time zone 'Europe/Amsterdam';b:=(d+time '15:00') at time zone 'Europe/Amsterdam';
insert into public.production_sessions(id,employee,workplace_id,workplace_name,workplace_type,order_id,operation,phase,started_at,auto_end,ended_at,good) values(old_s,'Lance',w3,'Mori SL25','machine','__backfill_order1__','Orderwerk','production',a,b,b,10);
insert into public.production_phases(session_id,phase,started_at,ended_at) values(old_s,'production',a,b);
insert into public.production_labor(employee,session_ids,started_at,stop_at,ended_at) values('Lance',array[old_s],a,b,b);
perform public.production_backfill(gen_random_uuid(),p||jsonb_build_object('employee','Lance','session_id',extra,'start',a,'end',b,'good',10,'scrap',0,'materials','[]'::jsonb,'stone_used_pieces',null,'stone_used_kg',null,'stone_loss_kg',0));
select sum(labor_minutes) into v from public.production_sessions where id in(old_s,extra);if v<>120 then raise exception 'existing timeline doubled: %',v;end if;
if (select count(*) from public.production_labor where employee='Lance' and superseded_at is not null)<>1 then raise exception 'original timeline audit not retained';end if;
-- Live day is untouched, and today cannot be entered through the history route.
insert into public.production_sessions(id,employee,workplace_id,workplace_name,workplace_type,operation,phase,started_at,auto_end) values(live_s,'Kaan',w1,'Mori ZL15 #1','machine','LIVE TEST','production',now()-interval '1 minute',now()+interval '2 hours');
insert into public.production_labor(employee,session_ids,started_at,stop_at) values('Kaan',array[live_s],now()-interval '1 minute',now()+interval '2 hours');
begin perform public.production_backfill(gen_random_uuid(),p||jsonb_build_object('start',now()-interval '1 hour','end',now(),'session_id',gen_random_uuid()));raise exception 'today accepted';exception when others then if sqlerrm='today accepted' then raise;end if;end;
if not exists(select 1 from public.production_labor where employee='Kaan' and ended_at is null and superseded_at is null) then raise exception 'live clock changed';end if;
if not exists(select 1 from public.production_events where request_id=req and action='backfill' and (occurred_at at time zone 'Europe/Amsterdam')::date=d and recorded_at>=now()-interval '1 minute') then raise exception 'historic event date wrong';end if;
if jsonb_array_length(public.production_snapshot()->'labor')<1 then raise exception 'snapshot failed';end if;
end$$;
select 'historical date, quantity, stones, stock baselines, retries, overlap, split labor, archive and live-day protection passed' as result;

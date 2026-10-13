begin;
select set_config('request.jwt.claims',(select jsonb_build_object('sub',user_id,'role','authenticated')::text from public.portal_admins limit 1),true);
set local role authenticated;
do $test$
declare oid text:='__day_test_'||gen_random_uuid();req uuid:=gen_random_uuid();d date:=(now() at time zone 'Europe/Amsterdam')::date-1;p jsonb;wp text;v jsonb;
begin
 insert into public.planner_orders_v2(workspace_id,order_id,order_no,active,status,data) values('ralabaster',oid,'DAY-TEST',true,'confirmed',jsonb_build_object('id',oid,'qty',100,'product','Test'));
 p:=jsonb_build_object('employee','Youri','day',d,'reason','Test missing day hours','rows',jsonb_build_array(jsonb_build_object('order_id',oid,'start',(d+time '08:15') at time zone 'Europe/Amsterdam','end',(d+time '10:00') at time zone 'Europe/Amsterdam')));
 perform public.production_day_allocate(req,p);perform public.production_day_allocate(req,p);
 if (select count(*) from public.production_sessions where order_id=oid)<>1 or (select sum(labor_minutes) from public.production_sessions where order_id=oid)<>105 then raise exception 'Hours doubled or breaks incorrectly counted';end if;
 begin
  perform public.production_day_allocate(gen_random_uuid(),p);
  raise exception 'Overlap wrongly accepted';
 exception when others then if sqlerrm='Overlap wrongly accepted' then raise;end if;end;
 select value->>'id' into wp from public.planner_shared_state,jsonb_array_elements(data->'workplaces') where workspace_id='ralabaster' and value->>'name'='INTERN - Algemeen' limit 1;
 perform public.production_command(gen_random_uuid(),'start',jsonb_build_object('employee','Youri','workplace_id',wp,'overtime',true),clock_timestamp());
 perform public.production_command(gen_random_uuid(),'start',jsonb_build_object('employee','Shaffi','workplace_id',wp,'overtime',true),clock_timestamp());
 if (select count(distinct employee) from public.production_sessions where workplace_id=wp and employee in ('Youri','Shaffi') and ended_at is null)<2 then raise exception 'Shared manual work failed';end if;
end $test$;
rollback;

-- Append after production-floor-orders-db.sql in a rollback-only transaction.
do $$declare w text;r jsonb;req uuid:=gen_random_uuid();sid uuid;begin
select value->>'id' into w from public.planner_shared_state,jsonb_array_elements(data->'workplaces') where value->>'name'='Mori ZL15 #1' limit 1;
select id into sid from public.production_sessions where order_id='__floor_order_test__' and ended_at is null;
r:=public.production_workplace_command(req,jsonb_build_object('employee','Shaffi','workplace_id',w,'status','open','reason','Wacht op onderdelen','detail','Spindel defect'),clock_timestamp());
perform public.production_workplace_command(req,jsonb_build_object('employee','Shaffi','workplace_id',w,'status','open','reason','Wacht op onderdelen'),clock_timestamp());
if (select count(*) from public.production_workplace_incidents where resolved_at is null and workplace_id=w)<>1 then raise exception 'incident idempotency failed';end if;
if not exists(select 1 from public.production_sessions where id=sid and phase='downtime' and not engaged) then raise exception 'active production not paused';end if;
begin
perform public.production_command(gen_random_uuid(),'phase',jsonb_build_object('employee','Shaffi','session_id',sid,'phase','production'),clock_timestamp());raise exception 'blocked resume allowed';exception when others then if sqlerrm='blocked resume allowed' then raise;end if;end;
begin
perform public.production_command(gen_random_uuid(),'start',jsonb_build_object('employee','Kaan','session_id',gen_random_uuid(),'workplace_id',w,'order_id','__floor_order_test__','overtime',true),clock_timestamp());raise exception 'blocked start allowed';exception when others then if sqlerrm='blocked start allowed' then raise;end if;end;
if jsonb_array_length(public.production_snapshot()->'workplaceIncidents')<1 then raise exception 'incident missing from shared screen';end if;
perform public.production_workplace_command(gen_random_uuid(),jsonb_build_object('employee','Ralph','workplace_id',w,'status','resolve'),clock_timestamp());
if exists(select 1 from public.production_workplace_incidents where workplace_id=w and resolved_at is null) then raise exception 'resolution failed';end if;
perform public.production_command(gen_random_uuid(),'phase',jsonb_build_object('employee','Shaffi','session_id',sid,'phase','production','engaged',true),clock_timestamp());
if (select count(*) from public.production_workplace_events where incident_id=(r->>'incident_id')::uuid)<>2 then raise exception 'audit history failed';end if;
end$$;
select 'persistent incident, idempotency, worker pause, start/resume block, resolution and audit passed' as result;

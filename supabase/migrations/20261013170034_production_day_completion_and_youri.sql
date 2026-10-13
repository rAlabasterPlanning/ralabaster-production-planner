-- Youri has the same working schedule and workplace rates as Shaffi.
do $patch$
declare f record;definition text;
begin
 for f in select oid from pg_proc where pronamespace='public'::regnamespace and proname in ('production_command','production_backfill','production_rebuild_past_labor','production_workplace_command') loop
  definition:=pg_get_functiondef(f.oid);
  definition:=replace(definition,'''Ralph'',''Peter'',''Kaan'',''Lance'',''Shaffi''','''Ralph'',''Peter'',''Kaan'',''Lance'',''Shaffi'',''Youri''');
  execute definition;
 end loop;
end $patch$;
create or replace function public.production_day_allocate(p_request uuid,p_payload jsonb) returns jsonb language plpgsql security invoker set search_path='' as $fn$
declare emp text:=p_payload->>'employee';d date:=(p_payload->>'day')::date;note text:=trim(coalesce(p_payload->>'reason',''));r jsonb;a timestamptz;b timestamptz;lo timestamptz;hi timestamptz;wp jsonb;o public.planner_orders_v2%rowtype;sid uuid;result jsonb;mins numeric;
begin
 if not public.portal_is_admin() then raise exception 'Log in met het planneraccount' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtext('ralabaster-production-floor'));
 select e.result into result from public.production_events e where e.request_id=p_request;if found then return result;end if;
 if emp is null or emp not in ('Ralph','Peter','Kaan','Lance','Shaffi','Youri') or d is null or d>(now() at time zone 'Europe/Amsterdam')::date or d<(now() at time zone 'Europe/Amsterdam')::date-30 or note='' then raise exception 'Controleer medewerker, werkdag en toelichting';end if;
 lo:=(d+time '08:15') at time zone 'Europe/Amsterdam';
 hi:=least((d+case when extract(isodow from d)=5 and emp='Ralph' then time '15:00' else time '16:30' end) at time zone 'Europe/Amsterdam',clock_timestamp());
 if jsonb_typeof(p_payload->'rows') is distinct from 'array' or jsonb_array_length(p_payload->'rows')=0 then raise exception 'Kies uren en een project';end if;
 select value into wp from public.planner_shared_state,jsonb_array_elements(data->'workplaces') where workspace_id='ralabaster' and value->>'name'='INTERN - Algemeen' and value->>'type'='manual' limit 1;
 if wp is null then raise exception 'Handmatige werkplek Algemeen ontbreekt';end if;
 for r in select value from jsonb_array_elements(p_payload->'rows') loop
  a:=(r->>'start')::timestamptz;b:=(r->>'end')::timestamptz;
  if a is null or b is null or a<lo or b>hi or b<=a then raise exception 'Uren moeten binnen de verstreken werkdag vallen';end if;
  mins:=public.production_minutes(a,b,true);
  if mins<=0 then raise exception 'Pauzes worden niet aan een project toegewezen';end if;
  if exists(select 1 from public.production_labor l where l.employee=emp and l.superseded_at is null and l.started_at<b and least(coalesce(l.ended_at,clock_timestamp()),l.stop_at)>a and public.production_minutes(greatest(a,l.started_at),least(b,coalesce(l.ended_at,clock_timestamp()),l.stop_at),true)>0) then raise exception 'Deze uren zijn al toegewezen. Ververs de dagcontrole';end if;
  select * into o from public.planner_orders_v2 where workspace_id='ralabaster' and order_id=r->>'order_id' and not deleted;
  if not found then raise exception 'Project niet gevonden';end if;
  sid:=gen_random_uuid();
  insert into public.production_sessions(id,employee,workplace_id,workplace_name,workplace_type,order_id,order_no,product,operation,phase,engaged,started_at,auto_end,ended_at,good,scrap,rework,labor_minutes,is_backfill)
  values(sid,emp,wp->>'id',wp->>'name','manual',o.order_id,o.order_no,o.data->>'product','Daguren toegewezen','production',true,a,b,b,0,0,0,mins,true);
  insert into public.production_phases(session_id,phase,started_at,ended_at,reason) values(sid,'production',a,b,note);
  insert into public.production_labor(employee,session_ids,started_at,stop_at,ended_at,allocation_method) values(emp,array[sid],a,b,b,'manual-day-gap');
 end loop;
 result:=jsonb_build_object('ok',true,'day',d);
 insert into public.production_events(request_id,employee,action,occurred_at,payload,result) values(p_request,emp,'day_allocation',clock_timestamp(),p_payload,result);
 return result;
end $fn$;
revoke all on function public.production_day_allocate(uuid,jsonb) from public,anon;
grant execute on function public.production_day_allocate(uuid,jsonb) to authenticated;

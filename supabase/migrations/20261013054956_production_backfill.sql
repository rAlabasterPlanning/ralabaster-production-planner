begin;
alter table public.production_sessions add column is_backfill boolean not null default false,add column stone_used_pieces integer check(stone_used_pieces>=0),add column stone_used_kg numeric(14,3) check(stone_used_kg>=0);
alter table public.production_labor add column superseded_at timestamptz;
alter table public.production_material_moves add column recorded_at timestamptz;
alter table public.production_material_moves alter column recorded_at set default now();
create function public.production_rebuild_past_labor(p_employee text,p_day date) returns void language plpgsql security invoker set search_path='' as $$
declare old_rows jsonb;d0 timestamptz:=p_day::timestamp at time zone 'Europe/Amsterdam';d1 timestamptz:=(p_day+1)::timestamp at time zone 'Europe/Amsterdam';seg record;ids uuid[];
begin
if not public.portal_is_admin() then raise exception 'Log in met het planneraccount' using errcode='42501';end if;
if p_day>=(now() at time zone 'Europe/Amsterdam')::date or p_day<(now() at time zone 'Europe/Amsterdam')::date-30 or p_employee not in ('Ralph','Peter','Kaan','Lance','Shaffi') then raise exception 'Ongeldige historische werkdag';end if;
perform pg_advisory_xact_lock(hashtext('ralabaster-production-floor'));
select coalesce(jsonb_agg(to_jsonb(l)),'[]') into old_rows from public.production_labor l where employee=p_employee and superseded_at is null and started_at<d1 and least(coalesce(ended_at,stop_at),stop_at)>d0;
update public.production_labor set superseded_at=clock_timestamp(),ended_at=coalesce(ended_at,stop_at) where id in (select (x->>'id')::uuid from jsonb_array_elements(old_rows)x);
for seg in with bounds as (
 select greatest((x->>'started_at')::timestamptz,d0) as ts from jsonb_array_elements(old_rows)x union
 select least(coalesce((x->>'ended_at')::timestamptz,(x->>'stop_at')::timestamptz),(x->>'stop_at')::timestamptz,d1) from jsonb_array_elements(old_rows)x union
 select greatest(started_at,d0) from public.production_sessions where employee=p_employee and is_backfill and engaged and started_at<d1 and ended_at>d0 union
 select least(ended_at,d1) from public.production_sessions where employee=p_employee and is_backfill and engaged and started_at<d1 and ended_at>d0)
 select ts as a,lead(ts) over(order by ts) as b from bounds order by ts loop
 if seg.b is null or seg.b<=seg.a then continue;end if;
 select array_agg(distinct v.id) into ids from (
 select y.value::uuid as id from jsonb_array_elements(old_rows)x cross join lateral jsonb_array_elements_text(x->'session_ids')y where (x->>'started_at')::timestamptz<=seg.a and least(coalesce((x->>'ended_at')::timestamptz,(x->>'stop_at')::timestamptz),(x->>'stop_at')::timestamptz)>=seg.b union
 select id from public.production_sessions where employee=p_employee and is_backfill and engaged and started_at<=seg.a and ended_at>=seg.b) v;
 if cardinality(ids)>0 then insert into public.production_labor(employee,session_ids,started_at,stop_at,ended_at,allocation_method) values(p_employee,ids,seg.a,seg.b,seg.b,'equal-active-projects-backfill');end if;
end loop;
update public.production_sessions s set labor_minutes=coalesce((select sum(public.production_minutes(l.started_at,least(coalesce(l.ended_at,l.stop_at),l.stop_at),true)/cardinality(l.session_ids)) from public.production_labor l where l.superseded_at is null and s.id=any(l.session_ids) and l.ended_at is not null),0) where s.employee=p_employee and (s.started_at at time zone 'Europe/Amsterdam')::date=p_day;
end$$;
create function public.production_backfill(p_request uuid,p_payload jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare emp text:=p_payload->>'employee';a timestamptz:=(p_payload->>'start')::timestamptz;b timestamptz:=(p_payload->>'end')::timestamptz;d date;wp jsonb;meta jsonb;o public.planner_orders_v2%rowtype;s public.production_sessions%rowtype;sid uuid;g integer:=(p_payload->>'good')::integer;r integer:=(p_payload->>'scrap')::integer;rw integer:=(p_payload->>'rework')::integer;result jsonb;note text:=trim(coalesce(p_payload->>'reason',''));phase text:=coalesce(p_payload->>'phase','production');
begin
if not public.portal_is_admin() then raise exception 'Log in met het planneraccount' using errcode='42501';end if;
perform pg_advisory_xact_lock(hashtext('ralabaster-production-floor'));
select e.result into result from public.production_events e where request_id=p_request;if found then return result;end if;
if emp is null or emp not in ('Ralph','Peter','Kaan','Lance','Shaffi') then raise exception 'Kies een medewerker';end if;
d:=(a at time zone 'Europe/Amsterdam')::date;
if a is null or b is null or b<=a or (b at time zone 'Europe/Amsterdam')::date<>d or d>=(now() at time zone 'Europe/Amsterdam')::date or d<(now() at time zone 'Europe/Amsterdam')::date-30 then raise exception 'Kies een vorige werkdag (maximaal 30 dagen terug) en geldige tijden op dezelfde dag';end if;
if g is null or r is null or rw is null or least(g,r,rw)<0 then raise exception 'Vul aantallen in, ook nul';end if;
if note='' then raise exception 'Vul een korte toelichting in voor de achterafregistratie';end if;
if phase not in ('production','setup','downtime','waiting') then raise exception 'Ongeldige bewerking';end if;
select data into meta from public.planner_shared_state where workspace_id='ralabaster';
select value into wp from jsonb_array_elements(meta->'workplaces') where value->>'id'=p_payload->>'workplace_id' and value->>'type' not in ('external','wait') and value->>'name' !~* 'instellen';if wp is null then raise exception 'Werkplek niet gevonden';end if;
select * into o from public.planner_orders_v2 where workspace_id='ralabaster' and order_id=p_payload->>'order_id' and not deleted;if not found then raise exception 'Order niet gevonden';end if;
if nullif(p_payload->>'existing_session','') is not null then
 select * into s from public.production_sessions where id=(p_payload->>'existing_session')::uuid and employee=emp and order_id=o.order_id and lower(workplace_name)=lower(wp->>'name') and (started_at at time zone 'Europe/Amsterdam')::date=d for update;
 if not found then raise exception 'Bestaande registratie niet gevonden';end if;
 if s.good<>coalesce((p_payload->>'expected_good')::integer,-1) or s.scrap<>coalesce((p_payload->>'expected_scrap')::integer,-1) or s.rework<>coalesce((p_payload->>'expected_rework')::integer,-1) then raise exception 'Registratie gewijzigd; vernieuw het scherm en controleer de extra aantallen';end if;
 if a<>s.started_at or b<>coalesce(s.ended_at,s.auto_end) then raise exception 'De bestaande werktijden blijven behouden';end if;
 sid:=s.id;
 update public.production_sessions set good=good+g,scrap=scrap+r,rework=rework+rw,review_needed=false,ended_at=coalesce(ended_at,auto_end),stone_used_pieces=case when p_payload->>'stone_used_pieces' is null then stone_used_pieces else coalesce(stone_used_pieces,0)+(p_payload->>'stone_used_pieces')::integer end,stone_used_kg=case when p_payload->>'stone_used_kg' is null then stone_used_kg else coalesce(stone_used_kg,0)+(p_payload->>'stone_used_kg')::numeric end where id=sid;
 update public.production_phases set ended_at=least(b,s.auto_end) where session_id=sid and ended_at is null;
else
 if exists(select 1 from public.production_sessions x where lower(x.workplace_name)=lower(wp->>'name') and x.started_at<b and least(coalesce(x.ended_at,x.auto_end),x.auto_end)>a and (wp->>'type'='machine' or (x.employee=emp and x.order_id=o.order_id))) then raise exception 'Deze werktijden overlappen een bestaande registratie. Kies die registratie om aantallen en verbruik aan te vullen';end if;
 if not exists(select 1 from public.planner_tasks_v2 q where q.workspace_id='ralabaster' and q.order_id=o.order_id and not q.deleted and (lower(coalesce(nullif(q.data->>'assignedMachine',''),q.machine))=lower(wp->>'name') or (q.machine ~* '^Mori' and wp->>'name' ~* '^Mori' and (q.machine !~* 'SL25' or wp->>'name' ~* 'SL25')) or (q.machine ~* '^Teach.?In' and wp->>'name' ~* '^Teach.?In') or (q.machine='Verlijmen' and wp->>'name'='Doppen lijmen') or (q.machine='Werkplaats algemeen' and wp->>'name'='INTERN - Algemeen'))) then raise exception 'Order past niet bij deze werkplek';end if;
 sid:=coalesce((p_payload->>'session_id')::uuid,gen_random_uuid());
 insert into public.production_sessions(id,employee,workplace_id,workplace_name,workplace_type,order_id,order_no,product,operation,phase,engaged,started_at,auto_end,ended_at,good,scrap,rework,is_backfill,stone_used_pieces,stone_used_kg)
 values(sid,emp,wp->>'id',wp->>'name',wp->>'type',o.order_id,o.order_no,o.data->>'product','Orderwerk (achteraf)',phase,coalesce((p_payload->>'engaged')::boolean,phase in ('production','setup')),a,b,b,g,r,rw,true,(p_payload->>'stone_used_pieces')::integer,(p_payload->>'stone_used_kg')::numeric);
 insert into public.production_phases(session_id,phase,started_at,ended_at,reason) values(sid,phase,a,b,note);
end if;
perform public.production_material_consume(p_request,sid,p_payload->'materials',(p_payload->>'stone_loss_kg')::numeric,b);
perform public.production_rebuild_past_labor(emp,d);
result:=jsonb_build_object('ok',true,'session_id',sid,'day',d);
insert into public.production_events(request_id,employee,action,session_id,occurred_at,payload,result) values(p_request,emp,'backfill',sid,b,p_payload||jsonb_build_object('recorded_at',clock_timestamp(),'historical_day',d,'good',g,'scrap',r,'rework',rw),result);
return result;
end$$;
revoke all on function public.production_rebuild_past_labor(text,date),public.production_backfill(uuid,jsonb) from public,anon;
grant execute on function public.production_rebuild_past_labor(text,date),public.production_backfill(uuid,jsonb) to authenticated;
create or replace function public.production_material_consume(p_request uuid,p_session uuid,p_items jsonb,p_stone numeric,p_at timestamptz) returns void language plpgsql security invoker set search_path='' as $$
declare s public.production_sessions%rowtype;m public.production_materials%rowtype;x jsonb;q numeric;sd numeric;idx int:=0;k text;
begin
if not public.portal_is_admin() then raise exception 'Log in met het planneraccount' using errcode='42501';end if;
select * into s from public.production_sessions where id=p_session;
if not found then raise exception 'Registratie niet gevonden';end if;
for x in select value from jsonb_array_elements(coalesce(p_items,'[]')) loop
idx:=idx+1;k:=p_session::text||':'||idx;
if exists(select 1 from public.production_material_moves where request_id=p_request and line_key=k) then continue;end if;
select * into m from public.production_materials where id=(x->>'material_id')::uuid and active for update;
if not found then raise exception 'Onbekend artikel';end if;
q:=(x->>'quantity')::numeric;if q is null or q<=0 or q<>round(q,3) or (m.unit='stuks' and q<>trunc(q)) or x->>'kind' not in ('used','broken') then raise exception 'Ongeldige hoeveelheid of verbruikstype';end if;
sd:=case when exists(select 1 from public.production_material_moves z where z.material_id=m.id and z.kind in ('initial','stocktake') and z.occurred_at>p_at) then 0 else -q end;
update public.production_materials set stock=stock+sd,revision=revision+1 where id=m.id;
insert into public.production_material_moves(material_id,session_id,order_id,workplace_name,employee,kind,quantity,stock_delta,unit,unit_cost,reason,request_id,line_key,occurred_at) values(m.id,s.id,s.order_id,s.workplace_name,s.employee,x->>'kind',q,sd,m.unit,m.unit_cost,coalesce(x->>'reason','')||case when sd=0 then ' Historisch verbruik reeds inbegrepen in latere voorraadtelling' else '' end,p_request,k,p_at);
end loop;
if coalesce(p_stone,0)<0 or coalesce(p_stone,0)<>round(coalesce(p_stone,0),3) then raise exception 'Ongeldig albastgewicht';end if;
if coalesce(p_stone,0)>0 then
insert into public.production_material_moves(session_id,order_id,workplace_name,employee,kind,quantity,unit,reason,request_id,line_key,occurred_at) values(s.id,s.order_id,s.workplace_name,s.employee,'alabaster_scrap',p_stone,'kg','Albastuitval; steenvoorraad niet nogmaals afgeboekt',p_request,p_session::text||':stone',p_at) on conflict(request_id,line_key) do nothing;
end if;end$$;
create or replace function public.production_snapshot(p_day date default (now() at time zone 'Europe/Amsterdam')::date) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare meta jsonb;result jsonb;
begin
 if not public.portal_is_admin() then raise exception 'Log in met het planneraccount' using errcode='42501';end if;
 select data into meta from public.planner_shared_state where workspace_id='ralabaster';
 select jsonb_build_object('serverNow',now(),'day',p_day,'workplaces',coalesce(meta->'workplaces','[]'),'staffAbsences',coalesce(meta->'staffAbsences','[]'),'dayOverrides',coalesce(meta->'dayOverrides','{}'),
 'workplaceIncidents',coalesce((select jsonb_agg(to_jsonb(i)) from public.production_workplace_incidents i where resolved_at is null or resolved_at>=now()-interval '90 days'),'[]'),
 'materials',coalesce((select jsonb_agg(to_jsonb(m)) from public.production_materials m where active),'[]'),
 'materialMoves',coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.production_material_moves where occurred_at>=now()-interval '90 days' order by occurred_at desc limit 5000)x),'[]'),
 'backfillOrders',coalesce((select jsonb_agg(jsonb_build_object('id',order_id,'orderNo',order_no,'product',data->>'product','qty',data->'qty','active',active)) from public.planner_orders_v2 where workspace_id='ralabaster' and not deleted and (active or completed_at>=now()-interval '30 days')),'[]'),
 'orders',coalesce((select jsonb_agg(jsonb_build_object('id',order_id,'orderNo',order_no,'product',data->>'product','qty',data->'qty','deadline',data->>'deadline','internalExpectedDate',data->>'internalExpectedDate','customerName',data->>'customerName')) from public.planner_orders_v2 where workspace_id='ralabaster' and active and not deleted),'[]'),
 'tasks',coalesce((select jsonb_agg(jsonb_build_object('id',task_id,'orderId',order_id,'name',data->>'name','machine',machine,'assignedMachine',data->>'assignedMachine','estimate',data->'estimate','actual',data->'actual','doneQty',data->'doneQty','status',status,'seq',seq,'dependsPrev',data->'dependsPrev','taskProgressUpdatedAt',data->'taskProgressUpdatedAt','type',task_type,'planSegments',data->'planSegments','employee',employee,'date',task_date,'isStaffAbsence',data->'isStaffAbsence')) from public.planner_tasks_v2 where workspace_id='ralabaster' and order_active and not deleted),'[]'),
 'historicalProgress',coalesce((select jsonb_agg(to_jsonb(h)) from (select s.order_id,case when s.workplace_name ~* '^Mori' then 'mori' else lower(regexp_replace(trim(s.workplace_name),'\s+',' ','g')) end as family,sum(s.good) as good,sum(s.scrap) as scrap,sum(coalesce((select sum(public.production_minutes(p.started_at,least(coalesce(p.ended_at,s.ended_at),s.auto_end),s.workplace_type<>'machine')) from public.production_phases p where p.session_id=s.id and p.phase='production'),0)) as production from public.production_sessions s where s.ended_at is not null and (s.started_at at time zone 'Europe/Amsterdam')::date<p_day-30 and exists(select 1 from public.planner_orders_v2 o where o.workspace_id='ralabaster' and o.order_id=s.order_id and o.active and not o.deleted) group by s.order_id,2)h),'[]'),
 'sessions',coalesce((select jsonb_agg(to_jsonb(s)) from public.production_sessions s where ended_at is null or (started_at at time zone 'Europe/Amsterdam')::date>=p_day-30),'[]'),
 'phases',coalesce((select jsonb_agg(to_jsonb(p)) from public.production_phases p join public.production_sessions s on s.id=p.session_id where s.ended_at is null or (s.started_at at time zone 'Europe/Amsterdam')::date>=p_day-30),'[]'),
 'labor',coalesce((select jsonb_agg(to_jsonb(l)) from public.production_labor l where superseded_at is null and (ended_at is null or (started_at at time zone 'Europe/Amsterdam')::date>=p_day-30)),'[]'),
 'attendance',coalesce((select jsonb_agg(to_jsonb(a)) from public.production_attendance a where day>=p_day-30),'[]'),
 'baselines',coalesce((select jsonb_agg(to_jsonb(b)) from public.production_task_baselines b),'[]'),
 'events',coalesce((select jsonb_agg(to_jsonb(e)) from (select request_id,employee,action,session_id,occurred_at,recorded_at,payload from public.production_events where (occurred_at at time zone 'Europe/Amsterdam')::date>=p_day-30 order by occurred_at desc limit 3000)e),'[]')
 ) into result;return result;
end$$;
commit;

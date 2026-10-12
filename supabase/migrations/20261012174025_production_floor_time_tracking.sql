begin;
create table public.production_sessions (
 id uuid primary key, workspace_id text not null default 'ralabaster' check(workspace_id='ralabaster'),
 employee text not null, workplace_id text not null, workplace_name text not null, workplace_type text not null,
 task_id text, order_id text, order_no text, product text, operation text not null,
 phase text not null check(phase in ('production','setup','downtime','waiting')),
 engaged boolean not null default true, started_at timestamptz not null, auto_end timestamptz not null,
 ended_at timestamptz, review_needed boolean not null default false, good integer not null default 0 check(good>=0), scrap integer not null default 0 check(scrap>=0),
 rework integer not null default 0 check(rework>=0), labor_minutes numeric not null default 0,
 reason text not null default '', created_by uuid not null default auth.uid(), check(auto_end>started_at),check(ended_at is null or ended_at>=started_at)
);
create index production_sessions_open on public.production_sessions(workspace_id,employee) where ended_at is null;
create index production_sessions_task on public.production_sessions(workspace_id,task_id);
create table public.production_phases (
 id uuid primary key default gen_random_uuid(), workspace_id text not null default 'ralabaster' check(workspace_id='ralabaster'),
 session_id uuid not null references public.production_sessions(id), phase text not null check(phase in ('production','setup','downtime','waiting')),
 started_at timestamptz not null, ended_at timestamptz, reason text not null default '', check(ended_at is null or ended_at>=started_at)
);
create unique index production_phases_one_open on public.production_phases(session_id) where ended_at is null;
create table public.production_labor (
 id uuid primary key default gen_random_uuid(),workspace_id text not null default 'ralabaster' check(workspace_id='ralabaster'),
 employee text not null,session_ids uuid[] not null,started_at timestamptz not null,stop_at timestamptz not null,ended_at timestamptz,
 allocation_method text not null default 'equal-active-projects',check(cardinality(session_ids)>0),check(stop_at>started_at)
);
create unique index production_labor_one_open on public.production_labor(workspace_id,employee) where ended_at is null;
create table public.production_attendance (
 workspace_id text not null default 'ralabaster' check(workspace_id='ralabaster'),day date not null,employee text not null,
 status text not null check(status in ('present','absent','closed')),reason text not null default '',updated_at timestamptz not null default now(),
 primary key(workspace_id,day,employee)
);
create table public.production_events (
 request_id uuid primary key,workspace_id text not null default 'ralabaster' check(workspace_id='ralabaster'),employee text not null,
 action text not null,session_id uuid references public.production_sessions(id),occurred_at timestamptz not null,
 recorded_at timestamptz not null default now(),actor uuid not null default auth.uid(),payload jsonb not null,result jsonb not null
);
create index production_events_day on public.production_events(workspace_id,occurred_at desc);
create table public.production_task_baselines (
 workspace_id text not null default 'ralabaster' check(workspace_id='ralabaster'),task_id text not null,
 good integer not null,actual numeric not null,synced_good integer not null default 0,synced_actual numeric not null default 0,estimate numeric not null,created_at timestamptz not null default now(),
 primary key(workspace_id,task_id)
);

-- No anonymous access, no customer access, no deletion of operational logs.
do $$declare t text;begin
 foreach t in array array['production_sessions','production_phases','production_labor','production_attendance','production_task_baselines'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from public,anon,authenticated',t);
 execute format('grant select,insert,update on public.%I to authenticated',t);
 execute format('create policy production_admin on public.%I for all to authenticated using (public.portal_is_admin() and workspace_id=''ralabaster'') with check (public.portal_is_admin() and workspace_id=''ralabaster'')',t);
 end loop;
end$$;
alter table public.production_events enable row level security;
revoke all on public.production_events from public,anon,authenticated;
grant select,insert on public.production_events to authenticated;
create policy production_events_read on public.production_events for select to authenticated using(public.portal_is_admin() and workspace_id='ralabaster');
create policy production_events_append on public.production_events for insert to authenticated with check(public.portal_is_admin() and workspace_id='ralabaster' and actor=auth.uid());

create function public.production_minutes(p_start timestamptz,p_end timestamptz,p_breaks boolean default true) returns numeric
language plpgsql immutable security invoker set search_path='' as $$
declare d date; b timestamptz;e timestamptz;mins numeric:=greatest(0,extract(epoch from (p_end-p_start))/60);x text[];
begin
 if p_start is null or p_end is null or p_end<=p_start then return 0;end if;
 if not p_breaks then return mins;end if;
 for d in select generate_series((p_start at time zone 'Europe/Amsterdam')::date,(p_end at time zone 'Europe/Amsterdam')::date,interval '1 day')::date loop
 foreach x slice 1 in array array[['10:00','10:15'],['12:15','12:45']] loop
 b:=(d+x[1]::time) at time zone 'Europe/Amsterdam';e:=(d+x[2]::time) at time zone 'Europe/Amsterdam';
 mins:=mins-greatest(0,extract(epoch from(least(p_end,e)-greatest(p_start,b)))/60);
 end loop;end loop;return greatest(0,mins);
end$$;

create function public.production_settle_labor(p_employee text,p_at timestamptz) returns void
language plpgsql security invoker set search_path='' as $$
declare l public.production_labor%rowtype;m numeric;sid uuid;
begin
 for l in select * from public.production_labor where employee=p_employee and ended_at is null for update loop
 m:=public.production_minutes(l.started_at,least(p_at,l.stop_at),true)/cardinality(l.session_ids);
 foreach sid in array l.session_ids loop update public.production_sessions set labor_minutes=labor_minutes+m where id=sid;end loop;
 update public.production_labor set ended_at=greatest(l.started_at,least(p_at,l.stop_at)) where id=l.id;
 end loop;
end$$;
create function public.production_open_labor(p_employee text,p_at timestamptz) returns void
language plpgsql security invoker set search_path='' as $$
declare ids uuid[];lim timestamptz;
begin
 select array_agg(id),min(auto_end) into ids,lim from public.production_sessions where employee=p_employee and ended_at is null and auto_end>p_at and engaged;
 if cardinality(ids)>0 then insert into public.production_labor(employee,session_ids,started_at,stop_at) values(p_employee,ids,p_at,lim);end if;
end$$;

create function public.production_sync_task(p_task text,p_at timestamptz,p_complete boolean default false) returns void
language plpgsql security invoker set search_path='' as $$
declare b public.production_task_baselines%rowtype;t public.planner_tasks_v2%rowtype;g int;a numeric;req int;stamp text;finished boolean;
begin
 if p_task is null then return;end if;
 select * into t from public.planner_tasks_v2 where workspace_id='ralabaster' and task_id=p_task and not deleted for update;
 if not found then return;end if;
 select * into b from public.production_task_baselines where workspace_id='ralabaster' and task_id=p_task;
 if not found then return;end if;
 b.good:=greatest(0,b.good+coalesce((t.data->>'doneQty')::int,0)-b.synced_good);
 b.actual:=greatest(0,b.actual+coalesce((t.data->>'actual')::numeric,0)-b.synced_actual);
 select coalesce(sum(good),0),coalesce(sum(labor_minutes),0) into g,a from public.production_sessions where task_id=p_task;
 select coalesce((data->>'qty')::int,0) into req from public.planner_orders_v2 where workspace_id='ralabaster' and order_id=t.order_id;
 if b.good+g>req and req>0 then raise exception 'Meer goede producten dan de order vraagt (% van %)',b.good+g,req;end if;
 if p_complete and t.data->>'name' !~* 'instellen' and b.good+g<req then raise exception 'Nog niet alle producten gereed: % van %',b.good+g,req;end if;
 finished:=p_complete or (t.status in ('done','completed') and b.good+g>=coalesce(req,0));
 update public.production_task_baselines set good=b.good,actual=b.actual,synced_good=b.good+g,synced_actual=b.actual+round(a,2) where workspace_id='ralabaster' and task_id=p_task;
 -- Revision guards must see a new authoritative progress timestamp.
 stamp:=to_char(greatest(clock_timestamp(),coalesce(nullif(t.data->>'taskProgressUpdatedAt','')::timestamptz,'epoch')+interval '1 millisecond') at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
 update public.planner_tasks_v2 set data=t.data||jsonb_build_object('doneQty',b.good+g,'actual',b.actual+round(a,2),'status',case when finished then 'done' when b.good+g>0 then 'partial' else 'in_progress' end,'taskProgressUpdatedAt',stamp,'productionLogged',true,'productionRemainingQty',greatest(0,req-b.good-g))||case when finished then jsonb_build_object('completedAt',((p_at at time zone 'Europe/Amsterdam')::date)::text,'completedAtDT',p_at) else '{}'::jsonb end,
 status=case when finished then 'done' when b.good+g>0 then 'partial' else 'in_progress' end,updated_at=clock_timestamp()
 where workspace_id='ralabaster' and task_id=p_task;
end$$;

create function public.production_command(p_request uuid,p_action text,p_payload jsonb,p_occurred_at timestamptz default now()) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare emp text:=p_payload->>'employee';at_time timestamptz:=p_occurred_at;v_day date:=(p_occurred_at at time zone 'Europe/Amsterdam')::date;
 s public.production_sessions%rowtype;t public.planner_tasks_v2%rowtype;o public.planner_orders_v2%rowtype;
 meta jsonb;wp jsonb;row_item jsonb;ids uuid[];old_emp text;tid text;wpname text;machine text;sid uuid:=(p_payload->>'session_id')::uuid;
 v_phase text;g int;r int;rw int;result jsonb;endtime timestamptz;v_reason text:=coalesce(p_payload->>'reason','');stamp text;
begin
 if not public.portal_is_admin() then raise exception 'Log in met het planneraccount' using errcode='42501';end if;
 if emp not in ('Ralph','Peter','Kaan','Lance','Shaffi') then raise exception 'Onbekende medewerker';end if;
 if p_action not in ('start','phase','counts','stop','close_day','attendance','correction','takeover') then raise exception 'Onbekende actie';end if;
 if at_time>clock_timestamp()+interval '1 minute' or at_time<clock_timestamp()-interval '36 hours' then raise exception 'Registratietijd te oud of in de toekomst; controleer de wachtrij';end if;
 perform pg_advisory_xact_lock(hashtext('ralabaster-production-floor'));
 select e.result into result from public.production_events e where e.request_id=p_request;
 if found then return result;end if;
 -- Reject stale offline commands that would rewrite a newer employee timeline.
 if p_action not in ('counts','correction') and exists(select 1 from public.production_events where employee=emp and occurred_at>at_time) then raise exception 'Er is nieuwere registratie voor deze medewerker. Controleer deze handeling';end if;
 select data into meta from public.planner_shared_state where workspace_id='ralabaster';
 -- Close forgotten shifts at their scheduled end, never accumulate overnight.
 for old_emp in select distinct employee from public.production_sessions where ended_at is null and auto_end<=at_time loop
 perform public.production_settle_labor(old_emp,at_time);
 update public.production_phases p set ended_at=s0.auto_end from public.production_sessions s0 where p.session_id=s0.id and p.ended_at is null and s0.employee=old_emp and s0.ended_at is null and s0.auto_end<=at_time;
 update public.production_sessions set ended_at=auto_end,review_needed=true where employee=old_emp and ended_at is null and auto_end<=at_time;
 perform public.production_open_labor(old_emp,at_time);
 end loop;
 if p_action in ('counts','correction') then at_time:=clock_timestamp();end if;
 perform public.production_settle_labor(emp,at_time);

 if p_action='start' then
 select value into wp from jsonb_array_elements(coalesce(meta->'workplaces','[]')) where value->>'id'=p_payload->>'workplace_id' and coalesce((value->>'active')::boolean,true);
 if wp is null or wp->>'type' in ('external','wait') or wp->>'name' ~* 'instellen' then raise exception 'Kies een actieve fysieke werkplek';end if;
 wpname:=wp->>'name';
 if wp->>'type'='machine' and exists(select 1 from public.production_sessions where lower(workplace_name)=lower(wpname) and ended_at is null) then raise exception 'Deze machine is bezet; neem het werk eerst over';end if;
 tid:=nullif(p_payload->>'task_id','');
 if tid is not null then
 select * into t from public.planner_tasks_v2 where workspace_id='ralabaster' and task_id=tid and not deleted and order_active for update;
 if not found or t.status in ('done','completed','blocked') or coalesce((t.data->>'isStaffAbsence')::boolean,false) then raise exception 'Deze taak kan niet gestart worden';end if;
 select * into o from public.planner_orders_v2 where workspace_id='ralabaster' and order_id=t.order_id and active and not deleted;
 if not found then raise exception 'Order niet actief';end if;
 machine:=coalesce(nullif(t.data->>'assignedMachine',''),t.machine,t.data->>'machine');
 if not (lower(machine)=lower(wpname)
 or (machine ~* '^Mori' and wpname ~* '^Mori' and (machine !~* 'SL25' or wpname ~* 'SL25'))
 or (machine ~* 'instellen' and lower(regexp_replace(machine,'\s*-?\s*instellen.*$','','i'))=lower(wpname))
 or (machine ~* '^Teach.?In' and wpname ~* '^Teach.?In')
 or (machine ~* '^Verlijmen' and wpname='Doppen lijmen')
 or (machine='Werkplaats algemeen' and wpname='INTERN - Algemeen')) then raise exception 'Taak hoort niet bij deze werkplek';end if;
 if coalesce((t.data->>'dependsPrev')::boolean,false) and exists(select 1 from public.planner_tasks_v2 prev where prev.workspace_id='ralabaster' and prev.order_id=t.order_id and not prev.deleted and prev.seq=(select max(q.seq) from public.planner_tasks_v2 q where q.workspace_id='ralabaster' and q.order_id=t.order_id and not q.deleted and q.seq<t.seq) and prev.status not in ('done','completed') and coalesce((prev.data->>'doneQty')::numeric,0)<=0 and prev.task_type not in ('wait','external')) then raise exception 'De vorige bewerking heeft nog geen producten vrijgegeven';end if;
 insert into public.production_task_baselines(workspace_id,task_id,good,actual,synced_good,synced_actual,estimate) values('ralabaster',tid,coalesce((t.data->>'doneQty')::int,0),coalesce((t.data->>'actual')::numeric,0),coalesce((t.data->>'doneQty')::int,0),coalesce((t.data->>'actual')::numeric,0),coalesce((t.data->>'estimate')::numeric,0)) on conflict do nothing;
 elsif wpname<>'INTERN - Algemeen' then raise exception 'Kies een orderbewerking';end if;
 if exists(select 1 from public.production_sessions where employee=emp and task_id is not distinct from tid and lower(workplace_name)=lower(wpname) and ended_at is null) then raise exception 'Je bent al op dit werk ingeklokt';end if;
 endtime:=(v_day+case when extract(isodow from v_day)=5 and emp='Ralph' then time '15:00' else time '16:30' end) at time zone 'Europe/Amsterdam';
 if at_time>=endtime or extract(isodow from v_day)>5 or (extract(isodow from v_day)=5 and emp<>'Ralph') then
 if coalesce((p_payload->>'overtime')::boolean,false) then endtime:=(v_day+time '23:59:59') at time zone 'Europe/Amsterdam';else raise exception 'Buiten standaard werktijd. Kies expliciet Overwerk';end if;end if;
 v_phase:=case when t.data->>'name' ~* 'instellen' then 'setup' else 'production' end;
 sid:=coalesce(sid,gen_random_uuid());
 insert into public.production_sessions(id,employee,workplace_id,workplace_name,workplace_type,task_id,order_id,order_no,product,operation,phase,started_at,auto_end)
 values(sid,emp,wp->>'id',wpname,wp->>'type',tid,t.order_id,o.order_no,o.data->>'product',coalesce(t.data->>'name','Werkplaats algemeen'),v_phase,at_time,endtime);
 insert into public.production_phases(session_id,phase,started_at) values(sid,v_phase,at_time);
 insert into public.production_attendance(day,employee,status) values(v_day,emp,'present') on conflict(workspace_id,day,employee) do update set status='present',reason='',updated_at=at_time;
 elsif p_action='attendance' then
 if p_payload->>'status' not in ('present','absent') then raise exception 'Kies aanwezig of afwezig';end if;
 if p_payload->>'status'='absent' and exists(select 1 from public.production_sessions where employee=emp and ended_at is null) then raise exception 'Sluit eerst het actieve werk af';end if;
 insert into public.production_attendance(day,employee,status,reason) values(v_day,emp,p_payload->>'status',v_reason) on conflict(workspace_id,day,employee) do update set status=excluded.status,reason=excluded.reason,updated_at=at_time;
 elsif p_action='close_day' then
 for row_item in select value from jsonb_array_elements(coalesce(p_payload->'rows','[]')) loop
 select * into s from public.production_sessions where id=(row_item->>'session_id')::uuid and employee=emp and (started_at at time zone 'Europe/Amsterdam')::date=v_day for update;
 if not found then raise exception 'Werk is ondertussen gewijzigd; vernieuw het scherm';end if;
 g:=(row_item->>'good')::int;r:=(row_item->>'scrap')::int;rw:=(row_item->>'rework')::int;
 if g is null or r is null or rw is null or least(g,r,rw)<0 then raise exception 'Vul alle aantallen in (ook nul)';end if;
 if r>0 and coalesce(row_item->>'reason','')='' then raise exception 'Kies een uitvalreden';end if;
 update public.production_sessions set good=good+g,scrap=scrap+r,rework=rework+rw,review_needed=false where id=s.id;
 perform public.production_sync_task(s.task_id,at_time,coalesce((row_item->>'complete')::boolean,false));
 end loop;
 if exists(select 1 from public.production_sessions s0 where s0.employee=emp and s0.ended_at is null and not exists(select 1 from jsonb_array_elements(coalesce(p_payload->'rows','[]')) x where x->>'session_id'=s0.id::text)) or (select count(*) from jsonb_array_elements(coalesce(p_payload->'rows','[]')))<>(select count(distinct value->>'session_id') from jsonb_array_elements(coalesce(p_payload->'rows','[]'))) then raise exception 'Controleer alle actieve werkzaamheden';end if;
 update public.production_phases p set ended_at=at_time from public.production_sessions s0 where p.session_id=s0.id and p.ended_at is null and s0.employee=emp and s0.ended_at is null;
 update public.production_sessions set ended_at=at_time where employee=emp and ended_at is null;
 insert into public.production_attendance(day,employee,status,reason) values(v_day,emp,'closed','Dag afgesloten') on conflict(workspace_id,day,employee) do update set status='closed',reason='Dag afgesloten',updated_at=at_time;
 else
 select * into s from public.production_sessions where id=sid and (employee=emp or p_action='takeover') for update;
 if not found then raise exception 'Registratie niet gevonden';end if;
 if p_action in ('counts','correction','stop') then
 g:=(p_payload->>'good')::int;r:=(p_payload->>'scrap')::int;rw:=(p_payload->>'rework')::int;
 if g is null or r is null or rw is null or (p_action<>'correction' and least(g,r,rw)<0) then raise exception 'Vul aantallen in (ook nul)';end if;
 if p_action='correction' and v_reason='' then raise exception 'Een correctie vereist een reden';end if;
 if r>0 and v_reason='' then raise exception 'Kies een uitvalreden';end if;
 if p_action='stop' and s.ended_at is not null and not s.review_needed then raise exception 'Werk is al gestopt';end if;
 update public.production_sessions set good=good+g,scrap=scrap+r,rework=rework+rw,review_needed=false where id=sid;
 if p_action='stop' then
 update public.production_phases set ended_at=at_time where session_id=sid and ended_at is null;
 update public.production_sessions set ended_at=coalesce(ended_at,at_time) where id=sid;
 end if;
 perform public.production_sync_task(s.task_id,at_time,coalesce((p_payload->>'complete')::boolean,false));
 if coalesce((p_payload->>'complete')::boolean,false) then
 if exists(select 1 from public.production_sessions where task_id=s.task_id and id<>sid and ended_at is null) then raise exception 'Andere medewerkers of machines werken nog aan deze bewerking';end if;
 update public.production_phases set ended_at=at_time where session_id=sid and ended_at is null;
 update public.production_sessions set ended_at=coalesce(ended_at,at_time) where id=sid;
 end if;
 elsif p_action='phase' then
 if s.ended_at is not null then raise exception 'Werk is al gestopt';end if;
 v_phase:=p_payload->>'phase';if v_phase not in ('production','setup','downtime','waiting') then raise exception 'Onbekende status';end if;
 if v_phase in ('downtime','waiting') and v_reason='' then raise exception 'Kies een reden';end if;
 update public.production_phases set ended_at=at_time where session_id=sid and ended_at is null;
 insert into public.production_phases(session_id,phase,started_at,reason) values(sid,v_phase,at_time,v_reason);
 update public.production_sessions set phase=v_phase,reason=v_reason,engaged=coalesce((p_payload->>'engaged')::boolean,v_phase in ('production','setup')) where id=sid;
 elsif p_action='takeover' then
 if s.ended_at is not null or s.employee=emp then raise exception 'Dit werk kan niet worden overgenomen';end if;
 old_emp:=s.employee;perform public.production_settle_labor(old_emp,at_time);
 update public.production_phases set ended_at=at_time where session_id=sid and ended_at is null;
 update public.production_sessions set ended_at=coalesce(ended_at,at_time) where id=sid;
 sid:=gen_random_uuid();
 insert into public.production_sessions(id,employee,workplace_id,workplace_name,workplace_type,task_id,order_id,order_no,product,operation,phase,engaged,started_at,auto_end,reason)
 values(sid,emp,s.workplace_id,s.workplace_name,s.workplace_type,s.task_id,s.order_id,s.order_no,s.product,s.operation,s.phase,s.engaged,at_time,s.auto_end,s.reason);
 insert into public.production_phases(session_id,phase,started_at,reason) values(sid,s.phase,at_time,s.reason);
 perform public.production_open_labor(old_emp,at_time);
 insert into public.production_attendance(day,employee,status) values(v_day,emp,'present') on conflict(workspace_id,day,employee) do update set status='present',reason='',updated_at=at_time;
 end if;
 end if;
 perform public.production_open_labor(emp,at_time);
 for tid in select distinct task_id from public.production_sessions where employee=emp and task_id is not null and (ended_at is null or (ended_at at time zone 'Europe/Amsterdam')::date=v_day) loop
 if not exists(select 1 from public.planner_tasks_v2 where workspace_id='ralabaster' and task_id=tid and status='done') then perform public.production_sync_task(tid,at_time,false);end if;
 end loop;
 result:=jsonb_build_object('ok',true,'session_id',sid,'at',at_time);
 insert into public.production_events(request_id,employee,action,session_id,occurred_at,payload,result) values(p_request,emp,p_action,sid,p_occurred_at,p_payload,result);
 return result;
end$$;

create function public.production_snapshot(p_day date default (now() at time zone 'Europe/Amsterdam')::date) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare meta jsonb;result jsonb;
begin
 if not public.portal_is_admin() then raise exception 'Log in met het planneraccount' using errcode='42501';end if;
 select data into meta from public.planner_shared_state where workspace_id='ralabaster';
 select jsonb_build_object('serverNow',now(),'day',p_day,'workplaces',coalesce(meta->'workplaces','[]'),'staffAbsences',coalesce(meta->'staffAbsences','[]'),'dayOverrides',coalesce(meta->'dayOverrides','{}'),
 'orders',coalesce((select jsonb_agg(jsonb_build_object('id',order_id,'orderNo',order_no,'product',data->>'product','qty',data->'qty','deadline',data->>'deadline','internalExpectedDate',data->>'internalExpectedDate','customerName',data->>'customerName')) from public.planner_orders_v2 where workspace_id='ralabaster' and active and not deleted),'[]'),
 'tasks',coalesce((select jsonb_agg(jsonb_build_object('id',task_id,'orderId',order_id,'name',data->>'name','machine',machine,'assignedMachine',data->>'assignedMachine','estimate',data->'estimate','actual',data->'actual','doneQty',data->'doneQty','status',status,'seq',seq,'dependsPrev',data->'dependsPrev','type',task_type,'planSegments',data->'planSegments','employee',employee,'date',task_date,'isStaffAbsence',data->'isStaffAbsence')) from public.planner_tasks_v2 where workspace_id='ralabaster' and order_active and not deleted),'[]'),
 'sessions',coalesce((select jsonb_agg(to_jsonb(s)) from public.production_sessions s where ended_at is null or (started_at at time zone 'Europe/Amsterdam')::date>=p_day-30),'[]'),
 'phases',coalesce((select jsonb_agg(to_jsonb(p)) from public.production_phases p join public.production_sessions s on s.id=p.session_id where s.ended_at is null or (s.started_at at time zone 'Europe/Amsterdam')::date>=p_day-30),'[]'),
 'labor',coalesce((select jsonb_agg(to_jsonb(l)) from public.production_labor l where ended_at is null or (started_at at time zone 'Europe/Amsterdam')::date>=p_day-30),'[]'),
 'attendance',coalesce((select jsonb_agg(to_jsonb(a)) from public.production_attendance a where day>=p_day-30),'[]'),
 'baselines',coalesce((select jsonb_agg(to_jsonb(b)) from public.production_task_baselines b),'[]'),
 'events',coalesce((select jsonb_agg(to_jsonb(e)) from (select request_id,employee,action,session_id,occurred_at,recorded_at,payload from public.production_events where (occurred_at at time zone 'Europe/Amsterdam')::date>=p_day-30 order by occurred_at desc limit 3000)e),'[]')
 ) into result;return result;
end$$;
revoke all on function public.production_minutes(timestamptz,timestamptz,boolean),public.production_settle_labor(text,timestamptz),public.production_open_labor(text,timestamptz),public.production_sync_task(text,timestamptz,boolean),public.production_command(uuid,text,jsonb,timestamptz),public.production_snapshot(date) from public,anon,authenticated;
grant execute on function public.production_minutes(timestamptz,timestamptz,boolean),public.production_settle_labor(text,timestamptz),public.production_open_labor(text,timestamptz),public.production_sync_task(text,timestamptz,boolean),public.production_command(uuid,text,jsonb,timestamptz),public.production_snapshot(date) to authenticated;

-- Include the independent time/audit ledgers in existing hourly/daily exports.
create or replace function planner_recovery.capture_daily_snapshot(p_reason text default 'daily') returns void
language plpgsql security invoker set search_path='' as $$
begin
 insert into planner_recovery.daily_snapshots(workspace_id,reason,data)
 select s.workspace_id,p_reason,jsonb_build_object(
  'sharedState',to_jsonb(s),
  'orders',coalesce((select jsonb_agg(to_jsonb(o)) from public.planner_orders_v2 o where o.workspace_id=s.workspace_id),'[]'::jsonb),
  'tasks',coalesce((select jsonb_agg(to_jsonb(t)) from public.planner_tasks_v2 t where t.workspace_id=s.workspace_id),'[]'::jsonb),
  'workers',coalesce((select jsonb_agg(to_jsonb(w)) from public.planner_workers w where w.workspace_id=s.workspace_id),'[]'::jsonb),
  'legacyStates',coalesce((select jsonb_agg(to_jsonb(l)) from public.planner_state l),'[]'::jsonb),
  'productionSessions',coalesce((select jsonb_agg(to_jsonb(x)) from public.production_sessions x where x.workspace_id=s.workspace_id),'[]'::jsonb),
  'productionPhases',coalesce((select jsonb_agg(to_jsonb(x)) from public.production_phases x where x.workspace_id=s.workspace_id),'[]'::jsonb),
  'productionLabor',coalesce((select jsonb_agg(to_jsonb(x)) from public.production_labor x where x.workspace_id=s.workspace_id),'[]'::jsonb),
  'productionEvents',coalesce((select jsonb_agg(to_jsonb(x)) from public.production_events x where x.workspace_id=s.workspace_id),'[]'::jsonb),
  'productionAttendance',coalesce((select jsonb_agg(to_jsonb(x)) from public.production_attendance x where x.workspace_id=s.workspace_id),'[]'::jsonb),
  'productionBaselines',coalesce((select jsonb_agg(to_jsonb(x)) from public.production_task_baselines x where x.workspace_id=s.workspace_id),'[]'::jsonb)
 ) from public.planner_shared_state s;
 delete from planner_recovery.daily_snapshots where reason='hourly' and created_at<now()-interval '7 days';
 delete from planner_recovery.daily_snapshots where reason<>'hourly' and created_at<now()-interval '90 days';
end$$;
revoke all on function planner_recovery.capture_daily_snapshot(text) from public,anon,authenticated;

notify pgrst,'reload schema';
commit;

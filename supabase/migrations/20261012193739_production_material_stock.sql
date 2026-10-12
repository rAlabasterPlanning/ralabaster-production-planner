begin;
create table public.production_materials(id uuid primary key default gen_random_uuid(),workspace_id text not null default 'ralabaster' check(workspace_id='ralabaster'),sku text not null,name text not null,category text not null check(category in ('abrasive','tool','other')),unit text not null check(unit in ('stuks','kg','liter','meter')),workplaces text[] not null default '{}',stock numeric(14,3) not null default 0,stock_known boolean not null default false,minimum numeric(14,3) not null default 0 check(minimum>=0),unit_cost numeric(14,4) not null default 0 check(unit_cost>=0),revision bigint not null default 1,active boolean not null default true,unique(workspace_id,sku));
create table public.production_material_moves(id uuid primary key default gen_random_uuid(),workspace_id text not null default 'ralabaster' check(workspace_id='ralabaster'),material_id uuid references public.production_materials(id),session_id uuid references public.production_sessions(id),order_id text,workplace_name text,employee text,kind text not null check(kind in ('initial','stocktake','receipt','used','broken','alabaster_scrap')),quantity numeric(14,3) not null,stock_delta numeric(14,3) not null default 0,unit text not null,unit_cost numeric(14,4) not null default 0,reason text not null default '',request_id uuid not null,line_key text not null,occurred_at timestamptz not null default now(),actor uuid not null default auth.uid(),unique(request_id,line_key));
create index production_material_moves_session on public.production_material_moves(session_id);
create table public.production_material_requests(request_id uuid primary key,workspace_id text not null default 'ralabaster' check(workspace_id='ralabaster'),result jsonb not null,actor uuid not null default auth.uid());
do $$declare t text;begin foreach t in array array['production_materials','production_material_moves','production_material_requests'] loop
execute format('alter table public.%I enable row level security',t);execute format('revoke all on public.%I from public,anon,authenticated',t);execute format('grant select,insert on public.%I to authenticated',t);execute format('create policy materials_read on public.%I for select to authenticated using(public.portal_is_admin() and workspace_id=''ralabaster'')',t);execute format('create policy materials_insert on public.%I for insert to authenticated with check(public.portal_is_admin() and workspace_id=''ralabaster'')',t);end loop;end$$;
grant update on public.production_materials to authenticated;
create policy materials_update on public.production_materials for update to authenticated using(public.portal_is_admin() and workspace_id='ralabaster') with check(public.portal_is_admin() and workspace_id='ralabaster');
create function public.production_material_consume(p_request uuid,p_session uuid,p_items jsonb,p_stone numeric,p_at timestamptz) returns void language plpgsql security invoker set search_path='' as $$
declare s public.production_sessions%rowtype;m public.production_materials%rowtype;x jsonb;q numeric;idx int:=0;k text;
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
update public.production_materials set stock=stock-q,revision=revision+1 where id=m.id;
insert into public.production_material_moves(material_id,session_id,order_id,workplace_name,employee,kind,quantity,stock_delta,unit,unit_cost,reason,request_id,line_key,occurred_at) values(m.id,s.id,s.order_id,s.workplace_name,s.employee,x->>'kind',q,-q,m.unit,m.unit_cost,coalesce(x->>'reason',''),p_request,k,p_at);
end loop;
if coalesce(p_stone,0)<0 or coalesce(p_stone,0)<>round(coalesce(p_stone,0),3) then raise exception 'Ongeldig albastgewicht';end if;
if coalesce(p_stone,0)>0 then
insert into public.production_material_moves(session_id,order_id,workplace_name,employee,kind,quantity,unit,reason,request_id,line_key,occurred_at) values(s.id,s.order_id,s.workplace_name,s.employee,'alabaster_scrap',p_stone,'kg','Albastuitval; steenvoorraad niet nogmaals afgeboekt',p_request,p_session::text||':stone',p_at) on conflict(request_id,line_key) do nothing;
end if;end$$;
create function public.production_material_command(p_request uuid,p_payload jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare m public.production_materials%rowtype;act text:=p_payload->>'action';q numeric;delta numeric;result jsonb;
begin
if not public.portal_is_admin() then raise exception 'Log in met het planneraccount' using errcode='42501';end if;
perform pg_advisory_xact_lock(hashtext('ralabaster-production-floor'));
select r.result into result from public.production_material_requests r where request_id=p_request;if found then return result;end if;
if act='create' then
if coalesce(trim(p_payload->>'name'),'')='' or coalesce(trim(p_payload->>'sku'),'')='' then raise exception 'Vul artikelnaam en code in';end if;
insert into public.production_materials(sku,name,category,unit,workplaces,minimum,unit_cost) values(trim(p_payload->>'sku'),trim(p_payload->>'name'),p_payload->>'category',p_payload->>'unit',array(select jsonb_array_elements_text(coalesce(p_payload->'workplaces','[]'))),coalesce((p_payload->>'minimum')::numeric,0),coalesce((p_payload->>'unit_cost')::numeric,0)) returning * into m;
else
select * into m from public.production_materials where id=(p_payload->>'material_id')::uuid for update;if not found then raise exception 'Artikel niet gevonden';end if;
if m.revision<>coalesce((p_payload->>'revision')::bigint,0) then raise exception 'Voorraad is gewijzigd; vernieuw het scherm en controleer opnieuw';end if;
end if;
if act in ('stocktake','receipt') or (act='create' and nullif(p_payload->>'quantity','') is not null) then
q:=(p_payload->>'quantity')::numeric;if q is null or q<0 or q<>round(q,3) or (m.unit='stuks' and q<>trunc(q)) then raise exception 'Vul een geldige voorraad in';end if;
if act='receipt' and not m.stock_known then raise exception 'Voer eerst de huidige voorraad in';end if;
delta:=case when act='receipt' then q else q-m.stock end;
update public.production_materials set stock=case when act='receipt' then stock+q else q end,stock_known=true,revision=revision+1 where id=m.id;
insert into public.production_material_moves(material_id,kind,quantity,stock_delta,unit,reason,request_id,line_key) values(m.id,case when act='receipt' then 'receipt' when m.stock_known then 'stocktake' else 'initial' end,q,delta,m.unit,coalesce(p_payload->>'reason','Voorraad ingevoerd'),p_request,'stock');
end if;
if act='settings' then update public.production_materials set minimum=(p_payload->>'minimum')::numeric,unit_cost=(p_payload->>'unit_cost')::numeric,revision=revision+1 where id=m.id;elsif act not in ('create','stocktake','receipt') then raise exception 'Onbekende voorraadactie';end if;
result:=jsonb_build_object('ok',true,'material_id',m.id);insert into public.production_material_requests(request_id,result) values(p_request,result);return result;
end$$;
revoke all on function public.production_material_consume(uuid,uuid,jsonb,numeric,timestamptz),public.production_material_command(uuid,jsonb) from public,anon;
grant execute on function public.production_material_consume(uuid,uuid,jsonb,numeric,timestamptz),public.production_material_command(uuid,jsonb) to authenticated;
insert into public.production_materials(sku,name,category,unit,workplaces) select 'SCH-'||d||'-P'||g,'Schuurschijf Ø'||d||' · P'||g,'abrasive','stuks',array['Schuren','Polijsten'] from unnest(array[90,150])d cross join unnest(array[80,120,180,240,320])g;
create or replace function public.production_command(p_request uuid,p_action text,p_payload jsonb,p_occurred_at timestamptz default now()) returns jsonb
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
 if exists(select 1 from public.production_workplace_incidents where lower(workplace_name)=lower(wpname) and resolved_at is null) then raise exception 'Werkplek staat buiten gebruik; geef deze eerst vrij';end if;
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
 elsif nullif(p_payload->>'order_id','') is not null then
 select * into o from public.planner_orders_v2 where workspace_id='ralabaster' and order_id=p_payload->>'order_id' and active and not deleted for update;
 if not found then raise exception 'Order niet actief';end if;
 if exists(select 1 from public.production_sessions where employee=emp and order_id=o.order_id and lower(workplace_name)=lower(wpname) and ended_at is null) then raise exception 'Je bent al op deze order en werkplek ingeklokt';end if;
 -- Infer the earliest remaining operation on this physical workplace, only to verify prerequisites.
 select * into t from public.planner_tasks_v2 candidate where candidate.workspace_id='ralabaster' and candidate.order_id=o.order_id and not candidate.deleted and candidate.status not in ('done','completed') and candidate.task_type not in ('wait','external') and not coalesce((candidate.data->>'isStaffAbsence')::boolean,false) and (
 lower(coalesce(nullif(candidate.data->>'assignedMachine',''),candidate.machine))=lower(wpname)
 or (coalesce(nullif(candidate.data->>'assignedMachine',''),candidate.machine) ~* '^Mori' and wpname ~* '^Mori' and (coalesce(nullif(candidate.data->>'assignedMachine',''),candidate.machine) !~* 'SL25' or wpname ~* 'SL25'))
 or (candidate.machine ~* 'instellen' and lower(regexp_replace(candidate.machine,'\s*-?\s*instellen.*$','','i'))=lower(wpname))
 or (candidate.machine ~* '^Teach.?In' and wpname ~* '^Teach.?In')
 or (candidate.machine ~* '^Verlijmen' and wpname='Doppen lijmen')
 or (candidate.machine='Werkplaats algemeen' and wpname='INTERN - Algemeen')) order by candidate.seq,candidate.task_id limit 1;
 if t.task_id is null then raise exception 'Deze order heeft geen open bewerking voor deze werkplek';end if;
 for row_item in select value from jsonb_array_elements(coalesce(p_payload->'completed_predecessors','[]')) loop
 if t.task_id is null then raise exception 'Geen bijbehorende route gevonden; vernieuw het overzicht';end if;
 perform 1 from public.planner_tasks_v2 q where q.workspace_id='ralabaster' and q.task_id=row_item->>'id' for update;
 if not exists(select 1 from public.planner_tasks_v2 q where q.workspace_id='ralabaster' and q.order_id=o.order_id and q.task_id=row_item->>'id' and not q.deleted and q.seq<t.seq and not coalesce((q.data->>'isStaffAbsence')::boolean,false) and coalesce(q.data->>'taskProgressUpdatedAt','')=coalesce(row_item->>'revision','')) then raise exception 'Een eerdere taak is gewijzigd; vernieuw het overzicht';end if;
 stamp:=to_char(at_time at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
 update public.planner_tasks_v2 set status='done',data=data||jsonb_build_object('status','done','doneQty',coalesce((o.data->>'qty')::numeric,0),'completedAt',stamp,'taskProgressUpdatedAt',stamp,'completionSource','production-order-start','completionEmployee',emp),updated_at=at_time where workspace_id='ralabaster' and task_id=row_item->>'id' and status not in ('done','completed');
 if not exists(select 1 from public.planner_tasks_v2 q where q.workspace_id='ralabaster' and q.task_id=row_item->>'id' and q.status in ('done','completed')) then raise exception 'Gereedmelding niet bevestigd; vernieuw het overzicht';end if;
 end loop;
 -- Session deliberately belongs to the order, not the inferred operation.
 t.task_id:=null;
 elsif wpname<>'INTERN - Algemeen' then raise exception 'Kies een order';end if;
 if exists(select 1 from public.production_sessions where employee=emp and task_id is not distinct from tid and order_id is not distinct from o.order_id and lower(workplace_name)=lower(wpname) and ended_at is null) then raise exception 'Je bent al op dit werk ingeklokt';end if;
 endtime:=(v_day+case when extract(isodow from v_day)=5 and emp='Ralph' then time '15:00' else time '16:30' end) at time zone 'Europe/Amsterdam';
 if at_time>=endtime or extract(isodow from v_day)>5 or (extract(isodow from v_day)=5 and emp<>'Ralph') then
 if coalesce((p_payload->>'overtime')::boolean,false) then endtime:=(v_day+time '23:59:59') at time zone 'Europe/Amsterdam';else raise exception 'Buiten standaard werktijd. Kies expliciet Overwerk';end if;end if;
 v_phase:=case when tid is not null and t.data->>'name' ~* 'instellen' then 'setup' else 'production' end;
 sid:=coalesce(sid,gen_random_uuid());
 insert into public.production_sessions(id,employee,workplace_id,workplace_name,workplace_type,task_id,order_id,order_no,product,operation,phase,started_at,auto_end)
 values(sid,emp,wp->>'id',wpname,wp->>'type',tid,coalesce(o.order_id,t.order_id),o.order_no,o.data->>'product',case when tid is null and o.order_id is not null then 'Orderwerk' else coalesce(t.data->>'name','Werkplaats algemeen') end,case when tid is null then 'production' else v_phase end,at_time,endtime);
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
 v_phase:=p_payload->>'phase';if v_phase in ('production','setup') and exists(select 1 from public.production_workplace_incidents where lower(workplace_name)=lower(s.workplace_name) and resolved_at is null) then raise exception 'Werkplek staat buiten gebruik; geef deze eerst vrij';end if;if v_phase not in ('production','setup','downtime','waiting') then raise exception 'Onbekende status';end if;
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
 -- Explicitly complete an order-level operation only when its good output covers the order.
 if p_action='stop' and coalesce((p_payload->>'workplace_complete')::boolean,false) then
 select * into s from public.production_sessions where id=sid;
 select * into o from public.planner_orders_v2 where workspace_id='ralabaster' and order_id=s.order_id and active and not deleted for update;
 if o.order_id is null then raise exception 'Order niet actief';end if;
 select * into t from public.planner_tasks_v2 q where q.workspace_id='ralabaster' and q.order_id=s.order_id and not q.deleted and q.status not in ('done','completed') and q.task_type not in ('wait','external') and coalesce(q.data->>'name',q.machine) !~* 'instellen' and (lower(coalesce(nullif(q.data->>'assignedMachine',''),q.machine))=lower(s.workplace_name) or (coalesce(nullif(q.data->>'assignedMachine',''),q.machine) ~* '^Mori' and s.workplace_name ~* '^Mori' and (coalesce(nullif(q.data->>'assignedMachine',''),q.machine) !~* 'SL25' or s.workplace_name ~* 'SL25')) or (q.machine ~* '^Teach.?In' and s.workplace_name ~* '^Teach.?In') or (q.machine='Verlijmen' and s.workplace_name='Doppen lijmen') or (q.machine='Werkplaats algemeen' and s.workplace_name='INTERN - Algemeen')) order by q.seq limit 1 for update;
 if t.task_id is null then raise exception 'Geen open bewerking gevonden; controleer de planner';end if;
 if exists(select 1 from public.production_sessions x where x.id<>sid and x.order_id=s.order_id and x.ended_at is null and (lower(x.workplace_name)=lower(s.workplace_name) or (x.workplace_name ~* '^Mori' and s.workplace_name ~* '^Mori'))) then raise exception 'Andere machines of medewerkers werken nog aan deze bewerking';end if;
 if (select coalesce(sum(x.good),0) from public.production_sessions x where x.order_id=s.order_id and (lower(x.workplace_name)=lower(s.workplace_name) or (x.workplace_name ~* '^Mori' and s.workplace_name ~* '^Mori')))<coalesce((o.data->>'qty')::numeric,0) then raise exception 'Nog niet alle producten gereed; registreer alleen stoppen of de resterende aantallen';end if;
 stamp:=to_char(at_time at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
 update public.planner_tasks_v2 set status='done',data=data||jsonb_build_object('status','done','doneQty',(o.data->>'qty')::numeric,'completedAt',stamp,'taskProgressUpdatedAt',stamp,'completionSource','production-order-finish','completionEmployee',emp),updated_at=at_time where workspace_id='ralabaster' and task_id=t.task_id;
 if not exists(select 1 from public.planner_tasks_v2 where workspace_id='ralabaster' and task_id=t.task_id and status='done') then raise exception 'Gereedmelding niet bevestigd';end if;
 end if;
 if p_action='close_day' then for row_item in select value from jsonb_array_elements(coalesce(p_payload->'rows','[]')) loop perform public.production_material_consume(p_request,(row_item->>'session_id')::uuid,row_item->'materials',(row_item->>'stone_loss_kg')::numeric,at_time);end loop;elsif p_action in ('counts','stop','phase') and sid is not null then perform public.production_material_consume(p_request,sid,p_payload->'materials',(p_payload->>'stone_loss_kg')::numeric,at_time);end if;
 perform public.production_open_labor(emp,at_time);
 for tid in select distinct task_id from public.production_sessions where employee=emp and task_id is not null and (ended_at is null or (ended_at at time zone 'Europe/Amsterdam')::date=v_day) loop
 if not exists(select 1 from public.planner_tasks_v2 where workspace_id='ralabaster' and task_id=tid and status='done') then perform public.production_sync_task(tid,at_time,false);end if;
 end loop;
 result:=jsonb_build_object('ok',true,'session_id',sid,'at',at_time);
 insert into public.production_events(request_id,employee,action,session_id,occurred_at,payload,result) values(p_request,emp,p_action,sid,p_occurred_at,p_payload,result);
 return result;
end$$;
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
 'orders',coalesce((select jsonb_agg(jsonb_build_object('id',order_id,'orderNo',order_no,'product',data->>'product','qty',data->'qty','deadline',data->>'deadline','internalExpectedDate',data->>'internalExpectedDate','customerName',data->>'customerName')) from public.planner_orders_v2 where workspace_id='ralabaster' and active and not deleted),'[]'),
 'tasks',coalesce((select jsonb_agg(jsonb_build_object('id',task_id,'orderId',order_id,'name',data->>'name','machine',machine,'assignedMachine',data->>'assignedMachine','estimate',data->'estimate','actual',data->'actual','doneQty',data->'doneQty','status',status,'seq',seq,'dependsPrev',data->'dependsPrev','taskProgressUpdatedAt',data->'taskProgressUpdatedAt','type',task_type,'planSegments',data->'planSegments','employee',employee,'date',task_date,'isStaffAbsence',data->'isStaffAbsence')) from public.planner_tasks_v2 where workspace_id='ralabaster' and order_active and not deleted),'[]'),
 'historicalProgress',coalesce((select jsonb_agg(to_jsonb(h)) from (select s.order_id,case when s.workplace_name ~* '^Mori' then 'mori' else lower(regexp_replace(trim(s.workplace_name),'\s+',' ','g')) end as family,sum(s.good) as good,sum(s.scrap) as scrap,sum(coalesce((select sum(public.production_minutes(p.started_at,least(coalesce(p.ended_at,s.ended_at),s.auto_end),s.workplace_type<>'machine')) from public.production_phases p where p.session_id=s.id and p.phase='production'),0)) as production from public.production_sessions s where s.ended_at is not null and (s.started_at at time zone 'Europe/Amsterdam')::date<p_day-30 and exists(select 1 from public.planner_orders_v2 o where o.workspace_id='ralabaster' and o.order_id=s.order_id and o.active and not o.deleted) group by s.order_id,2)h),'[]'),
 'sessions',coalesce((select jsonb_agg(to_jsonb(s)) from public.production_sessions s where ended_at is null or (started_at at time zone 'Europe/Amsterdam')::date>=p_day-30),'[]'),
 'phases',coalesce((select jsonb_agg(to_jsonb(p)) from public.production_phases p join public.production_sessions s on s.id=p.session_id where s.ended_at is null or (s.started_at at time zone 'Europe/Amsterdam')::date>=p_day-30),'[]'),
 'labor',coalesce((select jsonb_agg(to_jsonb(l)) from public.production_labor l where ended_at is null or (started_at at time zone 'Europe/Amsterdam')::date>=p_day-30),'[]'),
 'attendance',coalesce((select jsonb_agg(to_jsonb(a)) from public.production_attendance a where day>=p_day-30),'[]'),
 'baselines',coalesce((select jsonb_agg(to_jsonb(b)) from public.production_task_baselines b),'[]'),
 'events',coalesce((select jsonb_agg(to_jsonb(e)) from (select request_id,employee,action,session_id,occurred_at,recorded_at,payload from public.production_events where (occurred_at at time zone 'Europe/Amsterdam')::date>=p_day-30 order by occurred_at desc limit 3000)e),'[]')
 ) into result;return result;
end$$;
CREATE OR REPLACE FUNCTION planner_recovery.capture_daily_snapshot(p_reason text DEFAULT 'daily'::text)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
 insert into planner_recovery.daily_snapshots(workspace_id,reason,data)
 select s.workspace_id,p_reason,jsonb_build_object(
  'sharedState',to_jsonb(s),
 'productionMaterials',coalesce((select jsonb_agg(to_jsonb(x)) from public.production_materials x where x.workspace_id=s.workspace_id),'[]'::jsonb),
 'productionMaterialMoves',coalesce((select jsonb_agg(to_jsonb(x)) from public.production_material_moves x where x.workspace_id=s.workspace_id),'[]'::jsonb),
 'productionMaterialRequests',coalesce((select jsonb_agg(to_jsonb(x)) from public.production_material_requests x where x.workspace_id=s.workspace_id),'[]'::jsonb),
 'productionWorkplaceIncidents',coalesce((select jsonb_agg(to_jsonb(x)) from public.production_workplace_incidents x where x.workspace_id=s.workspace_id),'[]'::jsonb),
 'productionWorkplaceEvents',coalesce((select jsonb_agg(to_jsonb(x)) from public.production_workplace_events x where x.workspace_id=s.workspace_id),'[]'::jsonb),
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
end$function$;
commit;

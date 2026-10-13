-- Allow non-countable work to report an estimated task percentage.
begin;
create table public.production_task_progress (
 workspace_id text not null default 'ralabaster' check(workspace_id='ralabaster'),
 task_id text not null,order_id text not null,workplace_name text not null,
 mode text not null default 'counts' check(mode in ('counts','percent')),
 percent numeric(5,2) check(percent is null or percent between 0 and 100),
 revision integer not null default 1,updated_at timestamptz not null default now(),actor uuid not null default auth.uid(),
 primary key(workspace_id,task_id,workplace_name),
 check((mode='counts' and percent is null) or (mode='percent' and percent is not null))
);
alter table public.production_task_progress enable row level security;
revoke all on public.production_task_progress from public,anon,authenticated;
grant select,insert,update on public.production_task_progress to authenticated;
create policy production_task_progress_admin on public.production_task_progress for all to authenticated
 using(public.portal_is_admin() and workspace_id='ralabaster')
 with check(public.portal_is_admin() and workspace_id='ralabaster');

create or replace function public.production_checkpoint(p_request uuid,p_payload jsonb,p_occurred_at timestamptz default now()) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare s public.production_sessions%rowtype; result jsonb; v_payload jsonb:=p_payload; field text; total numeric; previous numeric; expected numeric; item jsonb; material_rows jsonb:='[]'; loss numeric; action text:=coalesce(p_payload->>'action','counts'); progress public.production_task_progress%rowtype; progress_mode text; progress_percent numeric; expected_revision integer;
begin
 if not public.portal_is_admin() then raise exception 'Log in met het planneraccount' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtext('ralabaster-production-floor'));
 select e.result into result from public.production_events e where e.request_id=p_request;
 if found then return result;end if;
 if action not in ('counts','stop') then raise exception 'Onbekende tussenstandactie';end if;
 select * into s from public.production_sessions where id=(p_payload->>'session_id')::uuid and employee=p_payload->>'employee' for update;
 if not found or (s.ended_at is not null and not s.review_needed) then raise exception 'Werk gewijzigd of afgesloten; vernieuw de registratie';end if;
 foreach field in array array['good','scrap','rework','stone_used_pieces','stone_used_kg'] loop
  total:=(p_payload->>field)::numeric;previous:=coalesce((to_jsonb(s)->>field)::numeric,0);expected:=(p_payload->'expected'->>field)::numeric;
  if total is null or expected is null or expected<>previous then raise exception 'Tussenstand is intussen gewijzigd; vernieuw en controleer je invoer';end if;
  if total<previous or (field in ('good','scrap','rework','stone_used_pieces') and total<>trunc(total)) then raise exception 'Vul een geldig totaal in, minimaal de al geregistreerde waarde. Gebruik correctie om aantallen te verlagen';end if;
  if field in ('good','scrap','rework') then v_payload:=jsonb_set(v_payload,array[field],to_jsonb(total-previous));end if;
 end loop;
 if p_payload ? 'task_id' then
  if not exists(select 1 from public.planner_tasks_v2 t where t.workspace_id='ralabaster' and t.task_id=p_payload->>'task_id' and t.order_id=s.order_id and not t.deleted) then raise exception 'Bewerking voor voortgang niet gevonden';end if;
  select * into progress from public.production_task_progress where workspace_id='ralabaster' and task_id=p_payload->>'task_id' and lower(workplace_name)=lower(s.workplace_name) for update;
  expected_revision:=coalesce((p_payload->>'expected_progress_revision')::integer,-1);
  if expected_revision<>coalesce(progress.revision,0) then raise exception 'Voortgang is intussen gewijzigd; open de telling opnieuw';end if;
  progress_mode:=coalesce(p_payload->>'progress_mode','counts');progress_percent:=(p_payload->>'progress_percent')::numeric;
  if progress_mode not in ('counts','percent') or (progress_mode='percent' and (progress_percent is null or progress_percent<0 or progress_percent>100)) then raise exception 'Kies een geldige voortgang tussen 0 en 100%%';end if;
  if progress_mode='counts' then progress_percent:=null;end if;
  insert into public.production_task_progress(task_id,order_id,workplace_name,mode,percent)
  values(p_payload->>'task_id',s.order_id,s.workplace_name,progress_mode,progress_percent)
  on conflict(workspace_id,task_id,workplace_name) do update set mode=excluded.mode,percent=excluded.percent,revision=public.production_task_progress.revision+1,updated_at=now(),actor=auth.uid();
 end if;
 if (select count(*) from jsonb_array_elements(coalesce(p_payload->'materials','[]')))<>(select count(distinct (value->>'material_id',coalesce(value->>'kind','used'))) from jsonb_array_elements(coalesce(p_payload->'materials','[]'))) then raise exception 'Een artikel is dubbel ingevoerd';end if;
 for item in select value from jsonb_array_elements(coalesce(p_payload->'materials','[]')) loop
  if coalesce(item->>'kind','used') not in ('used','broken') then raise exception 'Onbekend materiaalverbruik';end if;
  select coalesce(sum(quantity),0) into previous from public.production_material_moves where session_id=s.id and material_id=(item->>'material_id')::uuid and kind=coalesce(item->>'kind','used');
  total:=(item->>'quantity')::numeric;expected:=(item->>'expected')::numeric;
  if expected is null or expected<>previous or total is null or total<previous then raise exception 'Materiaalverbruik gewijzigd of totaal te laag; controleer de invoer';end if;
  if total>previous then material_rows:=material_rows||jsonb_build_array(item||jsonb_build_object('quantity',total-previous));end if;
 end loop;
 select coalesce(sum(quantity),0) into previous from public.production_material_moves where session_id=s.id and kind='alabaster_scrap';
 loss:=(p_payload->>'stone_loss_kg')::numeric;expected:=(p_payload->'expected'->>'stone_loss_kg')::numeric;
 if loss is null or expected is null or expected<>previous or loss<previous then raise exception 'Albastuitval gewijzigd of totaal te laag';end if;
 v_payload:=v_payload||jsonb_build_object('materials',material_rows,'stone_loss_kg',loss-previous,'checkpoint_totals',p_payload-'expected');
 result:=public.production_command(p_request,action,v_payload,p_occurred_at);
 update public.production_sessions set stone_used_pieces=(p_payload->>'stone_used_pieces')::int,stone_used_kg=(p_payload->>'stone_used_kg')::numeric where id=s.id;
 return result;
end$$;

create or replace function public.production_monitor_snapshot() returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare snap jsonb;ctx jsonb;
begin
 if not public.portal_is_admin() then raise exception 'Log in met het planneraccount' using errcode='42501';end if;
 snap:=public.production_cost_snapshot();
 select coalesce(jsonb_agg(x||jsonb_build_object('last_report_at',greatest((x->>'last_report_at')::timestamptz,(select max(b.cutoff) from public.production_opening_balances b join public.production_sessions s on s.order_id=b.order_id and lower(s.workplace_name)=lower(b.workplace_name) where s.id=(x->>'session_id')::uuid and s.started_at<=b.cutoff)))),'[]') into ctx from jsonb_array_elements(public.production_checkpoint_context())x;
 return snap||jsonb_build_object(
  'checkpointContext',ctx,
  'openingBalances',coalesce((select jsonb_agg(to_jsonb(b)) from public.production_opening_balances b where workspace_id='ralabaster'),'[]'),
  'taskProgress',coalesce((select jsonb_agg(to_jsonb(p)) from public.production_task_progress p where workspace_id='ralabaster'),'[]')
 );
end$$;
revoke all on function public.production_checkpoint(uuid,jsonb,timestamptz),public.production_monitor_snapshot() from public,anon;
grant execute on function public.production_checkpoint(uuid,jsonb,timestamptz),public.production_monitor_snapshot() to authenticated;
commit;

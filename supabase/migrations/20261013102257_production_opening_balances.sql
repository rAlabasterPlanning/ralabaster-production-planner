begin;
create table public.production_opening_balances (
 workspace_id text not null default 'ralabaster' check(workspace_id='ralabaster'),task_id text not null,order_id text not null,workplace_name text not null,
 good_offset integer not null,scrap_offset integer not null,minutes_offset numeric not null,
 total_good integer not null check(total_good>=0),total_scrap integer not null check(total_scrap>=0),total_minutes numeric not null check(total_minutes>=0),
 cutoff timestamptz not null,revision integer not null default 1,actor uuid not null default auth.uid(),reason text not null,
 primary key(workspace_id,task_id,workplace_name)
);
alter table public.production_opening_balances enable row level security;
revoke all on public.production_opening_balances from public,anon,authenticated;
grant select,insert,update on public.production_opening_balances to authenticated;
create policy production_opening_admin on public.production_opening_balances for all to authenticated using(public.portal_is_admin() and workspace_id='ralabaster') with check(public.portal_is_admin() and workspace_id='ralabaster');
create function public.production_opening_save(p_request uuid,p_payload jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare t public.planner_tasks_v2%rowtype;old public.production_opening_balances%rowtype;wp jsonb;result jsonb;raw_good integer;raw_scrap integer;raw_minutes numeric;target_good integer;target_scrap integer;target_minutes numeric;cut timestamptz:=(p_payload->>'cutoff')::timestamptz;why text:=trim(coalesce(p_payload->>'reason',''));sess public.production_sessions%rowtype;
begin
 if not public.portal_is_admin() then raise exception 'Log in met het planneraccount' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtext('ralabaster-production-floor'));
 select e.result into result from public.production_events e where request_id=p_request;if found then return result;end if;
 select * into t from public.planner_tasks_v2 where workspace_id='ralabaster' and task_id=p_payload->>'task_id' and not deleted;
 if not found then raise exception 'Bewerking niet gevonden';end if;
 select value into wp from public.planner_shared_state,jsonb_array_elements(data->'workplaces') where workspace_id='ralabaster' and value->>'id'=p_payload->>'workplace_id' limit 1;
 if wp is null or not (lower(coalesce(nullif(t.data->>'assignedMachine',''),t.machine))=lower(wp->>'name') or(t.machine ~* '^Mori' and wp->>'name' ~* '^Mori') or (t.machine ~* '^Teach.?In' and wp->>'name' ~* '^Teach.?In') or (t.machine='Verlijmen' and wp->>'name'='Doppen lijmen')) then raise exception 'Bewerking past niet bij deze werkplek';end if;
 if cut is null or cut>clock_timestamp()+interval '1 minute' or cut<clock_timestamp()-interval '30 minutes' then raise exception 'Telling is verouderd; open opnieuw';end if;
 select * into old from public.production_opening_balances where workspace_id='ralabaster' and task_id=t.task_id and workplace_name=wp->>'name';
 if coalesce(old.revision,0)<>coalesce((p_payload->>'revision')::int,-1) then raise exception 'Startstand gewijzigd; open opnieuw';end if;
 select coalesce(sum(s.good),0),coalesce(sum(s.scrap),0),coalesce(sum((select coalesce(sum(case when wp->>'type'='machine' then public.production_minutes(p.started_at,least(coalesce(p.ended_at,cut),s.auto_end,cut),false) else (select coalesce(sum(public.production_minutes(greatest(p.started_at,l.started_at),least(coalesce(p.ended_at,cut),s.auto_end,coalesce(l.ended_at,cut),l.stop_at,cut),true)/cardinality(l.session_ids)),0) from public.production_labor l where s.id=any(l.session_ids) and l.superseded_at is null) end),0) from public.production_phases p where p.session_id=s.id and p.phase='production')),0)
 into raw_good,raw_scrap,raw_minutes from public.production_sessions s where s.order_id=t.order_id and lower(s.workplace_name)=lower(wp->>'name') and (s.task_id is null or s.task_id=t.task_id) and s.started_at<=cut;
 if raw_good<>coalesce((p_payload->>'expected_floor_good')::integer,-1) or raw_scrap<>coalesce((p_payload->>'expected_floor_scrap')::integer,-1) then raise exception 'Aantallen zijn intussen gewijzigd; open de telling opnieuw';end if;
 target_good:=(p_payload->>'good')::integer;target_scrap:=(p_payload->>'scrap')::integer;target_minutes:=(p_payload->>'minutes')::numeric;
 if target_good is null or target_scrap is null or target_minutes is null or least(target_good,target_scrap,target_minutes)<0 or target_minutes>1000000 or why='' then raise exception 'Vul uren, aantallen en toelichting in';end if;
 insert into public.production_opening_balances(task_id,order_id,workplace_name,good_offset,scrap_offset,minutes_offset,total_good,total_scrap,total_minutes,cutoff,reason)
 values(t.task_id,t.order_id,wp->>'name',target_good-raw_good,target_scrap-raw_scrap,target_minutes-raw_minutes,target_good,target_scrap,target_minutes,cut,why)
 on conflict(workspace_id,task_id,workplace_name) do update set good_offset=excluded.good_offset,scrap_offset=excluded.scrap_offset,minutes_offset=excluded.minutes_offset,total_good=excluded.total_good,total_scrap=excluded.total_scrap,total_minutes=excluded.total_minutes,cutoff=excluded.cutoff,reason=excluded.reason,revision=production_opening_balances.revision+1,actor=auth.uid();
 result:=jsonb_build_object('ok',true,'task_id',t.task_id);
 insert into public.production_events(request_id,employee,action,occurred_at,payload,result) values(p_request,coalesce(p_payload->>'employee','Ralph'),'opening_balance',cut,p_payload||jsonb_build_object('floor_good',raw_good,'floor_scrap',raw_scrap,'floor_minutes',raw_minutes,'previous',to_jsonb(old)),result);
 return result;
end$$;
create or replace function public.production_monitor_snapshot() returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare snap jsonb;ctx jsonb;
begin
 if not public.portal_is_admin() then raise exception 'Log in met het planneraccount' using errcode='42501';end if;
 snap:=public.production_cost_snapshot();
 select coalesce(jsonb_agg(x||jsonb_build_object('last_report_at',greatest((x->>'last_report_at')::timestamptz,(select max(b.cutoff) from public.production_opening_balances b join public.production_sessions s on s.order_id=b.order_id and lower(s.workplace_name)=lower(b.workplace_name) where s.id=(x->>'session_id')::uuid and s.started_at<=b.cutoff)))),'[]') into ctx from jsonb_array_elements(public.production_checkpoint_context())x;
 return snap||jsonb_build_object('checkpointContext',ctx,'openingBalances',coalesce((select jsonb_agg(to_jsonb(b)) from public.production_opening_balances b where workspace_id='ralabaster'),'[]'));
end$$;
revoke all on function public.production_opening_save(uuid,jsonb) from public,anon;
grant execute on function public.production_opening_save(uuid,jsonb) to authenticated;
commit;

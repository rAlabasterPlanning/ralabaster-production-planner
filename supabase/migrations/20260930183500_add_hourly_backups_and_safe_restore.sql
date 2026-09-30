create table planner_recovery.backup_admins (
 user_id uuid primary key references auth.users(id) on delete cascade,
 created_at timestamptz not null default now()
);
alter table planner_recovery.backup_admins enable row level security;
revoke all on planner_recovery.backup_admins from public, anon, authenticated;
insert into planner_recovery.backup_admins(user_id)
select id from auth.users where lower(email) in ('info@ralabaster.com','info@designlinck.com')
on conflict do nothing;

create or replace function planner_recovery.assert_backup_admin() returns void
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not exists(select 1 from planner_recovery.backup_admins a where a.user_id=auth.uid()) then
  raise exception 'Alleen een back-upbeheerder mag deze actie uitvoeren' using errcode='42501';
 end if;
end $$;
revoke all on function planner_recovery.assert_backup_admin() from public, anon, authenticated;

create or replace function planner_recovery.capture_daily_snapshot(p_reason text default 'daily') returns void
language plpgsql security invoker set search_path = '' as $$
begin
 insert into planner_recovery.daily_snapshots(workspace_id,reason,data)
 select s.workspace_id,p_reason,jsonb_build_object(
  'sharedState',to_jsonb(s),
  'orders',coalesce((select jsonb_agg(to_jsonb(o) order by o.order_id) from public.planner_orders_v2 o where o.workspace_id=s.workspace_id),'[]'::jsonb),
  'tasks',coalesce((select jsonb_agg(to_jsonb(t) order by t.task_id) from public.planner_tasks_v2 t where t.workspace_id=s.workspace_id),'[]'::jsonb),
  'workers',coalesce((select jsonb_agg(to_jsonb(w) order by w.employee) from public.planner_workers w where w.workspace_id=s.workspace_id),'[]'::jsonb),
  'legacyStates',coalesce((select jsonb_agg(to_jsonb(l)) from public.planner_state l),'[]'::jsonb)
 ) from public.planner_shared_state s;
 delete from planner_recovery.daily_snapshots where reason='hourly' and created_at < now()-interval '7 days';
 delete from planner_recovery.daily_snapshots where reason<>'hourly' and created_at < now()-interval '90 days';
end $$;
revoke all on function planner_recovery.capture_daily_snapshot(text) from public, anon, authenticated;

select cron.schedule('ralabaster_hourly_planner_backup','15 * * * *',$job$select planner_recovery.capture_daily_snapshot('hourly');$job$);

create function public.planner_backup_status() returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 perform planner_recovery.assert_backup_admin();
 select jsonb_build_object(
  'healthy',coalesce((select max(created_at)>now()-interval '26 hours' from planner_recovery.daily_snapshots where workspace_id='ralabaster'),false),
  'dailyActive',exists(select 1 from cron.job where jobname='ralabaster_daily_planner_backup' and active),
  'hourlyActive',exists(select 1 from cron.job where jobname='ralabaster_hourly_planner_backup' and active),
  'latest',(select jsonb_build_object('id',id,'createdAt',created_at,'reason',reason,'orders',jsonb_array_length(coalesce(data->'orders','[]'::jsonb)),'tasks',jsonb_array_length(coalesce(data->'tasks','[]'::jsonb))) from planner_recovery.daily_snapshots where workspace_id='ralabaster' order by created_at desc limit 1),
  'snapshots',coalesce((select jsonb_agg(jsonb_build_object('id',id,'createdAt',created_at,'reason',reason,'orders',jsonb_array_length(coalesce(data->'orders','[]'::jsonb)),'tasks',jsonb_array_length(coalesce(data->'tasks','[]'::jsonb))) order by created_at desc) from (select * from planner_recovery.daily_snapshots where workspace_id='ralabaster' order by created_at desc limit 30) s),'[]'::jsonb)
 ) into result;
 return result;
end $$;

create function public.planner_create_backup(p_reason text default 'manual') returns bigint
language plpgsql security definer set search_path='' as $$
declare snapshot_id bigint;
begin
 perform planner_recovery.assert_backup_admin();
 perform planner_recovery.capture_daily_snapshot(case when p_reason in ('manual','manual-export') then p_reason else 'manual' end);
 select id into snapshot_id from planner_recovery.daily_snapshots where workspace_id='ralabaster' order by created_at desc limit 1;
 return snapshot_id;
end $$;

create function public.planner_export_backup() returns jsonb
language plpgsql security definer set search_path='' as $$
declare snapshot_id bigint; snapshot_data jsonb; snapshot_time timestamptz;
begin
 perform planner_recovery.assert_backup_admin();
 perform planner_recovery.capture_daily_snapshot('manual-export');
 select id,created_at,data into snapshot_id,snapshot_time,snapshot_data from planner_recovery.daily_snapshots where workspace_id='ralabaster' order by created_at desc limit 1;
 return jsonb_build_object('format','ralabaster-full-backup-v1','snapshotId',snapshot_id,'exportedAt',snapshot_time,'workspace','ralabaster','data',snapshot_data);
end $$;

create function public.planner_restore_preview(p_snapshot_id bigint) returns jsonb
language plpgsql security definer set search_path='' as $$
declare s planner_recovery.daily_snapshots%rowtype;
begin
 perform planner_recovery.assert_backup_admin();
 select * into s from planner_recovery.daily_snapshots where id=p_snapshot_id and workspace_id='ralabaster';
 if not found then raise exception 'Herstelpunt niet gevonden'; end if;
 return jsonb_build_object('id',s.id,'createdAt',s.created_at,'reason',s.reason,'orders',jsonb_array_length(coalesce(s.data->'orders','[]'::jsonb)),'tasks',jsonb_array_length(coalesce(s.data->'tasks','[]'::jsonb)),'workers',jsonb_array_length(coalesce(s.data->'workers','[]'::jsonb)));
end $$;

do $$
declare f record; definition text; patched text;
begin
 for f in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where (n.nspname,p.proname) in (('public','planner_protect_records_v1'),('public','protect_planner_task_schedule_write'),('planner_recovery','guard_quotes'),('planner_recovery','guard_order_deadline_revision'),('planner_recovery','guard_completion_revisions'))
 loop
  definition:=pg_get_functiondef(f.oid);
  if position('ralabaster.restore_mode' in definition)=0 then
   patched:=replace(definition,E'\nbegin\n',E'\nbegin\n if current_user=''postgres'' and current_setting(''ralabaster.restore_mode'',true)=''on'' then\n  if tg_op=''DELETE'' then return old; end if;\n  return new;\n end if;\n');
   if patched=definition then raise exception 'Kon hersteluitzondering niet toevoegen aan functie %',f.oid; end if;
   execute patched;
  end if;
 end loop;
end $$;

create function public.planner_restore_backup(p_snapshot_id bigint,p_confirmation text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare snapshot_data jsonb; before_id bigint; restored_orders int; restored_tasks int;
begin
 perform planner_recovery.assert_backup_admin();
 if p_confirmation is distinct from ('HERSTEL '||p_snapshot_id::text) then raise exception 'Bevestiging komt niet overeen'; end if;
 select data into snapshot_data from planner_recovery.daily_snapshots where id=p_snapshot_id and workspace_id='ralabaster';
 if snapshot_data is null then raise exception 'Herstelpunt niet gevonden'; end if;
 perform planner_recovery.capture_daily_snapshot('pre-restore');
 select id into before_id from planner_recovery.daily_snapshots where workspace_id='ralabaster' order by created_at desc limit 1;
 perform set_config('ralabaster.restore_mode','on',true);

 update public.planner_orders_v2 set deleted=true,active=false,status='deleted',updated_at=now(),data=data||jsonb_build_object('deleted',true,'deletedAt',now(),'restoreRemovedAt',now())
  where workspace_id='ralabaster' and not exists(select 1 from jsonb_array_elements(coalesce(snapshot_data->'orders','[]'::jsonb)) x where x->>'order_id'=planner_orders_v2.order_id);
 update public.planner_tasks_v2 set deleted=true,order_active=false,status='deleted',updated_at=now(),data=data||jsonb_build_object('deleted',true,'deletedAt',now(),'restoreRemovedAt',now())
  where workspace_id='ralabaster' and not exists(select 1 from jsonb_array_elements(coalesce(snapshot_data->'tasks','[]'::jsonb)) x where x->>'task_id'=planner_tasks_v2.task_id);

 insert into public.planner_orders_v2(workspace_id,order_id,order_no,active,status,deadline,completed_at,data,deleted,updated_at)
 select workspace_id,order_id,order_no,active,status,deadline,completed_at,data,deleted,updated_at from jsonb_populate_recordset(null::public.planner_orders_v2,coalesce(snapshot_data->'orders','[]'::jsonb))
 on conflict(workspace_id,order_id) do update set order_no=excluded.order_no,active=excluded.active,status=excluded.status,deadline=excluded.deadline,completed_at=excluded.completed_at,data=excluded.data,deleted=excluded.deleted,updated_at=excluded.updated_at;
 get diagnostics restored_orders=row_count;
 insert into public.planner_tasks_v2(workspace_id,task_id,order_id,seq,status,task_date,employee,machine,task_type,order_active,data,deleted,updated_at)
 select workspace_id,task_id,order_id,seq,status,task_date,employee,machine,task_type,order_active,data,deleted,updated_at from jsonb_populate_recordset(null::public.planner_tasks_v2,coalesce(snapshot_data->'tasks','[]'::jsonb))
 on conflict(workspace_id,task_id) do update set order_id=excluded.order_id,seq=excluded.seq,status=excluded.status,task_date=excluded.task_date,employee=excluded.employee,machine=excluded.machine,task_type=excluded.task_type,order_active=excluded.order_active,data=excluded.data,deleted=excluded.deleted,updated_at=excluded.updated_at;
 get diagnostics restored_tasks=row_count;
 insert into public.planner_shared_state(workspace_id,data,updated_at)
 values('ralabaster',snapshot_data->'sharedState'->'data',coalesce((snapshot_data->'sharedState'->>'updated_at')::timestamptz,now()))
 on conflict(workspace_id) do update set data=excluded.data,updated_at=excluded.updated_at;
 delete from public.planner_workers where workspace_id='ralabaster';
 insert into public.planner_workers(workspace_id,employee,pin_hash,active,updated_at)
 select workspace_id,employee,pin_hash,active,updated_at from jsonb_populate_recordset(null::public.planner_workers,coalesce(snapshot_data->'workers','[]'::jsonb));
 insert into public.planner_state(user_id,data,updated_at)
 select user_id,data,updated_at from jsonb_populate_recordset(null::public.planner_state,coalesce(snapshot_data->'legacyStates','[]'::jsonb))
 on conflict(user_id) do update set data=excluded.data,updated_at=excluded.updated_at;
 perform set_config('ralabaster.restore_mode','off',true);
 perform planner_recovery.capture_daily_snapshot('post-restore');
 return jsonb_build_object('restored',true,'snapshotId',p_snapshot_id,'safetySnapshotId',before_id,'orders',restored_orders,'tasks',restored_tasks);
end $$;

revoke all on function public.planner_backup_status() from public,anon;
revoke all on function public.planner_create_backup(text) from public,anon;
revoke all on function public.planner_export_backup() from public,anon;
revoke all on function public.planner_restore_preview(bigint) from public,anon;
revoke all on function public.planner_restore_backup(bigint,text) from public,anon;
grant execute on function public.planner_backup_status() to authenticated;
grant execute on function public.planner_create_backup(text) to authenticated;
grant execute on function public.planner_export_backup() to authenticated;
grant execute on function public.planner_restore_preview(bigint) to authenticated;
grant execute on function public.planner_restore_backup(bigint,text) to authenticated;

select planner_recovery.capture_daily_snapshot('safety-upgrade');

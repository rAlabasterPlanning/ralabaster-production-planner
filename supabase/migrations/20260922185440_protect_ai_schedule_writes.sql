create or replace function public.protect_planner_task_schedule_write()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_old_version text := nullif(old.data->>'planningWriteId','');
  v_new_version text := nullif(new.data->>'planningWriteId','');
  v_planning_changed boolean;
  v_new_write_id text;
begin
  v_planning_changed :=
    coalesce(old.data->'planSegments','[]'::jsonb) is distinct from coalesce(new.data->'planSegments','[]'::jsonb)
    or old.data->'date' is distinct from new.data->'date'
    or old.data->'start' is distinct from new.data->'start'
    or old.data->'employee' is distinct from new.data->'employee'
    or old.data->'machine' is distinct from new.data->'machine'
    or old.data->'assignedMachine' is distinct from new.data->'assignedMachine'
    or old.data->'lockedPlanning' is distinct from new.data->'lockedPlanning';

  -- A client that loaded the task before the latest planning write does not
  -- know its write ID. It may still save unrelated local changes, but it may
  -- never erase or replace the newer persisted planning fields.
  if v_old_version is not null and v_new_version is distinct from v_old_version then
    new.task_date := old.task_date;
    new.employee := old.employee;
    new.machine := old.machine;
    new.data := new.data
      || jsonb_build_object(
        'planSegments',coalesce(old.data->'planSegments','[]'::jsonb),
        'date',coalesce(old.data->'date','null'::jsonb),
        'start',coalesce(old.data->'start','""'::jsonb),
        'employee',coalesce(old.data->'employee','null'::jsonb),
        'machine',coalesce(old.data->'machine','""'::jsonb),
        'assignedMachine',coalesce(old.data->'assignedMachine','""'::jsonb),
        'lockedPlanning',coalesce(old.data->'lockedPlanning','false'::jsonb),
        'planningOrigin',coalesce(old.data->'planningOrigin','null'::jsonb),
        'planningWriteId',old.data->'planningWriteId'
      );
    return new;
  end if;

  -- Every accepted planning mutation receives a new version. A second stale
  -- browser tab carrying the previous version is then protected as well.
  if v_planning_changed then
    v_new_write_id := 'pw_' || txid_current()::text || '_' || floor(extract(epoch from clock_timestamp()) * 1000000)::bigint::text;
    new.data := jsonb_set(new.data,'{planningWriteId}',to_jsonb(v_new_write_id),true);
  end if;
  return new;
end;
$$;

revoke all on function public.protect_planner_task_schedule_write() from public;
revoke all on function public.protect_planner_task_schedule_write() from anon;
revoke all on function public.protect_planner_task_schedule_write() from authenticated;

drop trigger if exists protect_planner_task_schedule_write on public.planner_tasks_v2;
create trigger protect_planner_task_schedule_write
before update on public.planner_tasks_v2
for each row execute function public.protect_planner_task_schedule_write();

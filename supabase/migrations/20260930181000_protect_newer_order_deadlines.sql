create function planner_recovery.guard_order_deadline_revision() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare
 old_revision text := coalesce(old.data->>'deadlineUpdatedAt','');
 new_revision text := coalesce(new.data->>'deadlineUpdatedAt','');
 deadline_changed boolean := false;
begin
 deadline_changed := (new.data->'communicatedDeadline') is distinct from (old.data->'communicatedDeadline')
  or (new.data->'deadline') is distinct from (old.data->'deadline')
  or (new.data->'maximumReadyDate') is distinct from (old.data->'maximumReadyDate')
  or (new.data->'internalTargetDate') is distinct from (old.data->'internalTargetDate');

 if deadline_changed and old_revision <> '' and (new_revision = '' or new_revision <= old_revision) then
  new.data := new.data || jsonb_build_object(
   'communicatedDeadline', old.data->'communicatedDeadline',
   'deadline', old.data->'deadline',
   'maximumReadyDate', old.data->'maximumReadyDate',
   'internalTargetDate', old.data->'internalTargetDate',
   'planningCheckedAt', old.data->'planningCheckedAt',
   'weekPlanningUpdatedAt', old.data->'weekPlanningUpdatedAt',
   'deadlineUpdatedAt', old.data->'deadlineUpdatedAt'
  );
  new.deadline := old.deadline;
 end if;
 return new;
end $$;

revoke all on function planner_recovery.guard_order_deadline_revision() from public, anon, authenticated;
create trigger planner_orders_preserve_newer_deadline
before update on public.planner_orders_v2
for each row execute function planner_recovery.guard_order_deadline_revision();

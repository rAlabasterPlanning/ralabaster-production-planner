update public.planner_orders_v2
set data=jsonb_set(data,'{orderCompletionUpdatedAt}',to_jsonb(to_char(updated_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),true)
where nullif(data->>'orderCompletionUpdatedAt','') is null
 and (status='completed' or not active or data->>'closed'='true');

update public.planner_tasks_v2
set data=jsonb_set(data,'{taskProgressUpdatedAt}',to_jsonb(to_char(updated_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),true)
where nullif(data->>'taskProgressUpdatedAt','') is null
 and (status in ('done','completed','partial','partly','in_progress','started')
      or nullif(data->>'completedAt','') is not null
      or coalesce(data->>'actual','0') not in ('','0')
      or coalesce(data->>'doneQty','0') not in ('','0'));

create function planner_recovery.guard_completion_revisions() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare
 old_revision text;
 new_revision text;
 field_name text;
 changed boolean;
 fields text[];
begin
 if tg_table_name='planner_orders_v2' then
  fields:=array['status','active','closed','completedAt','completedQty','postCalculationCheckedAt','startWeightKg','endUnitWeightKg','endTotalWeightKg','yieldPct','deliveryNote'];
  old_revision:=coalesce(old.data->>'orderCompletionUpdatedAt','');
  new_revision:=coalesce(new.data->>'orderCompletionUpdatedAt','');
 else
  fields:=array['status','actual','doneQty','consumption','note','completedAt','completedAtDT','date','start','employee','planSegments','planningWeek','planningWeekEarly','lockedPlanning','planningOrigin'];
  old_revision:=coalesce(old.data->>'taskProgressUpdatedAt','');
  new_revision:=coalesce(new.data->>'taskProgressUpdatedAt','');
 end if;

 select exists(select 1 from unnest(fields) as u(k) where new.data->u.k is distinct from old.data->u.k) into changed;
 if changed and old_revision<>'' and (new_revision='' or new_revision<=old_revision) then
  foreach field_name in array fields loop
   new.data:=jsonb_set(new.data,array[field_name],coalesce(old.data->field_name,'null'::jsonb),true);
  end loop;
  if tg_table_name='planner_orders_v2' then
   new.data:=jsonb_set(new.data,'{orderCompletionUpdatedAt}',to_jsonb(old_revision),true);
   new.status:=old.status; new.active:=old.active; new.completed_at:=old.completed_at;
  else
   new.data:=jsonb_set(new.data,'{taskProgressUpdatedAt}',to_jsonb(old_revision),true);
   new.status:=old.status; new.task_date:=old.task_date; new.employee:=old.employee; new.order_active:=old.order_active;
  end if;
 end if;
 return new;
end $$;

revoke all on function planner_recovery.guard_completion_revisions() from public, anon, authenticated;
create trigger planner_orders_preserve_completion
before update on public.planner_orders_v2
for each row execute function planner_recovery.guard_completion_revisions();
create trigger planner_tasks_preserve_progress
before update on public.planner_tasks_v2
for each row execute function planner_recovery.guard_completion_revisions();

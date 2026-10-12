-- Task writes from obsolete tabs cannot make archived work schedulable again.
create function planner_recovery.guard_archived_task() returns trigger
language plpgsql security invoker set search_path='' as $$
declare k text;
begin
 if exists(select 1 from public.planner_orders_v2 o where o.workspace_id=new.workspace_id and o.order_id=new.order_id and not o.deleted and (not o.active or o.status='completed')) then
  new.order_active:=false;
  if old.status in ('done','completed') and coalesce(current_setting('request.path',true),'') not like '%/rpc/production_command' then
   foreach k in array array['status','actual','doneQty','completedAt','completedAtDT','date','start','employee','planSegments','planningWeek','planningWeekEarly','lockedPlanning','planningOrigin','taskProgressUpdatedAt'] loop
    if old.data ? k then new.data:=jsonb_set(new.data,array[k],old.data->k,true);else new.data:=new.data-k;end if;
   end loop;
   new.status:=old.status;new.task_date:=old.task_date;new.employee:=old.employee;
  end if;
 end if;return new;
end$$;
revoke all on function planner_recovery.guard_archived_task() from public,anon,authenticated;
create trigger planner_tasks_00_preserve_archive before update on public.planner_tasks_v2 for each row execute function planner_recovery.guard_archived_task();

-- Completed orders can only reopen with an explicit new reopening marker and reason.
create function planner_recovery.guard_archived_order() returns trigger
language plpgsql security invoker set search_path='' as $$
declare k text;
begin
 if (old.active=false or old.status='completed' or old.data->>'closed'='true') and not old.deleted then
  if new.active and new.status<>'completed' and nullif(new.data->>'reopenedAt','') is not null and new.data->>'reopenedAt' is distinct from old.data->>'reopenedAt' and nullif(btrim(new.data->>'reopenReason'),'') is not null then
   return new;
  end if;
  foreach k in array array['status','active','closed','completedAt','completedQty','postCalculationCheckedAt','startWeightKg','endUnitWeightKg','endTotalWeightKg','yieldPct','deliveryNote','orderCompletionUpdatedAt'] loop
   if old.data ? k then new.data:=jsonb_set(new.data,array[k],old.data->k,true);else new.data:=new.data-k;end if;
  end loop;
  new.active:=old.active;new.status:=old.status;new.completed_at:=old.completed_at;
 end if;return new;
end$$;
revoke all on function planner_recovery.guard_archived_order() from public,anon,authenticated;
create trigger planner_orders_00_preserve_archive before update on public.planner_orders_v2 for each row execute function planner_recovery.guard_archived_order();

-- A fresh timestamp alone is insufficient: deadline edits compare against the
-- exact revision originally read. Stale browser restamps must not pass.
create or replace function planner_recovery.guard_order_deadline_revision() returns trigger
language plpgsql security invoker set search_path='' as $$
declare old_revision text:=coalesce(old.data->>'deadlineUpdatedAt','');new_revision text:=coalesce(new.data->>'deadlineUpdatedAt','');k text;
begin
 if (new.data->'communicatedDeadline' is distinct from old.data->'communicatedDeadline' or new.data->'deadline' is distinct from old.data->'deadline' or new.data->'maximumReadyDate' is distinct from old.data->'maximumReadyDate' or new.data->'internalTargetDate' is distinct from old.data->'internalTargetDate')
 and old_revision<>'' and (new_revision<=old_revision or coalesce(new.data->>'deadlineWriteBase','')<>old_revision) then
  foreach k in array array['communicatedDeadline','deadline','maximumReadyDate','internalTargetDate','planningCheckedAt','weekPlanningUpdatedAt','deadlineUpdatedAt'] loop
   if old.data ? k then new.data:=jsonb_set(new.data,array[k],old.data->k,true);else new.data:=new.data-k;end if;
  end loop;new.deadline:=old.deadline;
 end if;return new;
end$$;
revoke all on function planner_recovery.guard_order_deadline_revision() from public,anon,authenticated;


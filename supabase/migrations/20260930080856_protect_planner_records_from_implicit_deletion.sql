create or replace function public.planner_protect_records_v1()
returns trigger language plpgsql security invoker set search_path = public, pg_temp as $$
begin
  if TG_OP = 'DELETE' then
    raise exception 'Planner records cannot be permanently deleted; use confirmed soft deletion.' using errcode = '23514';
  end if;
  if NEW.deleted and (TG_OP = 'INSERT' or not OLD.deleted) then
    if nullif(NEW.data->>'deletedAt','') is null or
       (TG_OP = 'UPDATE' and NEW.data->>'deletedAt' is not distinct from OLD.data->>'deletedAt') then
      raise exception 'Deletion blocked: an explicit new deletion timestamp is required.' using errcode = '23514';
    end if;
    if TG_OP = 'UPDATE' then
      NEW.data := jsonb_set(NEW.data, '{deletionBackup}', OLD.data - 'deletionBackup', true);
    end if;
  end if;
  if TG_OP = 'UPDATE' and OLD.data ? 'deletionBackup' and not NEW.data ? 'deletionBackup' then
    NEW.data := jsonb_set(NEW.data, '{deletionBackup}', OLD.data->'deletionBackup', true);
  end if;
  if TG_TABLE_NAME = 'planner_orders_v2' then
    if not NEW.deleted and not NEW.active and coalesce(NEW.status,'') <> 'completed' then
      raise exception 'Hiding an order requires completed status or explicit deletion.' using errcode = '23514';
    end if;
  else
    if not NEW.deleted and not NEW.order_active and exists (
      select 1 from public.planner_orders_v2 o
      where o.workspace_id = NEW.workspace_id and o.order_id = NEW.order_id and o.active and not o.deleted
    ) then
      raise exception 'Active order tasks cannot be hidden by a partial local snapshot.' using errcode = '23514';
    end if;
  end if;
  return NEW;
end $$;
revoke all on function public.planner_protect_records_v1() from public, anon, authenticated;
create trigger planner_orders_protect_v1 before insert or update or delete on public.planner_orders_v2 for each row execute function public.planner_protect_records_v1();
create trigger planner_tasks_protect_v1 before insert or update or delete on public.planner_tasks_v2 for each row execute function public.planner_protect_records_v1();

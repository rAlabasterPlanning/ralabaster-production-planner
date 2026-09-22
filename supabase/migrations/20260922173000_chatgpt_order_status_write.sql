create or replace function public.apply_ai_order_status_change(
  p_workspace_id text,
  p_order_id text,
  p_status text,
  p_confirmation_text text
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_order public.planner_orders_v2%rowtype;
  v_now timestamptz := clock_timestamp();
  v_meta jsonb;
  v_event jsonb;
  v_completed boolean;
  v_event_id text := 'aio_' || floor(extract(epoch from clock_timestamp()) * 1000)::bigint::text;
begin
  if auth.uid() is null then raise exception 'Aanmelding vereist.' using errcode='42501'; end if;
  if p_workspace_id <> 'ralabaster' then raise exception 'Onbekende werkruimte.' using errcode='22023'; end if;
  if length(trim(coalesce(p_confirmation_text,''))) < 2 then raise exception 'Expliciete bevestiging ontbreekt.' using errcode='22023'; end if;
  if trim(coalesce(p_status,'')) = '' then raise exception 'Orderstatus ontbreekt.' using errcode='22023'; end if;

  select * into v_order
  from public.planner_orders_v2
  where workspace_id=p_workspace_id and order_id=p_order_id and deleted=false
  for update;

  if not found then raise exception 'Order % bestaat niet meer.',coalesce(p_order_id,'(leeg)') using errcode='P0002'; end if;

  v_completed := lower(trim(p_status)) in ('completed','done','afgerond','complete');

  update public.planner_orders_v2
  set
    status = p_status,
    active = case when v_completed then false else true end,
    completed_at = case when v_completed then current_date else null end,
    data = data || jsonb_build_object(
      'status',p_status,
      'active',case when v_completed then false else true end,
      'closed',v_completed,
      'completedAt',case when v_completed then to_char(current_date,'YYYY-MM-DD') else null end,
      'updatedBy','chatgpt-agent'
    ),
    updated_at = v_now
  where workspace_id=p_workspace_id and order_id=p_order_id;

  update public.planner_tasks_v2
  set order_active = case when v_completed then false else true end,
      updated_at = v_now
  where workspace_id=p_workspace_id and order_id=p_order_id and deleted=false;

  select data into v_meta from public.planner_shared_state where workspace_id=p_workspace_id for update;
  v_meta := coalesce(v_meta,'{}'::jsonb);
  v_event := jsonb_build_object(
    'id',v_event_id,'at',v_now,'source','chatgpt_plugin','type','ai_order_status_change','status','applied',
    'orderId',p_order_id,'fromStatus',coalesce(v_order.status,''),'toStatus',p_status,
    'reason',left(trim(p_confirmation_text),500),'userId',auth.uid()
  );
  v_meta:=jsonb_set(v_meta,'{aiDecisionLog}',coalesce(v_meta->'aiDecisionLog','[]'::jsonb)||jsonb_build_array(v_event),true);
  v_meta:=jsonb_set(v_meta,'{history}',coalesce(v_meta->'history','[]'::jsonb)||jsonb_build_array(v_event),true);
  insert into public.planner_shared_state(workspace_id,data,updated_at) values(p_workspace_id,v_meta,v_now)
    on conflict(workspace_id) do update set data=excluded.data,updated_at=excluded.updated_at;

  return jsonb_build_object(
    'eventId',v_event_id,'orderId',p_order_id,'status',p_status,
    'active',case when v_completed then false else true end,
    'completedAt',case when v_completed then current_date else null end,
    'updatedAt',v_now
  );
end;
$$;

revoke all on function public.apply_ai_order_status_change(text,text,text,text) from public;
revoke all on function public.apply_ai_order_status_change(text,text,text,text) from anon;
grant execute on function public.apply_ai_order_status_change(text,text,text,text) to authenticated;

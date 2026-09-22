create or replace function public.apply_ai_record_changes(
  p_workspace_id text,
  p_actions jsonb,
  p_confirmation_text text,
  p_allow_destructive boolean default false
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_action jsonb;
  v_entity text;
  v_operation text;
  v_collection text;
  v_id text;
  v_order_id text;
  v_fields jsonb;
  v_existing jsonb;
  v_items jsonb;
  v_meta jsonb;
  v_result jsonb := '[]'::jsonb;
  v_now timestamptz := clock_timestamp();
  v_event_id text := 'aig_' || floor(extract(epoch from clock_timestamp()) * 1000)::bigint::text;
begin
  if auth.uid() is null then raise exception 'Aanmelding vereist.' using errcode='42501'; end if;
  if p_workspace_id <> 'ralabaster' then raise exception 'Onbekende werkruimte.' using errcode='22023'; end if;
  if length(trim(coalesce(p_confirmation_text,''))) < 2 then raise exception 'Expliciete bevestiging ontbreekt.' using errcode='22023'; end if;
  if jsonb_typeof(p_actions) <> 'array' or jsonb_array_length(p_actions)<1 or jsonb_array_length(p_actions)>30 then
    raise exception 'Geef 1 tot en met 30 gegevenswijzigingen op.' using errcode='22023';
  end if;

  select data into v_meta from public.planner_shared_state
  where workspace_id=p_workspace_id for update;
  v_meta := coalesce(v_meta,'{}'::jsonb);

  for v_action in select value from jsonb_array_elements(p_actions)
  loop
    v_entity := v_action->>'entity';
    v_operation := v_action->>'operation';
    v_id := nullif(trim(coalesce(v_action->>'id','')),'');
    v_fields := coalesce(v_action->'fields','{}'::jsonb);
    if jsonb_typeof(v_fields)<>'object' then raise exception 'Wijzigingsvelden moeten een object zijn.' using errcode='22023'; end if;
    if v_operation not in ('create','update','delete') then raise exception 'Bewerking % is niet toegestaan.',coalesce(v_operation,'(leeg)') using errcode='22023'; end if;
    if v_operation='delete' and not p_allow_destructive then raise exception 'Verwijderen vereist een aparte extra bevestiging.' using errcode='P0001'; end if;
    if exists(select 1 from jsonb_object_keys(v_fields) k where k ~* '(password|secret|token|api.?key)') then
      raise exception 'Beveiligde velden mogen niet via ChatGPT worden gewijzigd.' using errcode='22023';
    end if;

    if v_entity='order' then
      if v_operation='create' then
        v_id := coalesce(v_id,nullif(v_fields->>'id',''),'o_ai_'||floor(extract(epoch from clock_timestamp())*1000000)::bigint::text);
        if exists(select 1 from public.planner_orders_v2 where workspace_id=p_workspace_id and order_id=v_id) then raise exception 'Order % bestaat al.',v_id using errcode='23505'; end if;
        v_fields := v_fields || jsonb_build_object('id',v_id,'updatedBy','chatgpt-agent');
        insert into public.planner_orders_v2(workspace_id,order_id,order_no,status,active,data,deleted,updated_at)
        values(p_workspace_id,v_id,coalesce(v_fields->>'orderNo',''),coalesce(v_fields->>'status','concept'),coalesce((v_fields->>'active')::boolean,true),v_fields,false,v_now);
      else
        select data into v_existing from public.planner_orders_v2 where workspace_id=p_workspace_id and order_id=v_id and deleted=false for update;
        if not found then raise exception 'Order % bestaat niet meer.',coalesce(v_id,'(leeg)') using errcode='P0002'; end if;
        if v_operation='delete' then
          update public.planner_orders_v2 set deleted=true,active=false,data=data||jsonb_build_object('deleted',true,'updatedBy','chatgpt-agent'),updated_at=v_now where workspace_id=p_workspace_id and order_id=v_id;
          update public.planner_tasks_v2 set deleted=true,order_active=false,data=data||jsonb_build_object('deleted',true,'updatedBy','chatgpt-agent'),updated_at=v_now where workspace_id=p_workspace_id and order_id=v_id and deleted=false;
        else
          v_fields := v_fields-'id'-'orderId';
          update public.planner_orders_v2 set
            data=data||v_fields||jsonb_build_object('updatedBy','chatgpt-agent'),
            order_no=case when v_fields?'orderNo' then coalesce(v_fields->>'orderNo','') else order_no end,
            status=case when v_fields?'status' then coalesce(v_fields->>'status','') else status end,
            active=case when v_fields?'active' then coalesce((v_fields->>'active')::boolean,active) else active end,
            updated_at=v_now where workspace_id=p_workspace_id and order_id=v_id;
        end if;
      end if;
      select data into v_existing from public.planner_orders_v2 where workspace_id=p_workspace_id and order_id=v_id;

    elsif v_entity='task' then
      if v_operation='create' then
        v_order_id := nullif(v_fields->>'orderId','');
        if not exists(select 1 from public.planner_orders_v2 where workspace_id=p_workspace_id and order_id=v_order_id and deleted=false) then raise exception 'Order % bestaat niet.',coalesce(v_order_id,'(leeg)') using errcode='P0002'; end if;
        v_id := coalesce(v_id,nullif(v_fields->>'id',''),'t_ai_'||floor(extract(epoch from clock_timestamp())*1000000)::bigint::text);
        if exists(select 1 from public.planner_tasks_v2 where workspace_id=p_workspace_id and task_id=v_id) then raise exception 'Taak % bestaat al.',v_id using errcode='23505'; end if;
        v_fields := v_fields || jsonb_build_object('id',v_id,'updatedBy','chatgpt-agent');
        insert into public.planner_tasks_v2(workspace_id,task_id,order_id,seq,status,task_date,employee,machine,task_type,order_active,data,deleted,updated_at)
        values(p_workspace_id,v_id,v_order_id,coalesce((v_fields->>'seq')::integer,1),coalesce(v_fields->>'status','open'),
          case when coalesce(v_fields->>'date','') ~ '^\d{4}-\d{2}-\d{2}$' then (v_fields->>'date')::date else null end,
          nullif(v_fields->>'employee',''),nullif(v_fields->>'machine',''),coalesce(nullif(v_fields->>'type',''),'internal'),true,v_fields,false,v_now);
      else
        select data into v_existing from public.planner_tasks_v2 where workspace_id=p_workspace_id and task_id=v_id and deleted=false for update;
        if not found then raise exception 'Taak % bestaat niet meer.',coalesce(v_id,'(leeg)') using errcode='P0002'; end if;
        if (coalesce((v_existing->>'lockedPlanning')::boolean,false) or coalesce(v_existing->>'status','') in ('started','in_progress','done','completed')) and not p_allow_destructive then
          raise exception 'Gestart, gereed of vastgezet werk vereist een aparte extra bevestiging.' using errcode='P0001';
        end if;
        if v_operation='delete' then
          update public.planner_tasks_v2 set deleted=true,order_active=false,data=data||jsonb_build_object('deleted',true,'updatedBy','chatgpt-agent'),updated_at=v_now where workspace_id=p_workspace_id and task_id=v_id;
        else
          v_fields := v_fields-'id'-'taskId'-'orderId';
          update public.planner_tasks_v2 set
            data=data||v_fields||jsonb_build_object('updatedBy','chatgpt-agent'),
            seq=case when v_fields?'seq' then (v_fields->>'seq')::integer else seq end,
            status=case when v_fields?'status' then coalesce(v_fields->>'status','') else status end,
            task_date=case when v_fields?'date' then case when coalesce(v_fields->>'date','') ~ '^\d{4}-\d{2}-\d{2}$' then (v_fields->>'date')::date else null end else task_date end,
            employee=case when v_fields?'employee' then nullif(v_fields->>'employee','') else employee end,
            machine=case when v_fields?'machine' then nullif(v_fields->>'machine','') else machine end,
            task_type=case when v_fields?'type' then coalesce(v_fields->>'type',task_type) else task_type end,
            updated_at=v_now where workspace_id=p_workspace_id and task_id=v_id;
        end if;
      end if;
      select data into v_existing from public.planner_tasks_v2 where workspace_id=p_workspace_id and task_id=v_id;

    else
      v_collection := case v_entity
        when 'customer' then 'customers' when 'quote' then 'quotes' when 'calculation' then 'calculations'
        when 'product' then 'productTemplates' when 'workplace' then 'workplaces' when 'maintenance' then 'maintenanceRecords'
        when 'tool' then 'toolItems' when 'cost' then 'toolCostEntries' when 'staff_absence' then 'staffAbsences'
        when 'planner_rule' then 'aiPlannerRules' when 'order_confirmation' then 'orderConfirmations' else null end;
      if v_collection is null then raise exception 'Gegevenstype % is niet toegestaan.',coalesce(v_entity,'(leeg)') using errcode='22023'; end if;
      v_items := coalesce(v_meta->v_collection,'[]'::jsonb);
      if jsonb_typeof(v_items)<>'array' then v_items:='[]'::jsonb; end if;
      if v_operation='create' then
        v_id := coalesce(v_id,nullif(v_fields->>'id',''),left(v_entity,3)||'_ai_'||floor(extract(epoch from clock_timestamp())*1000000)::bigint::text);
        if exists(select 1 from jsonb_array_elements(v_items) item where coalesce(item->>'id',item->>'orderId',item->>'taskId')=v_id) then raise exception '% % bestaat al.',v_entity,v_id using errcode='23505'; end if;
        v_existing := v_fields||jsonb_build_object('id',v_id,'updated',v_now,'updatedBy','chatgpt-agent');
        v_items := v_items||jsonb_build_array(v_existing);
      else
        select item into v_existing from jsonb_array_elements(v_items) item where coalesce(item->>'id',item->>'orderId',item->>'taskId')=v_id limit 1;
        if v_existing is null then raise exception '% % bestaat niet meer.',v_entity,coalesce(v_id,'(leeg)') using errcode='P0002'; end if;
        if v_operation='delete' then
          select coalesce(jsonb_agg(item),'[]'::jsonb) into v_items from jsonb_array_elements(v_items) item where coalesce(item->>'id',item->>'orderId',item->>'taskId')<>v_id;
          v_existing := jsonb_build_object('id',v_id,'deleted',true);
        else
          v_fields := v_fields-'id'-'orderId'-'taskId';
          v_existing := v_existing||v_fields||jsonb_build_object('updated',v_now,'updatedBy','chatgpt-agent');
          select coalesce(jsonb_agg(case when coalesce(item->>'id',item->>'orderId',item->>'taskId')=v_id then v_existing else item end),'[]'::jsonb)
          into v_items from jsonb_array_elements(v_items) item;
        end if;
      end if;
      v_meta := jsonb_set(v_meta,array[v_collection],v_items,true);
    end if;
    v_result := v_result||jsonb_build_array(jsonb_build_object('entity',v_entity,'operation',v_operation,'id',v_id,'saved',v_existing));
  end loop;

  v_meta:=jsonb_set(v_meta,'{aiDecisionLog}',coalesce(v_meta->'aiDecisionLog','[]'::jsonb)||jsonb_build_array(jsonb_build_object(
    'id',v_event_id,'at',v_now,'source','chatgpt_plugin','type','ai_general_change','status','applied','choice',p_actions,
    'reason',left(trim(p_confirmation_text),500),'userId',auth.uid())),true);
  insert into public.planner_shared_state(workspace_id,data,updated_at) values(p_workspace_id,v_meta,v_now)
  on conflict(workspace_id) do update set data=excluded.data,updated_at=excluded.updated_at;

  return jsonb_build_object('eventId',v_event_id,'applied',jsonb_array_length(p_actions),'updatedAt',v_now,'records',v_result);
end;
$$;

revoke all on function public.apply_ai_record_changes(text,jsonb,text,boolean) from public;
revoke all on function public.apply_ai_record_changes(text,jsonb,text,boolean) from anon;
grant execute on function public.apply_ai_record_changes(text,jsonb,text,boolean) to authenticated;

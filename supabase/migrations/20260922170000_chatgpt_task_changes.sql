create or replace function public.apply_ai_task_changes(
  p_workspace_id text,
  p_actions jsonb,
  p_confirmation_text text,
  p_allow_protected boolean default false
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_action jsonb;
  v_type text;
  v_order_id text;
  v_task_id text;
  v_first_id text;
  v_next_id text;
  v_after_id text;
  v_insert_seq integer;
  v_first_seq integer;
  v_count integer := 0;
  v_task public.planner_tasks_v2%rowtype;
  v_first public.planner_tasks_v2%rowtype;
  v_next public.planner_tasks_v2%rowtype;
  v_order public.planner_orders_v2%rowtype;
  v_data jsonb;
  v_fields jsonb;
  v_key text;
  v_value jsonb;
  v_protected boolean;
  v_meta jsonb;
  v_event jsonb;
  v_deleted_tasks jsonb := '[]'::jsonb;
  v_now timestamptz := clock_timestamp();
  v_event_id text := 'aid_' || floor(extract(epoch from clock_timestamp()) * 1000)::bigint::text;
begin
  if auth.uid() is null then
    raise exception 'Aanmelding vereist.' using errcode = '42501';
  end if;
  if p_workspace_id <> 'ralabaster' then
    raise exception 'Onbekende werkruimte.' using errcode = '22023';
  end if;
  if jsonb_typeof(p_actions) <> 'array' or jsonb_array_length(p_actions) < 1 or jsonb_array_length(p_actions) > 20 then
    raise exception 'Geef 1 tot en met 20 taakwijzigingen op.' using errcode = '22023';
  end if;
  if length(trim(coalesce(p_confirmation_text,''))) < 2 then
    raise exception 'Expliciete bevestiging ontbreekt.' using errcode = '22023';
  end if;

  for v_action in select value from jsonb_array_elements(p_actions)
  loop
    v_count := v_count + 1;
    v_type := v_action->>'type';
    v_order_id := v_action->>'orderId';
    select * into v_order from public.planner_orders_v2
      where workspace_id=p_workspace_id and order_id=v_order_id and deleted=false
      for update;
    if not found then raise exception 'Order % bestaat niet meer.', coalesce(v_order_id,'(leeg)') using errcode='P0002'; end if;

    if v_type = 'add_task' then
      if length(trim(coalesce(v_action->>'name',''))) < 1 then raise exception 'Een nieuwe taak heeft een naam nodig.' using errcode='22023'; end if;
      v_after_id := nullif(v_action->>'afterTaskId','');
      if v_after_id is null then
        select coalesce(max(seq),0)+1 into v_insert_seq from public.planner_tasks_v2 where workspace_id=p_workspace_id and order_id=v_order_id and deleted=false;
      else
        select seq+1 into v_insert_seq from public.planner_tasks_v2 where workspace_id=p_workspace_id and order_id=v_order_id and task_id=v_after_id and deleted=false;
        if v_insert_seq is null then raise exception 'De gekozen voorgaande taak bestaat niet meer.' using errcode='P0002'; end if;
      end if;
      update public.planner_tasks_v2
        set seq=seq+1,data=jsonb_set(data,'{seq}',to_jsonb(seq+1),true),updated_at=v_now
        where workspace_id=p_workspace_id and order_id=v_order_id and deleted=false and seq>=v_insert_seq;
      v_task_id := 'ait_' || floor(extract(epoch from clock_timestamp())*1000)::bigint::text || '_' || v_count::text;
      v_data := jsonb_build_object(
        'id',v_task_id,'orderId',v_order_id,'seq',v_insert_seq,'name',left(v_action->>'name',300),
        'machine',left(coalesce(v_action->>'machine',''),200),'estimate',greatest(0,coalesce((v_action->>'estimate')::numeric,0)),
        'dependsPrev',(v_insert_seq>1),'type',case when v_action->>'taskType' in ('internal','external','wait') then v_action->>'taskType' else 'internal' end,
        'employee',null,'date',null,'start','','planSegments','[]'::jsonb,'status','open','actual',0,'doneQty',0,'note','',
        'createdBy','chatgpt_plugin','createdAt',v_now
      );
      insert into public.planner_tasks_v2(workspace_id,task_id,order_id,seq,status,task_date,employee,machine,task_type,order_active,data,deleted,updated_at)
      values(p_workspace_id,v_task_id,v_order_id,v_insert_seq,'open',null,null,v_data->>'machine',v_data->>'type',v_order.active,v_data,false,v_now);

    elsif v_type in ('remove_task','update_task') then
      v_task_id := v_action->>'taskId';
      select * into v_task from public.planner_tasks_v2
        where workspace_id=p_workspace_id and order_id=v_order_id and task_id=v_task_id and deleted=false
        for update;
      if not found then raise exception 'Taak % bestaat niet meer.', coalesce(v_task_id,'(leeg)') using errcode='P0002'; end if;
      v_protected := coalesce((v_task.data->>'lockedPlanning')::boolean,false) or coalesce(v_task.status,'') in ('started','in_progress','done','completed');
      if v_protected and not p_allow_protected then raise exception 'Taak % is gestart, gereed of vastgezet en vereist extra bevestiging.', coalesce(v_task.data->>'name',v_task_id) using errcode='P0001'; end if;

      if v_type = 'remove_task' then
        v_deleted_tasks := v_deleted_tasks || jsonb_build_array(jsonb_build_object('task',v_task.data,'deletedAt',floor(extract(epoch from v_now)*1000)::bigint,'source','chatgpt_plugin'));
        update public.planner_tasks_v2 set deleted=true,order_active=false,data=v_task.data||jsonb_build_object('deleted',true),updated_at=v_now
          where workspace_id=p_workspace_id and task_id=v_task_id;
        with numbered as (
          select task_id,row_number() over(order by seq,task_id)::integer as new_seq
          from public.planner_tasks_v2 where workspace_id=p_workspace_id and order_id=v_order_id and deleted=false
        )
        update public.planner_tasks_v2 t set seq=n.new_seq,data=jsonb_set(t.data,'{seq}',to_jsonb(n.new_seq),true),updated_at=v_now
          from numbered n where t.workspace_id=p_workspace_id and t.task_id=n.task_id;
      else
        v_fields := coalesce(v_action->'fields','{}'::jsonb);
        if jsonb_typeof(v_fields) <> 'object' then raise exception 'Ongeldige taakvelden.' using errcode='22023'; end if;
        v_data := v_task.data;
        for v_key,v_value in select key,value from jsonb_each(v_fields)
        loop
          if v_key not in ('name','machine','estimate','employee','dependsPrev','type') then raise exception 'Taakveld % is niet toegestaan.', v_key using errcode='22023'; end if;
          if v_key='estimate' and (v_value #>> '{}')::numeric < 0 then raise exception 'Taakduur mag niet negatief zijn.' using errcode='22023'; end if;
          if v_key='type' and (v_value #>> '{}') not in ('internal','external','wait') then raise exception 'Ongeldig taaktype.' using errcode='22023'; end if;
          if v_key='name' and length(trim(v_value #>> '{}')) < 1 then raise exception 'Taaknaam mag niet leeg zijn.' using errcode='22023'; end if;
          v_data := jsonb_set(v_data,array[v_key],v_value,true);
        end loop;
        if (v_fields ? 'machine' or v_fields ? 'estimate') and not v_protected then
          v_data := jsonb_set(jsonb_set(jsonb_set(jsonb_set(v_data,'{planSegments}','[]'::jsonb,true),'{date}','null'::jsonb,true),'{start}','""'::jsonb,true),'{employee}','null'::jsonb,true);
        end if;
        update public.planner_tasks_v2 set
          data=v_data,
          employee=nullif(v_data->>'employee',''),machine=nullif(v_data->>'machine',''),task_type=coalesce(nullif(v_data->>'type',''),task_type),
          task_date=case when coalesce(v_data->>'date','') ~ '^\d{4}-\d{2}-\d{2}$' then (v_data->>'date')::date else null end,
          updated_at=v_now
          where workspace_id=p_workspace_id and task_id=v_task_id;
      end if;

    elsif v_type = 'link_tasks' then
      v_first_id := v_action->>'firstTaskId';v_next_id := v_action->>'nextTaskId';
      if v_first_id=v_next_id then raise exception 'Een taak kan niet aan zichzelf worden gekoppeld.' using errcode='22023'; end if;
      select * into v_first from public.planner_tasks_v2 where workspace_id=p_workspace_id and order_id=v_order_id and task_id=v_first_id and deleted=false for update;
      if not found then raise exception 'De eerste taak bestaat niet meer.' using errcode='P0002'; end if;
      select * into v_next from public.planner_tasks_v2 where workspace_id=p_workspace_id and order_id=v_order_id and task_id=v_next_id and deleted=false for update;
      if not found then raise exception 'De volgende taak bestaat niet meer.' using errcode='P0002'; end if;
      v_protected := coalesce((v_first.data->>'lockedPlanning')::boolean,false) or coalesce(v_first.status,'') in ('started','in_progress','done','completed') or coalesce((v_next.data->>'lockedPlanning')::boolean,false) or coalesce(v_next.status,'') in ('started','in_progress','done','completed');
      if v_protected and not p_allow_protected then raise exception 'De taakkoppeling raakt gestart, gereed of vastgezet werk en vereist extra bevestiging.' using errcode='P0001'; end if;
      v_first_seq := v_first.seq;
      with numbered as (
        select task_id,row_number() over(order by case when task_id=v_next_id then v_first_seq::numeric+0.5 else seq::numeric end,task_id)::integer as new_seq
        from public.planner_tasks_v2 where workspace_id=p_workspace_id and order_id=v_order_id and deleted=false
      )
      update public.planner_tasks_v2 t set seq=n.new_seq,data=jsonb_set(t.data,'{seq}',to_jsonb(n.new_seq),true),updated_at=v_now
        from numbered n where t.workspace_id=p_workspace_id and t.task_id=n.task_id;
      v_data := jsonb_set(v_next.data,'{dependsPrev}','true'::jsonb,true);
      if not v_protected then
        v_data := jsonb_set(jsonb_set(jsonb_set(jsonb_set(v_data,'{planSegments}','[]'::jsonb,true),'{date}','null'::jsonb,true),'{start}','""'::jsonb,true),'{employee}','null'::jsonb,true);
      end if;
      select seq into v_insert_seq from public.planner_tasks_v2 where workspace_id=p_workspace_id and task_id=v_next_id;
      v_data := jsonb_set(v_data,'{seq}',to_jsonb(v_insert_seq),true);
      update public.planner_tasks_v2 set data=v_data,employee=nullif(v_data->>'employee',''),task_date=case when coalesce(v_data->>'date','') ~ '^\d{4}-\d{2}-\d{2}$' then (v_data->>'date')::date else null end,updated_at=v_now
        where workspace_id=p_workspace_id and task_id=v_next_id;
    else
      raise exception 'Actie % is niet toegestaan.', coalesce(v_type,'(leeg)') using errcode='22023';
    end if;
  end loop;

  select data into v_meta from public.planner_shared_state where workspace_id=p_workspace_id for update;
  v_meta := coalesce(v_meta,'{}'::jsonb);
  v_event := jsonb_build_object(
    'id',v_event_id,'at',v_now,'source','chatgpt_plugin','type','ai_task_change','status','applied',
    'situation',format('%s taakwijziging(en) via ChatGPT',v_count),'choice',p_actions,
    'reason',left(trim(p_confirmation_text),500),'userId',auth.uid()
  );
  v_meta := jsonb_set(v_meta,'{aiDecisionLog}',coalesce(v_meta->'aiDecisionLog','[]'::jsonb)||jsonb_build_array(v_event),true);
  v_meta := jsonb_set(v_meta,'{history}',coalesce(v_meta->'history','[]'::jsonb)||jsonb_build_array(v_event),true);
  if jsonb_array_length(v_deleted_tasks)>0 then
    v_meta := jsonb_set(v_meta,'{deletedTasks}',coalesce(v_meta->'deletedTasks','[]'::jsonb)||v_deleted_tasks,true);
  end if;
  insert into public.planner_shared_state(workspace_id,data,updated_at) values(p_workspace_id,v_meta,v_now)
    on conflict(workspace_id) do update set data=excluded.data,updated_at=excluded.updated_at;

  return jsonb_build_object('eventId',v_event_id,'applied',v_count,'updatedAt',v_now,'message','De bevestigde taakwijzigingen zijn opgeslagen.');
end;
$$;

revoke all on function public.apply_ai_task_changes(text,jsonb,text,boolean) from public;
revoke all on function public.apply_ai_task_changes(text,jsonb,text,boolean) from anon;
grant execute on function public.apply_ai_task_changes(text,jsonb,text,boolean) to authenticated;

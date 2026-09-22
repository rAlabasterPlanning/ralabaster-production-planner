create or replace function public.apply_ai_schedule_changes(
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
  v_task public.planner_tasks_v2%rowtype;
  v_other public.planner_tasks_v2%rowtype;
  v_seg jsonb;
  v_other_seg jsonb;
  v_type text;
  v_task_id text;
  v_order_id text;
  v_machine text;
  v_employee text;
  v_first jsonb;
  v_segments jsonb;
  v_start timestamp;
  v_end timestamp;
  v_other_start timestamp;
  v_other_end timestamp;
  v_same_employee boolean;
  v_same_machine boolean;
  v_count integer := 0;
  v_now timestamptz := clock_timestamp();
  v_meta jsonb;
  v_event jsonb;
  v_event_id text := 'aip_' || floor(extract(epoch from clock_timestamp()) * 1000)::bigint::text;
begin
  if auth.uid() is null then raise exception 'Aanmelding vereist.' using errcode='42501'; end if;
  if p_workspace_id <> 'ralabaster' then raise exception 'Onbekende werkruimte.' using errcode='22023'; end if;
  if jsonb_typeof(p_actions) <> 'array' or jsonb_array_length(p_actions)<1 or jsonb_array_length(p_actions)>30 then
    raise exception 'Geef 1 tot en met 30 planningswijzigingen op.' using errcode='22023';
  end if;
  if length(trim(coalesce(p_confirmation_text,'')))<2 then raise exception 'Expliciete bevestiging ontbreekt.' using errcode='22023'; end if;

  for v_action in select value from jsonb_array_elements(p_actions)
  loop
    v_count:=v_count+1;
    v_type:=v_action->>'type'; v_task_id:=v_action->>'taskId'; v_order_id:=v_action->>'orderId';
    select * into v_task from public.planner_tasks_v2
      where workspace_id=p_workspace_id and task_id=v_task_id and order_id=v_order_id and deleted=false
      for update;
    if not found then raise exception 'Taak % bestaat niet meer in deze order.',coalesce(v_task_id,'(leeg)') using errcode='P0002'; end if;

    if coalesce(v_task.status,'') in ('started','in_progress','done','completed') and not p_allow_protected then
      raise exception 'Taak % is gestart of gereed en vereist extra bevestiging.',coalesce(v_task.data->>'name',v_task_id) using errcode='P0001';
    end if;

    if v_type='unschedule_task' then
      update public.planner_tasks_v2 set
        task_date=null,employee=null,
        data=jsonb_set(jsonb_set(jsonb_set(jsonb_set(jsonb_set(data,'{planSegments}','[]'::jsonb,true),'{date}','null'::jsonb,true),'{start}','""'::jsonb,true),'{employee}','null'::jsonb,true),'{lockedPlanning}','false'::jsonb,true)
             || jsonb_build_object('planningOrigin','chatgpt-agent'),
        updated_at=v_now
      where workspace_id=p_workspace_id and task_id=v_task_id;
      continue;
    elsif v_type<>'schedule_task' then
      raise exception 'Actie % is niet toegestaan.',coalesce(v_type,'(leeg)') using errcode='22023';
    end if;

    v_segments:=v_action->'segments';
    if jsonb_typeof(v_segments)<>'array' or jsonb_array_length(v_segments)<1 then raise exception 'Minimaal één plansegment is verplicht.' using errcode='22023'; end if;
    v_machine:=trim(coalesce(nullif(v_action->>'machine',''),v_task.data->>'machine',v_task.machine,''));

    for v_seg in select value from jsonb_array_elements(v_segments)
    loop
      if coalesce(v_seg->>'date','') !~ '^\d{4}-\d{2}-\d{2}$' or coalesce(v_seg->>'start','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then
        raise exception 'Ongeldige datum of starttijd in plansegment.' using errcode='22023';
      end if;
      if coalesce((v_seg->>'minutes')::numeric,0)<=0 then raise exception 'Plansegment moet meer dan 0 minuten duren.' using errcode='22023'; end if;
      v_employee:=coalesce(nullif(v_seg->>'employee',''),nullif(v_action->>'employee',''),nullif(v_task.data->>'employee',''),v_task.employee);
      if v_employee is null or trim(v_employee)='' then raise exception 'Plansegment heeft een medewerker nodig.' using errcode='22023'; end if;
      v_start:=(v_seg->>'date')::date + (v_seg->>'start')::time;
      v_end:=v_start + make_interval(secs=>greatest(60.0,coalesce(nullif(v_seg->>'elapsedMinutes','')::numeric,(v_seg->>'minutes')::numeric)*60)::double precision);

      for v_other in select * from public.planner_tasks_v2
        where workspace_id=p_workspace_id and deleted=false and task_id<>v_task_id and coalesce(status,'') not in ('done','completed')
      loop
        for v_other_seg in select value from jsonb_array_elements(coalesce(v_other.data->'planSegments','[]'::jsonb))
        loop
          if coalesce(v_other_seg->>'date','') !~ '^\d{4}-\d{2}-\d{2}$' or coalesce(v_other_seg->>'start','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then continue; end if;
          v_other_start:=(v_other_seg->>'date')::date + (v_other_seg->>'start')::time;
          v_other_end:=v_other_start + make_interval(secs=>greatest(60.0,coalesce(nullif(v_other_seg->>'elapsedMinutes','')::numeric,nullif(v_other_seg->>'minutes','')::numeric,1)*60)::double precision);
          if v_start < v_other_end and v_other_start < v_end then
            v_same_employee:=coalesce(nullif(v_other_seg->>'employee',''),nullif(v_other.data->>'employee',''),v_other.employee,'')=v_employee;
            v_same_machine:=v_machine<>'' and coalesce(nullif(v_other.data->>'assignedMachine',''),nullif(v_other.data->>'machine',''),v_other.machine,'')=v_machine;
            if v_same_employee or v_same_machine then
              raise exception 'Planningconflict: % botst met % (%).',
                coalesce(v_task.data->>'name',v_task_id),coalesce(v_other.data->>'name',v_other.task_id),
                case when v_same_employee and v_same_machine then 'medewerker en machine' when v_same_employee then 'medewerker' else 'machine' end
                using errcode='23505';
            end if;
          end if;
        end loop;
      end loop;
    end loop;

    v_first:=v_segments->0;
    v_employee:=coalesce(nullif(v_action->>'employee',''),nullif(v_first->>'employee',''),nullif(v_task.data->>'employee',''),v_task.employee);
    v_segments := (
      select jsonb_agg(
        case when coalesce(value->>'employee','')='' then value || jsonb_build_object('employee',v_employee) else value end
        order by ordinality
      )
      from jsonb_array_elements(v_segments) with ordinality
    );

    update public.planner_tasks_v2 set
      task_date=(v_first->>'date')::date,
      employee=v_employee,
      machine=nullif(v_machine,''),
      data=data || jsonb_build_object(
        'date',v_first->>'date','start',v_first->>'start','employee',v_employee,'machine',v_machine,
        'assignedMachine',v_machine,'planSegments',v_segments,'lockedPlanning',true,'planningOrigin','chatgpt-agent'
      ),
      updated_at=v_now
    where workspace_id=p_workspace_id and task_id=v_task_id;
  end loop;

  select data into v_meta from public.planner_shared_state where workspace_id=p_workspace_id for update;
  v_meta:=coalesce(v_meta,'{}'::jsonb);
  v_event:=jsonb_build_object('id',v_event_id,'at',v_now,'source','chatgpt_plugin','type','ai_schedule_change','status','applied',
    'situation',format('%s planningswijziging(en) via ChatGPT',v_count),'choice',p_actions,'reason',left(trim(p_confirmation_text),500),'userId',auth.uid());
  v_meta:=jsonb_set(v_meta,'{aiDecisionLog}',coalesce(v_meta->'aiDecisionLog','[]'::jsonb)||jsonb_build_array(v_event),true);
  v_meta:=jsonb_set(v_meta,'{history}',coalesce(v_meta->'history','[]'::jsonb)||jsonb_build_array(v_event),true);
  insert into public.planner_shared_state(workspace_id,data,updated_at) values(p_workspace_id,v_meta,v_now)
    on conflict(workspace_id) do update set data=excluded.data,updated_at=excluded.updated_at;

  return jsonb_build_object('eventId',v_event_id,'applied',v_count,'updatedAt',v_now,'message','De bevestigde planning is opgeslagen.');
end;
$$;

revoke all on function public.apply_ai_schedule_changes(text,jsonb,text,boolean) from public;
revoke all on function public.apply_ai_schedule_changes(text,jsonb,text,boolean) from anon;
grant execute on function public.apply_ai_schedule_changes(text,jsonb,text,boolean) to authenticated;

-- Explicit reopening retains delivery, invoice, costing and production history.
create or replace function public.planner_reopen_order_v1(p_order_id text,p_reason text,p_task_id text,p_request_id uuid,p_expected_revision text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare o jsonb; t jsonb; previous_task jsonb; entry jsonb; stamp text; task_stamp text; result_tasks jsonb;
begin
 if auth.uid() is null or not public.portal_is_admin() then raise exception 'Alleen een plannerbeheerder kan een order heropenen.' using errcode='42501'; end if;
 if p_request_id is null or nullif(btrim(p_reason),'') is null or length(p_reason)>2000 then raise exception 'Vul een reden in van maximaal 2000 tekens.'; end if;
 select data into o from public.planner_orders_v2 where workspace_id='ralabaster' and order_id=p_order_id and not deleted for update;
 if o is null then raise exception 'Order niet gevonden.'; end if;
 select value into entry from jsonb_array_elements(coalesce(o->'reopenHistory','[]')) where value->>'id'=p_request_id::text;
 if entry is not null then
  if entry->>'reason'<>btrim(p_reason) or coalesce(entry->>'taskId','')<>coalesce(p_task_id,'') then raise exception 'Deze heropening is al opgeslagen met andere gegevens.'; end if;
  if o->>'active'='false' or o->>'status'='completed' or o->>'closed'='true' then raise exception 'Deze heropening is inmiddels weer afgerond. Open de actuele order opnieuw.'; end if;
 else
  if o->>'active' is distinct from 'false' and o->>'status' is distinct from 'completed' and o->>'closed' is distinct from 'true' then raise exception 'Deze order is al actief.'; end if;
  if coalesce(o->>'orderCompletionUpdatedAt','')<>coalesce(p_expected_revision,'') then raise exception 'De order is intussen gewijzigd. Open de heropening opnieuw.'; end if;
  if nullif(p_task_id,'') is not null then
   select data into previous_task from public.planner_tasks_v2 where workspace_id='ralabaster' and task_id=p_task_id and order_id=p_order_id and not deleted for update;
   if previous_task is null then raise exception 'Deze productiestap hoort niet bij deze order.'; end if;
  end if;
  stamp:=to_char(greatest(clock_timestamp(),coalesce(nullif(o->>'orderCompletionUpdatedAt','')::timestamptz,clock_timestamp())+interval '1 second') at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  entry:=jsonb_build_object('id',p_request_id,'at',stamp,'reason',btrim(p_reason),'by',auth.uid(),'taskId',nullif(p_task_id,''),'previousOrder',o-'reopenHistory','previousTask',previous_task);
  o:=(o-array['completedAt','postCalculationCheckedAt','financialCloseoutAt'])||jsonb_build_object('active',true,'closed',false,'status',case when previous_task is null then 'confirmed' else 'in_progress' end,'reopenedAt',stamp,'reopenReason',btrim(p_reason),'reopenedBy',auth.uid(),'lastCompletedAt',o->'completedAt','orderCompletionUpdatedAt',stamp,'reopenHistory',coalesce(o->'reopenHistory','[]')||jsonb_build_array(entry));
  perform set_config('planner.reopen_write','on',true);
  update public.planner_orders_v2 set data=o,active=true,status=o->>'status',completed_at=null,updated_at=now() where workspace_id='ralabaster' and order_id=p_order_id returning data into o;
  perform set_config('planner.reopen_write','off',true);
  if o->>'active'<>'true' or o->>'closed'<>'false' or o->>'status'='completed' then raise exception 'De database heeft het heropenen niet bevestigd.'; end if;
  if previous_task is not null then
   task_stamp:=to_char(greatest(stamp::timestamptz,coalesce(nullif(previous_task->>'taskProgressUpdatedAt','')::timestamptz,stamp::timestamptz)+interval '1 second') at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
   t:=(previous_task-array['completedAt','completedAtDT'])||jsonb_build_object('status','open','date',null,'start','','employee',null,'planSegments','[]'::jsonb,'lockedPlanning',false,'taskProgressUpdatedAt',task_stamp,'stageCorrection',jsonb_build_object('at',task_stamp,'reason',btrim(p_reason),'previousStatus',previous_task->>'status','source','order-reopen'));
   update public.planner_tasks_v2 set data=t,status='open',task_date=null,employee=null,order_active=true,updated_at=now() where workspace_id='ralabaster' and task_id=p_task_id and order_id=p_order_id;
  end if;
 end if;
 select coalesce(jsonb_agg(data order by seq),'[]') into result_tasks from public.planner_tasks_v2 where workspace_id='ralabaster' and order_id=p_order_id and not deleted;
 return jsonb_build_object('order',o,'tasks',result_tasks);
end $$;
revoke all on function public.planner_reopen_order_v1(text,text,text,uuid,text) from public,anon;
grant execute on function public.planner_reopen_order_v1(text,text,text,uuid,text) to authenticated;

-- Older tabs cannot erase the reason or audit trail of a saved reopening.
create or replace function planner_recovery.guard_reopen_history()
returns trigger language plpgsql security invoker set search_path='' as $$
declare k text;
begin
 if coalesce(current_setting('planner.reopen_write',true),'')<>'on' then
  foreach k in array array['reopenHistory','reopenedAt','reopenReason','reopenedBy','lastCompletedAt'] loop
   if old.data ? k then new.data:=jsonb_set(new.data,array[k],old.data->k,true); else new.data:=new.data-k; end if;
  end loop;
 end if;
 return new;
end $$;
revoke all on function planner_recovery.guard_reopen_history() from public,anon,authenticated;
create trigger planner_orders_02_reopen_history before update on public.planner_orders_v2 for each row execute function planner_recovery.guard_reopen_history();

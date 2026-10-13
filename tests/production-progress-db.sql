begin;
do $$declare sid uuid:=gen_random_uuid();oid text:='__progress_order__';tid text:='__progress_task__';w text;v jsonb;p jsonb;
begin
 insert into public.planner_orders_v2(workspace_id,order_id,order_no,active,status,data) values('ralabaster',oid,'PROGRESS-TEST',true,'confirmed',jsonb_build_object('id',oid,'qty',1));
 insert into public.planner_tasks_v2(workspace_id,task_id,order_id,seq,status,machine,task_type,order_active,data) values('ralabaster',tid,oid,1,'partial','Mori ZL15 #1','internal',true,jsonb_build_object('id',tid,'name','Niet telbaar','estimate',480));
 select value->>'id' into w from public.planner_shared_state,jsonb_array_elements(data->'workplaces') where workspace_id='ralabaster' and value->>'name'='Mori ZL15 #1' limit 1;
 insert into public.production_sessions(id,employee,workplace_id,workplace_name,workplace_type,task_id,order_id,operation,phase,started_at,auto_end) values(sid,'Shaffi',w,'Mori ZL15 #1','machine',tid,oid,'Niet telbaar','production',now()-interval '2 hours',now()+interval '6 hours');
 insert into public.production_phases(session_id,phase,started_at) values(sid,'production',now()-interval '2 hours');
 p:=jsonb_build_object('session_id',sid,'employee','Shaffi','action','counts','task_id',tid,'progress_mode','percent','progress_percent',40,'expected_progress_revision',0,'good',0,'scrap',0,'rework',0,'stone_used_pieces',0,'stone_used_kg',0,'stone_loss_kg',0,'expected',jsonb_build_object('good',0,'scrap',0,'rework',0,'stone_used_pieces',0,'stone_used_kg',0,'stone_loss_kg',0),'materials','[]'::jsonb);
 perform public.production_checkpoint(gen_random_uuid(),p);
 select public.production_monitor_snapshot() into v;
 if not exists(select 1 from jsonb_array_elements(v->'taskProgress')x where x->>'task_id'=tid and (x->>'percent')::numeric=40) then raise exception 'Estimated progress missing from monitor';end if;
 begin perform public.production_checkpoint(gen_random_uuid(),p);raise exception 'Stale progress accepted';exception when others then if sqlerrm='Stale progress accepted' then raise;end if;end;
end$$;
rollback;

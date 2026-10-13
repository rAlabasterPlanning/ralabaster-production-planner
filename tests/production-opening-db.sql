-- Must run in BEGIN / ROLLBACK; no test production survives verification.
select set_config('request.jwt.claims',(select jsonb_build_object('sub',user_id,'role','authenticated')::text from public.portal_admins limit 1),true);
set local role authenticated;
do $$declare oid text:='__opening_'||gen_random_uuid();tid text:='__opening_task_'||gen_random_uuid();sid uuid:=gen_random_uuid();req uuid:=gen_random_uuid();cut timestamptz:=now();w text;p jsonb;ctx jsonb;v jsonb;begin
 select value->>'id' into w from public.planner_shared_state,jsonb_array_elements(data->'workplaces') where workspace_id='ralabaster' and value->>'name'='Mori ZL15 #1' limit 1;
 insert into public.planner_orders_v2(workspace_id,order_id,order_no,active,status,data) values('ralabaster',oid,'OPENING-TEST',true,'confirmed',jsonb_build_object('id',oid,'qty',100));
 insert into public.planner_tasks_v2(workspace_id,task_id,order_id,seq,status,machine,task_type,order_active,data) values('ralabaster',tid,oid,1,'open','Mori ZL15 #1','internal',true,jsonb_build_object('id',tid,'name','Draaien','estimate',800));
 insert into public.production_sessions(id,employee,workplace_id,workplace_name,workplace_type,order_id,operation,phase,started_at,auto_end,good,scrap) values(sid,'Shaffi',w,'Mori ZL15 #1','machine',oid,'Orderwerk','production',cut-interval '60 minutes',cut+interval '4 hours',5,1);
 insert into public.production_phases(session_id,phase,started_at) values(sid,'production',cut-interval '60 minutes');
 p:=jsonb_build_object('task_id',tid,'workplace_id',w,'good',50,'scrap',3,'minutes',300,'expected_floor_good',5,'expected_floor_scrap',1,'revision',0,'cutoff',cut,'reason','Implementation start');
 perform public.production_opening_save(req,p);perform public.production_opening_save(req,p);
 if not exists(select 1 from public.production_opening_balances where task_id=tid and good_offset=45 and scrap_offset=2 and minutes_offset=240 and revision=1) then raise exception 'Startstand doubled or existing floor not deducted';end if;
 v:=public.production_monitor_snapshot();select value into ctx from jsonb_array_elements(v->'checkpointContext') where value->>'session_id'=sid::text;
 if (ctx->>'last_report_at')::timestamptz<>cut then raise exception 'Opening measurement does not anchor pace';end if;
 perform public.production_checkpoint(gen_random_uuid(),jsonb_build_object('session_id',sid,'employee','Shaffi','action','counts','good',10,'scrap',1,'rework',0,'stone_used_pieces',0,'stone_used_kg',0,'stone_loss_kg',0,'expected',jsonb_build_object('good',5,'scrap',1,'rework',0,'stone_used_pieces',0,'stone_used_kg',0,'stone_loss_kg',0),'materials','[]'::jsonb),cut);
 if (select good from public.production_sessions where id=sid)+(select good_offset from public.production_opening_balances where task_id=tid)<>55 then raise exception 'Next count must continue from opening total';end if;
 begin perform public.production_opening_save(gen_random_uuid(),p);raise exception 'Stale overwrite accepted';exception when others then if sqlerrm='Stale overwrite accepted' then raise;end if;end;
 p:=p||jsonb_build_object('expected_floor_good',10,'revision',1,'good',55);
 perform public.production_opening_save(gen_random_uuid(),p);
 if not exists(select 1 from public.production_opening_balances where task_id=tid and good_offset=45 and revision=2) then raise exception 'Repeated startstand added instead of replaced';end if;
end$$;

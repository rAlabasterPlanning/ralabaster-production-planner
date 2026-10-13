-- Execute only within BEGIN / ROLLBACK: synthetic data never survives verification.
select set_config('request.jwt.claims',(select jsonb_build_object('sub',user_id,'role','authenticated')::text from public.portal_admins limit 1),true);
set local role authenticated;
do $$declare oid text:='__cost_test_'||gen_random_uuid();tid text:='__cost_task_'||gen_random_uuid();sid uuid:=gen_random_uuid();a timestamptz:=date_trunc('day',now())-interval '40 days'+interval '7 hours';b timestamptz;v jsonb;h jsonb;m uuid:=gen_random_uuid();begin
 b:=a+interval '200 minutes';
 insert into public.planner_orders_v2(workspace_id,order_id,order_no,active,status,data) values('ralabaster',oid,'COST-TEST',true,'confirmed',jsonb_build_object('id',oid,'qty',500,'costing',jsonb_build_object('ops','[]'::jsonb)));
 insert into public.planner_tasks_v2(workspace_id,task_id,order_id,seq,status,machine,task_type,order_active,data) values('ralabaster',tid,oid,1,'open','Mori ZL15 #1','internal',true,jsonb_build_object('id',tid,'name','Draaien','estimate',2500,'rate',30));
 insert into public.production_sessions(id,employee,workplace_id,workplace_name,workplace_type,order_id,operation,phase,started_at,auto_end,ended_at,good,scrap,is_backfill) values(sid,'Shaffi','test-machine','Mori ZL15 #1','machine',oid,'Orderwerk','production',a,b,b,40,2,true);
 insert into public.production_phases(session_id,phase,started_at,ended_at) values(sid,'production',a,b);
 insert into public.production_labor(employee,session_ids,started_at,stop_at,ended_at) values('Shaffi',array[sid],a,b,b);
 insert into public.production_materials(id,name,sku,unit,category,unit_cost) values(m,'TEST tool',oid,'stuks','tool',5);
 insert into public.production_material_moves(material_id,session_id,order_id,workplace_name,employee,kind,quantity,stock_delta,unit,unit_cost,request_id,line_key,occurred_at) values(m,sid,oid,'Mori ZL15 #1','Shaffi','broken',2,-2,'stuks',5,gen_random_uuid(),'test',b);
 v:=public.production_cost_snapshot();
 select value into h from jsonb_array_elements(v->'costHistory') where value->>'order_id'=oid;
 if (h->>'good')::integer<>40 or (h->>'production')::numeric<>200 then raise exception 'Lifetime backfill cost history lost or duplicated';end if;
 if (h->>'labor_production')::numeric>=200 then raise exception 'Employee breaks missing';end if;
 if exists(select 1 from jsonb_array_elements(v->'sessions')x where x->>'id'=sid::text) then raise exception 'Test must be older than floor window';end if;
 if not exists(select 1 from jsonb_array_elements(v->'costTasks')x where x->>'id'=tid and (x->>'rate')::numeric=30) then raise exception 'Calculation rates not exposed';end if;
 if not exists(select 1 from jsonb_array_elements(v->'costMaterialTotals')x where x->>'order_id'=oid and (x->>'cost')::numeric=10) then raise exception 'Priced broken tools missing';end if;
end$$;

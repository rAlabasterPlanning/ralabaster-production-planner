-- Append after production-floor-orders-db.sql, inside BEGIN / ROLLBACK only.
insert into public.planner_tasks_v2(workspace_id,task_id,order_id,seq,status,machine,task_type,order_active,data) values('ralabaster','__mat_polish__','__floor_order_test__',3,'open','Polijsten','internal',true,'{"id":"__mat_polish__","name":"Polijsten","doneQty":0,"actual":0}');
do $$declare r jsonb;m uuid;sid uuid;req uuid:=gen_random_uuid();rev bigint;w text;s3 uuid:=gen_random_uuid();begin
r:=public.production_material_command(gen_random_uuid(),'{"action":"create","name":"TEST insert","sku":"__test_insert__","unit":"stuks","category":"tool","minimum":18,"quantity":20,"unit_cost":2}');m:=(r->>'material_id')::uuid;
select revision into rev from public.production_materials where id=m;
select id into sid from public.production_sessions where order_id='__floor_order_test__' and ended_at is null;
begin
perform public.production_command(gen_random_uuid(),'stop',jsonb_build_object('employee','Shaffi','session_id',sid,'good',1,'scrap',0,'rework',0,'workplace_complete',true,'materials',jsonb_build_array(jsonb_build_object('material_id',m,'quantity',3,'kind','broken'))),clock_timestamp());raise exception 'incomplete batch accepted';exception when others then if sqlerrm='incomplete batch accepted' then raise;end if;end;
if (select stock from public.production_materials where id=m)<>20 then raise exception 'failed completion deducted stock';end if;
perform public.production_command(req,'stop',jsonb_build_object('employee','Shaffi','session_id',sid,'good',460,'scrap',0,'rework',0,'workplace_complete',true,'materials',jsonb_build_array(jsonb_build_object('material_id',m,'quantity',3,'kind','broken')),'stone_loss_kg',1.25),clock_timestamp());
perform public.production_command(req,'stop',jsonb_build_object('employee','Shaffi','session_id',sid,'good',460,'scrap',0,'rework',0,'workplace_complete',true,'materials',jsonb_build_array(jsonb_build_object('material_id',m,'quantity',3,'kind','broken')),'stone_loss_kg',1.25),clock_timestamp());
if (select stock from public.production_materials where id=m)<>17 then raise exception 'stock double deduction';end if;
if (select count(*) from public.production_material_moves where request_id=req)<>2 then raise exception 'material/scrap audit missing';end if;
if not exists(select 1 from public.production_material_moves where request_id=req and kind='alabaster_scrap' and quantity=1.25 and stock_delta=0) then raise exception 'stone loss must not rebook stone stock';end if;
if not exists(select 1 from public.planner_tasks_v2 where task_id='__floor_order_turn__' and status='done' and data->>'doneQty'='500') then raise exception 'operation completion missing';end if;
if (select status from public.planner_tasks_v2 where task_id='__mat_polish__')<>'open' then raise exception 'next task started without confirmation';end if;
begin
perform public.production_material_command(gen_random_uuid(),jsonb_build_object('action','settings','material_id',m,'revision',rev,'minimum',12,'unit_cost',2));raise exception 'stale stock settings accepted';exception when others then if sqlerrm='stale stock settings accepted' then raise;end if;end;
select revision into rev from public.production_materials where id=m;
perform public.production_material_command(gen_random_uuid(),jsonb_build_object('action','receipt','material_id',m,'revision',rev,'quantity',10));
if (select stock from public.production_materials where id=m)<>27 then raise exception 'receipt failed';end if;
select revision into rev from public.production_materials where id=m;
perform public.production_material_command(gen_random_uuid(),jsonb_build_object('action','stocktake','material_id',m,'revision',rev,'quantity',24));
select value->>'id' into w from public.planner_shared_state,jsonb_array_elements(data->'workplaces') where value->>'name'='INTERN - Algemeen' limit 1;
perform public.production_command(gen_random_uuid(),'start',jsonb_build_object('employee','Ralph','session_id',s3,'workplace_id',w,'overtime',true),clock_timestamp());
perform public.production_command(gen_random_uuid(),'close_day',jsonb_build_object('employee','Ralph','rows',jsonb_build_array(jsonb_build_object('session_id',s3,'good',0,'scrap',0,'rework',0,'materials',jsonb_build_array(jsonb_build_object('material_id',m,'quantity',2,'kind','used'))))),clock_timestamp());
if (select stock from public.production_materials where id=m)<>22 then raise exception 'day close material deduction failed';end if;
if jsonb_array_length(public.production_snapshot()->'materials')<>11 then raise exception 'catalogue missing';end if;
if (select count(*) from public.production_materials where category='abrasive' and not stock_known)<>10 then raise exception 'seed stock guessed';end if;
end$$;
select 'stock, minimum, duplicate prevention, atomic completion, scrap weight, receipt, recount, day close and next task passed' as result;

begin;
set local statement_timeout='15s';
select set_config('request.jwt.claim.sub',(select user_id::text from public.portal_admins limit 1),true);
select set_config('request.jwt.claim.role','authenticated',true);
set local role authenticated;
do $$
declare q jsonb; result jsonb; saved jsonb;
begin
 q:='{"id":"__repeat_test_line","quoteNo":"__REPEAT_ROUTE_TEST__","name":"Synthetic repeated route","qty":10,"saleUnit":100,"materialCost":0,"materialMode":"unit","ops":[{"id":"s1","name":"Schuren ronde 1","machine":"Schuren & polijsten","minutes":2,"rate":26,"mode":"unit"},{"id":"e1","name":"Epoxy laag 1","machine":"Epoxy","minutes":3,"rate":20,"mode":"unit"},{"id":"s2","name":"Schuren ronde 2","machine":"Schuren & polijsten","minutes":4,"rate":26,"mode":"unit"},{"id":"e2","name":"Epoxy laag 2","machine":"Epoxy","minutes":5,"rate":20,"mode":"unit"},{"id":"s3","name":"Schuren eindafwerking","machine":"Schuren & polijsten","minutes":6,"rate":26,"mode":"unit"}]}'::jsonb;
 update public.planner_shared_state set data=jsonb_set(data,'{quotes}',coalesce(data->'quotes','[]')||jsonb_build_array(q)) where workspace_id='ralabaster';
 result:=public.planner_accept_quote_v2('ralabaster','__REPEAT_ROUTE_TEST__',jsonb_build_array(q),'[{"lineId":"__repeat_test_line","qty":10,"tierQty":10,"confirmed":false,"reason":""}]'::jsonb);
 if jsonb_array_length(result->'tasks')<>5 then raise exception 'Repeated tasks collapsed';end if;
 if result#>>'{tasks,0,machine}'<>'Schuren & polijsten' or result#>>'{tasks,2,machine}'<>'Schuren & polijsten' or result#>>'{tasks,4,machine}'<>'Schuren & polijsten' then raise exception 'Occurrence label became a workplace';end if;
 if result#>>'{tasks,1,name}'<>'Epoxy laag 1' or result#>>'{tasks,3,name}'<>'Epoxy laag 2' or result#>>'{tasks,1,machine}'<>'Epoxy' then raise exception 'Label or epoxy workplace lost';end if;
 if result#>>'{tasks,2,operationInstanceId}'<>'s2' or (result#>>'{tasks,2,estimate}')::numeric<>40 then raise exception 'Identity or independent duration lost';end if;
 if abs((result#>>'{orders,0,totalCost}')::numeric-78.6666666667)>0.000001 then raise exception 'Repeated work not counted in cost';end if;
 if (select count(distinct value->>'id') from jsonb_array_elements(result->'tasks'))<>5 then raise exception 'Task identities duplicated';end if;
 select data->'quotes' into saved from public.planner_shared_state where workspace_id='ralabaster';
 if not saved @> jsonb_build_array(q) then raise exception 'Source quotation altered';end if;
end $$;
rollback;

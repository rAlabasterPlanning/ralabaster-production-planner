-- Synthetic regression only; all inserted quotes/orders/tasks are rolled back.
begin;
set local statement_timeout='15s';
select set_config('request.jwt.claim.sub',(select user_id::text from public.portal_admins limit 1),true);
set local role authenticated;
do $$
declare q jsonb; lines jsonb; baseline jsonb; choices jsonb; result jsonb; rejected boolean;
begin
 q:='{"id":"__zero_line_1","quoteNo":"__ZERO_ACCEPT_TEST__","lineNo":1,"name":"Synthetic selected product","qty":1,"saleUnit":549.3,"includeTierPricing":true,"priceTiers":[{"qty":1,"saleUnit":549.3}],"ops":[{"name":"Work","mode":"unit","minutes":5,"rate":30},{"name":"Setup","mode":"batch","minutes":30,"rate":30}]}'::jsonb;
 lines:=jsonb_build_array(q,q||'{"id":"__zero_line_2","lineNo":2,"name":"Synthetic skipped product 2"}'::jsonb,q||'{"id":"__zero_line_3","lineNo":3,"name":"Synthetic skipped product 3"}'::jsonb);
 update public.planner_shared_state set data=jsonb_set(data,'{quotes}',(data->'quotes')||lines) where workspace_id='ralabaster';
 select data->'quotes' into baseline from public.planner_shared_state where workspace_id='ralabaster';
 choices:='[{"lineId":"__zero_line_1","qty":1,"tierQty":1,"confirmed":false,"reason":""},{"lineId":"__zero_line_2","qty":0,"tierQty":1,"confirmed":false,"reason":""},{"lineId":"__zero_line_3","qty":0,"tierQty":1,"confirmed":false,"reason":""}]';
 result:=public.planner_accept_quote_v1('ralabaster','__ZERO_ACCEPT_TEST__',lines,choices);
 if jsonb_array_length(result->'orders')<>1 or jsonb_array_length(result->'tasks')<>2 then raise exception 'Skipped lines generated orders or tasks'; end if;
 if result#>>'{orders,0,sourceQuoteLineId}'<>'__zero_line_1' or (result#>>'{orders,0,totalSale}')::numeric<>549.3 then raise exception 'Wrong selected order or amount'; end if;
 if exists(select 1 from public.planner_orders_v2 where data->>'sourceQuoteLineId' in ('__zero_line_2','__zero_line_3')) then raise exception 'Zero order exists'; end if;
 if (select data->'quotes' from public.planner_shared_state where workspace_id='ralabaster')<>baseline then raise exception 'Original quote changed'; end if;
 result:=public.planner_accept_quote_v1('ralabaster','__ZERO_ACCEPT_TEST__',lines,choices);
 if not (result->>'existing')::boolean or (select count(*) from public.planner_orders_v2 where data->>'sourceQuoteNo'='__ZERO_ACCEPT_TEST__')<>1 then raise exception 'Partial-acceptance retry duplicated order'; end if;
 rejected:=false;
 begin perform public.planner_accept_quote_v1('ralabaster','__ZERO_ACCEPT_TEST__',lines,jsonb_set(choices,'{0,qty}','0'));
 exception when others then if sqlerrm not like '%minstens één product%' then raise; end if; rejected:=true; end;
 if not rejected then raise exception 'All-zero acceptance allowed'; end if;
 rejected:=false;
 begin perform public.planner_accept_quote_v1('ralabaster','__ZERO_ACCEPT_TEST__',lines,jsonb_set(choices,'{1,qty}','-1'));
 exception when others then if sqlerrm not like '%geheel aantal%' then raise; end if; rejected:=true; end;
 if not rejected then raise exception 'Negative quantity allowed on retry'; end if;
 rejected:=false;
 begin perform public.planner_accept_quote_v1('ralabaster','__ZERO_ACCEPT_TEST__',lines,jsonb_set(choices,'{1,qty}','1'));
 exception when others then if sqlerrm not like '%al aan een order gekoppeld%' then raise; end if; rejected:=true; end;
 if not rejected then raise exception 'Different second acceptance allowed'; end if;
end $$;
rollback;
select 'PASS: 1/0/0 creates one order, no skipped tasks, original quote preserved, retry safe, all-zero and negative rejected' as result;

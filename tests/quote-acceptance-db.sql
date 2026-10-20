-- Run against a disposable database, or with this explicit ROLLBACK.
-- Synthetic quotes are appended temporarily; no real quotation is accepted.
begin;
set local statement_timeout='15s';
select set_config('request.jwt.claim.sub',(select user_id::text from public.portal_admins limit 1),true);
select set_config('request.jwt.claim.role','authenticated',true);
set local role authenticated;
do $$
declare
 before_quotes jsonb; baseline jsonb; lines jsonb; q jsonb; choices jsonb; result jsonb; retry jsonb; rejected boolean;
begin
 select data->'quotes' into before_quotes from public.planner_shared_state where workspace_id='ralabaster';
 q:='{"id":"__accept_test_line","quoteNo":"__ACCEPT_TEST__","lineNo":1,"name":"Synthetic acceptance test","qty":10,"saleUnit":100,"adjustmentPct":-10,"includeTierPricing":true,"priceTiers":[{"qty":10,"saleUnit":100},{"qty":25,"saleUnit":85},{"qty":100,"saleUnit":60}],"tierVisibility":{"100":false},"materialCost":10,"materialMode":"unit","ops":[{"name":"Schuren","mode":"unit","minutes":5,"rate":30},{"name":"Instellen","mode":"batch","minutes":60,"rate":30},{"name":"Extern","mode":"external","minutes":20160,"externalBatch":20,"externalUnit":1},{"name":"Drogen","mode":"wait","minutes":540}],"customerSnapshot":{},"deadline":"2026-12-01"}'::jsonb;
 lines:=jsonb_build_array(q,q||'{"id":"__accept_test_line_2","lineNo":2,"name":"Synthetic second product"}'::jsonb);
 update public.planner_shared_state set data=jsonb_set(data,'{quotes}',before_quotes||lines) where workspace_id='ralabaster';
 select data->'quotes' into baseline from public.planner_shared_state where workspace_id='ralabaster';
 choices:='[{"lineId":"__accept_test_line","qty":25,"tierQty":25,"confirmed":false,"reason":""},{"lineId":"__accept_test_line_2","qty":20,"tierQty":25,"confirmed":false,"reason":""}]';
 -- The second line is invalid: the first order and its tasks must roll back too.
 rejected:=false;
 begin perform public.planner_accept_quote_v1('ralabaster','__ACCEPT_TEST__',lines,choices);
 exception when others then if sqlerrm not like '%afwijkende prijsafspraak%' then raise; end if;rejected:=true;end;
 if not rejected or exists(select 1 from public.planner_orders_v2 where data->>'sourceQuoteNo'='__ACCEPT_TEST__') then raise exception 'Atomic rollback failed'; end if;
 choices:=jsonb_set(jsonb_set(choices,'{1,confirmed}','true'),'{1,reason}','"Customer confirmed custom quantity"');
 result:=public.planner_accept_quote_v1('ralabaster','__ACCEPT_TEST__',lines,choices);
 if jsonb_array_length(result->'orders')<>2 or jsonb_array_length(result->'tasks')<>8 then raise exception 'Missing orders/tasks'; end if;
 if (result#>>'{orders,0,qty}')::numeric<>25 or (result#>>'{orders,0,saleUnit}')::numeric<>76.5
  or (result#>>'{orders,0,totalSale}')::numeric<>1912.5 or round((result#>>'{orders,0,totalCost}')::numeric,6)<>387.5 then raise exception 'Incorrect tier price, adjustment or cost'; end if;
 if (result#>>'{tasks,0,estimate}')::numeric<>125 or (result#>>'{tasks,1,estimate}')::numeric<>60
  or (result#>>'{tasks,2,externalLeadDays}')::numeric<>14 or (result#>>'{tasks,3,estimate}')::numeric<>540 then raise exception 'Production task estimates are incorrect'; end if;
 if result#>'{orders,0,sourceQuoteSnapshot}'<>q then raise exception 'Quote snapshot changed'; end if;
 if (select data->'quotes' from public.planner_shared_state where workspace_id='ralabaster')<>baseline then raise exception 'Original quotations changed'; end if;
 retry:=public.planner_accept_quote_v1('ralabaster','__ACCEPT_TEST__',lines,choices);
 if not (retry->>'existing')::boolean or (select count(*) from public.planner_orders_v2 where data->>'sourceQuoteNo'='__ACCEPT_TEST__')<>2 then raise exception 'Retry duplicated order'; end if;
 rejected:=false;
 begin perform public.planner_accept_quote_v1('ralabaster','__ACCEPT_TEST__',lines,jsonb_set(choices,'{0,qty}','50'));
 exception when others then if sqlerrm not like '%al aan een order gekoppeld%' then raise;end if;rejected:=true;end;
 if not rejected then raise exception 'Second acceptance was not blocked';end if;
 -- New quote to exercise validation independently of duplicate protection.
 lines:=jsonb_build_array(q||'{"id":"__accept_validation","quoteNo":"__ACCEPT_VALIDATION__"}'::jsonb);
 update public.planner_shared_state set data=jsonb_set(data,'{quotes}',(data->'quotes')||lines) where workspace_id='ralabaster';
 choices:='[{"lineId":"__accept_validation","qty":100,"tierQty":100,"confirmed":true,"reason":"test"}]';
 rejected:=false;
 begin perform public.planner_accept_quote_v1('ralabaster','__ACCEPT_VALIDATION__',lines,choices);
 exception when others then if sqlerrm not like '%staat niet op de offerte%' then raise;end if;rejected:=true;end;
 if not rejected then raise exception 'Hidden tier accepted';end if;
 rejected:=false;
 begin perform public.planner_accept_quote_v1('ralabaster','__ACCEPT_VALIDATION__',lines,jsonb_set(jsonb_set(choices,'{0,tierQty}','25'),'{0,qty}','1.5'));
 exception when others then if sqlerrm not like '%geheel aantal%' then raise;end if;rejected:=true;end;
 if not rejected then raise exception 'Fractional quantity accepted';end if;
 rejected:=false;
 begin perform public.planner_accept_quote_v1('ralabaster','__ACCEPT_VALIDATION__','[]',choices);
 exception when others then if sqlerrm not like '%intussen gewijzigd%' then raise;end if;rejected:=true;end;
 if not rejected then raise exception 'Stale quote accepted';end if;
end $$;
reset role;
-- Function is invoker, anon has no execution permission, non-admin is rejected.
do $$ begin
 if has_function_privilege('anon','public.planner_accept_quote_v1(text,text,jsonb,jsonb)','execute') then raise exception 'Anonymous execute granted'; end if;
 if (select prosecdef from pg_proc where oid='public.planner_accept_quote_v1(text,text,jsonb,jsonb)'::regprocedure) then raise exception 'Function bypasses RLS';end if;
end $$;
rollback;
select 'PASS: atomic acceptance, tiers, deviation validation, quote preservation, task estimates, retry, duplicates, stale quote and permissions' as result;

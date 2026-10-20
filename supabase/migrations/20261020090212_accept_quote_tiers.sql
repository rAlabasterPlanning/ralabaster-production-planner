-- One accepted order per source line, including archived/deleted orders.
create unique index planner_orders_quote_line_once
 on public.planner_orders_v2(workspace_id,(data->>'sourceQuoteLineId'))
 where nullif(data->>'sourceQuoteLineId','') is not null;

create function public.planner_accept_quote_v1(
 p_workspace_id text,p_quote_no text,p_expected_lines jsonb,p_choices jsonb
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare
 meta jsonb; lines jsonb; q jsonb; choice jsonb; tier jsonb; op jsonb;
 orders jsonb:='[]'; tasks jsonb:='[]'; ord jsonb; task jsonb;
 qty numeric; tier_qty numeric; price numeric; effective_price numeric;
 cost numeric; minutes numeric; estimate numeric; ready text;
 oid text; tid text; order_no text; mode text; i integer:=0; j integer;
begin
 if auth.uid() is null or not public.portal_is_admin() or p_workspace_id<>'ralabaster' then
  raise exception 'Alleen een ingelogde plannerbeheerder kan een offerte accepteren';
 end if;
 -- Serialize accepts and quotation edits. No UPDATE of the quotation occurs.
 select data into meta from public.planner_shared_state
 where workspace_id=p_workspace_id for update;
 if not found then raise exception 'Planner niet gevonden'; end if;
 if jsonb_typeof(p_choices) is distinct from 'array' or jsonb_typeof(p_expected_lines) is distinct from 'array' then
  raise exception 'Ongeldige acceptatie';
 end if;
 select coalesce(jsonb_agg(value order by coalesce((value->>'lineNo')::integer,0)),'[]') into lines
 from jsonb_array_elements(coalesce(meta->'quotes','[]'))
 where coalesce(value->>'quoteNo',value->>'orderNo')=p_quote_no;
 if jsonb_array_length(lines)=0 then raise exception 'Offerte niet gevonden'; end if;

 -- A lost response may be retried, but never generates a second order.
 select coalesce(jsonb_agg(data),'[]') into orders from public.planner_orders_v2
 where workspace_id=p_workspace_id and data->>'sourceQuoteNo'=p_quote_no;
 if jsonb_array_length(orders)>0 then
  if jsonb_array_length(orders)<>jsonb_array_length(p_choices)
   or exists(select 1 from jsonb_array_elements(orders) o where not exists(
    select 1 from jsonb_array_elements(p_choices) c where c=o->'acceptanceChoice')) then
   raise exception 'Deze offerte is al aan een order gekoppeld. Open de bestaande order om de staffel te wijzigen.';
  end if;
  select coalesce(jsonb_agg(data),'[]') into tasks from public.planner_tasks_v2
  where workspace_id=p_workspace_id and order_id in(select value->>'id' from jsonb_array_elements(orders));
  return jsonb_build_object('orders',orders,'tasks',tasks,'existing',true);
 end if;
 if exists(select 1 from jsonb_array_elements(lines) x where nullif(x->>'orderId','') is not null) then
  raise exception 'Deze offerte is al geaccepteerd';
 end if;
 if lines is distinct from p_expected_lines then raise exception 'De offerte is intussen gewijzigd. Herlaad en controleer de offerte opnieuw.'; end if;
 if jsonb_array_length(p_choices)<>jsonb_array_length(lines)
 or (select count(distinct value->>'lineId') from jsonb_array_elements(p_choices))<>jsonb_array_length(lines) then
  raise exception 'Bevestig precies één keuze per offerteregel';
 end if;
 orders:='[]';
 for q in select value from jsonb_array_elements(lines) loop
  select value into choice from jsonb_array_elements(p_choices) where value->>'lineId'=q->>'id';
  if choice is null then raise exception 'Offerteregel ontbreekt'; end if;
  qty:=(choice->>'qty')::numeric; tier_qty:=(choice->>'tierQty')::numeric;
  if qty is null or qty<1 or qty>2147483647 or qty<>trunc(qty)
    or tier_qty is null or tier_qty<1 or tier_qty>2147483647 or tier_qty<>trunc(tier_qty) then
   raise exception 'Orderaantal en staffelaantal moeten positieve gehele aantallen zijn';
  end if;
  tier:=null;
  if coalesce((q->>'includeTierPricing')::boolean,false) then
   select value into tier from jsonb_array_elements(coalesce(q->'priceTiers','[]'))
   where (value->>'qty')::numeric=tier_qty
    and coalesce(q->'tierVisibility'->>(value->>'qty'),'true')<>'false' limit 1;
  end if;
  if tier is null and (q->>'qty')::numeric=tier_qty then tier:=q; end if;
  if tier is null then raise exception 'Gekozen staffel staat niet op de offerte'; end if;
  price:=(tier->>'saleUnit')::numeric;
  if price is null or price<0 or price::text in ('NaN','Infinity','-Infinity') then raise exception 'Ongeldige staffelprijs'; end if;
  if qty<>tier_qty and (coalesce((choice->>'confirmed')::boolean,false)=false
   or length(btrim(coalesce(choice->>'reason','')))=0 or length(choice->>'reason')>1000) then
   raise exception 'Bevestig de afwijkende prijsafspraak en vul een toelichting in';
  end if;
  effective_price:=price*(1+coalesce((q->>'adjustmentPct')::numeric,0)/100);
  if effective_price<0 then raise exception 'Korting resulteert in een negatieve prijs'; end if;
  oid:='oq_'||md5(p_workspace_id||':'||p_quote_no||':'||(q->>'id'));
  i:=i+1;order_no:=p_quote_no||case when jsonb_array_length(lines)>1 then '-'||lpad(i::text,2,'0') else '' end;
  ready:=coalesce(nullif(q->>'customerReadyDate',''),nullif(q->>'estimatedReadyDate',''),nullif(q->>'deadline',''),'');
  cost:=coalesce((q->>'materialCost')::numeric,0)*case when q->>'materialMode'='unit' then qty else 1 end;
  j:=0;
  for op in select value from jsonb_array_elements(coalesce(q->'ops','[]')) loop
   j:=j+1; mode:=coalesce(op->>'mode','batch');minutes:=coalesce((op->>'minutes')::numeric,0);
   if mode='external' then cost:=cost+coalesce((op->>'externalBatch')::numeric,0)+coalesce((op->>'externalUnit')::numeric,0)*qty;
   elsif mode<>'wait' then cost:=cost+minutes/60*coalesce((op->>'rate')::numeric,0)*case when mode='unit' then qty else 1 end; end if;
   estimate:=minutes*case when mode='unit' then qty else 1 end;
   if mode='wait' and estimate=0 then estimate:=540; end if;
   tid:=oid||'_t_'||j;
   task:=jsonb_build_object('id',tid,'orderId',oid,'seq',j,'name',op->>'name','machine',op->>'name',
    'estimate',estimate,'calcMode',mode,'orderCalcMinutes',minutes,'rate',coalesce((op->>'rate')::numeric,0),
    'dependsPrev',j>1,'type',case when mode='external' then 'external' when mode='wait' then 'wait' else 'internal' end,
    'employee',null,'date',null,'start','','planSegments','[]'::jsonb,'status','open','actual',0,'doneQty',0,'note','',
    'externalLeadDays',case when mode='external' then greatest(1,ceil(coalesce(nullif(minutes,0),20160)/1440)) else null end,
    'expectedExternalCostBatch',coalesce((op->>'externalBatch')::numeric,0),'expectedExternalCostUnit',coalesce((op->>'externalUnit')::numeric,0));
   tasks:=tasks||jsonb_build_array(task);
  end loop;
  ord:=jsonb_build_object('id',oid,'orderGroupId','qaccept_'||md5(p_workspace_id||':'||p_quote_no),'orderNo',order_no,
   'customerId',q->>'customerId','customerName',q->'customerSnapshot'->>'company','customerSnapshot',q->'customerSnapshot',
   'customerReference',coalesce(q->>'customerReference',''),'project',coalesce(q->>'project',''),'product',q->>'name',
   'sourceQuoteNo',p_quote_no,'sourceQuoteLineId',q->>'id','sourceQuoteSnapshot',q,'acceptanceChoice',choice,
   'acceptedTierQty',tier_qty,'quotedSaleUnit',price,'adjustmentPct',coalesce((q->>'adjustmentPct')::numeric,0),
   'qty',qty,'saleUnit',effective_price,'totalSale',qty*effective_price,'costUnit',cost/qty,'totalCost',cost,
   'marginTotal',qty*effective_price-cost,'marginUnit',effective_price-cost/qty,
   'costing',q||jsonb_build_object('qty',qty,'saleUnit',effective_price,'total',qty*effective_price,'costUnit',cost/qty),
   'deadline',ready,'communicatedDeadline',ready,'customerReadyDate',ready,'created',current_date::text,
   'acceptedAt',now(),'acceptedBy',auth.uid(),'active',true,'status','confirmed',
   'incoterm',q->>'incoterm','paymentTerms',q->>'paymentTerms','packagingTerms',q->>'packagingTerms');
  insert into public.planner_orders_v2(workspace_id,order_id,order_no,status,deadline,data)
   values(p_workspace_id,oid,order_no,'confirmed',nullif(ready,'')::date,ord);
  orders:=orders||jsonb_build_array(ord);
 end loop;
 for task in select value from jsonb_array_elements(tasks) loop
  insert into public.planner_tasks_v2(workspace_id,task_id,order_id,seq,status,machine,task_type,data)
   values(p_workspace_id,task->>'id',task->>'orderId',(task->>'seq')::integer,'open',task->>'machine',task->>'type',task);
 end loop;
 return jsonb_build_object('orders',orders,'tasks',tasks,'existing',false);
end $$;
revoke all on function public.planner_accept_quote_v1(text,text,jsonb,jsonb) from public,anon;
grant execute on function public.planner_accept_quote_v1(text,text,jsonb,jsonb) to authenticated;

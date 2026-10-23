begin;
-- Zero-quantity choices preserve the quote but create no order or production tasks.
create or replace function public.planner_accept_quote_v2(
 p_workspace_id text,p_quote_no text,p_expected_lines jsonb,p_choices jsonb,
 p_customer_reference text default null,p_requested_delivery_date date default null,p_confirmed_delivery_date date default null
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare
 meta jsonb; lines jsonb; q jsonb; choice jsonb; tier jsonb; op jsonb;
 orders jsonb:='[]'; tasks jsonb:='[]'; ord jsonb; task jsonb;
 qty numeric; tier_qty numeric; price numeric; effective_price numeric;
 cost numeric; minutes numeric; estimate numeric; ready text;
 details jsonb; requested text; customer_ref text;
 oid text; tid text; order_no text; mode text; i integer:=0; j integer;
begin
 if auth.uid() is null or not public.portal_is_admin() or p_workspace_id<>'ralabaster' then
  raise exception 'Alleen een ingelogde plannerbeheerder kan een offerte accepteren';
 end if;
 if length(coalesce(p_customer_reference,''))>200 then raise exception 'Het PO-nummer mag maximaal 200 tekens bevatten.'; end if;
 details:=jsonb_build_object('customerReference',nullif(btrim(p_customer_reference),''),'requestedDeliveryDate',p_requested_delivery_date,'confirmedDeliveryDate',p_confirmed_delivery_date);
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

 if jsonb_array_length(p_choices)<>jsonb_array_length(lines)
 or (select count(distinct value->>'lineId') from jsonb_array_elements(p_choices))<>jsonb_array_length(lines)
 or exists(select 1 from jsonb_array_elements(p_choices) c where not exists(select 1 from jsonb_array_elements(lines) as offered(value) where offered.value->>'id'=c->>'lineId')) then
  raise exception 'Bevestig precies één keuze per offerteregel';
 end if;
 if exists(select 1 from jsonb_array_elements(p_choices) c where (c->>'qty')::numeric is null or (c->>'qty')::numeric<0 or (c->>'qty')::numeric>2147483647 or (c->>'qty')::numeric<>trunc((c->>'qty')::numeric)) then
  raise exception 'Orderaantal moet een geheel aantal vanaf 0 zijn';
 end if;
 if not exists(select 1 from jsonb_array_elements(p_choices) c where (c->>'qty')::numeric>0) then
  raise exception 'Kies minstens één product met een positief orderaantal';
 end if;

 -- A lost response may be retried, but never generates a second order.
 select coalesce(jsonb_agg(data),'[]') into orders from public.planner_orders_v2
 where workspace_id=p_workspace_id and data->>'sourceQuoteNo'=p_quote_no;
 if jsonb_array_length(orders)>0 then
  if exists(select 1 from jsonb_array_elements(orders) o where o->'acceptedOrderDetails' is distinct from details) then
   raise exception 'Deze offerte is al geaccepteerd met andere ordergegevens. Open de bestaande order.';
  end if;
  if jsonb_array_length(orders)<>(select count(*) from jsonb_array_elements(p_choices) c where (c->>'qty')::numeric>0)
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

 orders:='[]';
 for q in select value from jsonb_array_elements(lines) loop
  select value into choice from jsonb_array_elements(p_choices) where value->>'lineId'=q->>'id';
  if choice is null then raise exception 'Offerteregel ontbreekt'; end if;
  qty:=(choice->>'qty')::numeric; tier_qty:=(choice->>'tierQty')::numeric;
  if qty is null or qty<0 or qty>2147483647 or qty<>trunc(qty) then
   raise exception 'Orderaantal moet een geheel aantal vanaf 0 zijn';
  end if;
  -- A zero quantity explicitly excludes this product; no price/cost/task is created.
  if qty=0 then continue; end if;
  if tier_qty is null or tier_qty<1 or tier_qty>2147483647 or tier_qty<>trunc(tier_qty) then
   raise exception 'Staffelaantal moet een positief geheel aantal zijn';
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
  customer_ref:=coalesce(nullif(btrim(p_customer_reference),''),q->>'customerReference','');
  requested:=coalesce(p_requested_delivery_date::text,nullif(q->>'customerReadyDate',''),nullif(q->>'deadline',''),'');
  ready:=coalesce(p_confirmed_delivery_date::text,nullif(q->>'communicatedDeadline',''),nullif(q->>'estimatedReadyDate',''),nullif(q->>'deadline',''),'');
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
   'customerReference',customer_ref,'acceptedOrderDetails',details,'requestedDeliveryDate',requested,'project',coalesce(q->>'project',''),'product',q->>'name',
   'sourceQuoteNo',p_quote_no,'sourceQuoteLineId',q->>'id','sourceQuoteSnapshot',q,'acceptanceChoice',choice,
   'acceptedTierQty',tier_qty,'quotedSaleUnit',price,'adjustmentPct',coalesce((q->>'adjustmentPct')::numeric,0),
   'qty',qty,'saleUnit',effective_price,'totalSale',qty*effective_price,'costUnit',cost/qty,'totalCost',cost,
   'marginTotal',qty*effective_price-cost,'marginUnit',effective_price-cost/qty,
   'costing',q||jsonb_build_object('customerReference',customer_ref,'customerReadyDate',requested,'communicatedDeadline',ready,'qty',qty,'saleUnit',effective_price,'total',qty*effective_price,'costUnit',cost/qty),
   'deadline',ready,'communicatedDeadline',ready,'customerReadyDate',requested,'created',current_date::text,
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
revoke all on function public.planner_accept_quote_v2(text,text,jsonb,jsonb,text,date,date) from public,anon;
grant execute on function public.planner_accept_quote_v2(text,text,jsonb,jsonb,text,date,date) to authenticated;

-- Keep the customer portal projection aligned when an existing planner order
-- is corrected to another customer. Completion already remains terminal via
-- planner_recovery.guard_archived_order().
create or replace function public.portal_sync_order_trigger()
returns trigger language plpgsql security definer
set search_path=public,pg_temp
as $$
declare v_customer text;v_portal_id uuid;v_existing uuid;v_portal_order text;v_qty numeric;
begin
 v_customer:=new.data->>'customerId';
 if v_customer is null or not exists(select 1 from public.portal_customers where customer_id=v_customer) then return new; end if;
 v_portal_order:=new.data->>'portalOrderId';
 if v_portal_order is not null then
  begin v_portal_id:=v_portal_order::uuid; exception when others then v_portal_id:=null; end;
 end if;
 if v_portal_id is not null and exists(select 1 from public.portal_orders where id=v_portal_id and customer_id=v_customer) then
  update public.portal_orders set customer_id=v_customer,status=case when new.deleted then 'cancelled' when new.status='completed' or new.active=false then 'completed' else coalesce(nullif(new.status,''),'processing') end,confirmed_delivery_date=coalesce(nullif(new.data->>'communicatedDeadline','')::date,new.deadline),internal_order_ids=array(select distinct x from unnest(internal_order_ids||array[new.order_id]) x),updated_at=now() where id=v_portal_id;
  return new;
 end if;
 select id into v_existing from public.portal_orders where source_order_id=new.order_id;
 if v_existing is null then
  insert into public.portal_orders(customer_id,source_order_id,internal_order_ids,order_no,customer_reference,status,requested_delivery_date,confirmed_delivery_date,notes,created_at,updated_at)
  values(v_customer,new.order_id,array[new.order_id],coalesce(nullif(new.order_no,''),'ORD-'||new.order_id),nullif(new.data->>'customerReference',''),case when new.deleted then 'cancelled' when new.status='completed' or new.active=false then 'completed' else coalesce(nullif(new.status,''),'processing') end,coalesce(nullif(new.data->>'requestedDeliveryDate','')::date,nullif(new.data->>'customerReadyDate','')::date,new.deadline),coalesce(nullif(new.data->>'communicatedDeadline','')::date,new.deadline),nullif(new.data->>'deliveryNote',''),coalesce(nullif(new.data->>'created','')::timestamptz,now()),now()) returning id into v_existing;
 else
  update public.portal_orders set customer_id=v_customer,order_no=coalesce(nullif(new.order_no,''),order_no),customer_reference=coalesce(nullif(new.data->>'customerReference',''),customer_reference),status=case when new.deleted then 'cancelled' when new.status='completed' or new.active=false then 'completed' else coalesce(nullif(new.status,''),'processing') end,requested_delivery_date=coalesce(nullif(new.data->>'requestedDeliveryDate','')::date,nullif(new.data->>'customerReadyDate','')::date,new.deadline,requested_delivery_date),confirmed_delivery_date=coalesce(nullif(new.data->>'communicatedDeadline','')::date,new.deadline,confirmed_delivery_date),updated_at=now() where id=v_existing;
 end if;
 delete from public.portal_order_lines where order_id=v_existing;
 v_qty:=coalesce(nullif(new.data->>'qty','')::numeric,0);
 if v_qty>0 then
  insert into public.portal_order_lines(order_id,line_no,source_template_id,description,quantity,unit,unit_price,line_total)
  values(v_existing,1,new.data->>'productTemplateId',coalesce(nullif(new.data->>'product',''),'Product'),v_qty,'stuks',nullif(new.data->>'saleUnit','')::numeric,nullif(new.data->>'totalSale','')::numeric);
 end if;
 return new;
exception when invalid_text_representation or datetime_field_overflow then return new;
end $$;

revoke execute on function public.portal_sync_order_trigger() from public, anon, authenticated;

commit;

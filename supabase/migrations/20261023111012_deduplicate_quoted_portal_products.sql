-- Resolve legacy name-only quotations to the same product as newer template-linked quotations.
begin;
create or replace function portal_private.sync_quote_products(p_quotes jsonb)
returns void language plpgsql security invoker set search_path='' as $$
declare r record;q jsonb;p public.portal_products%rowtype;tiers jsonb;base_qty numeric;base_price numeric;factor numeric;fingerprint text;template text;
begin
 for r in
  with source as (
   select src.q,src.n,coalesce(nullif(src.q->>'productTemplateId',''),nullif(src.q->>'templateId','')) template
   from jsonb_array_elements(coalesce(p_quotes,'[]')) with ordinality src(q,n)
   where coalesce(src.q->>'customerId','')<>'' and coalesce(btrim(src.q->>'name'),'')<>''
    and coalesce(src.q->>'deleted','false')<>'true' and coalesce(src.q->>'isTestOrder',src.q->>'testOrder','false')<>'true'
  ), identified as (
   select a.q,a.n,coalesce(a.template,(select b.template from source b where b.template is not null
     and b.q->>'customerId'=a.q->>'customerId' and lower(btrim(b.q->>'name'))=lower(btrim(a.q->>'name'))
     order by coalesce(b.q->>'updatedAt',b.q->>'quoteDraftAt',b.q->>'created','') desc,b.n desc limit 1),lower(btrim(a.q->>'name'))) product_key
   from source a
  )
  select distinct on (src.q->>'customerId',product_key) src.q as quote_data
  from identified src order by src.q->>'customerId',product_key,
   coalesce(src.q->>'updatedAt',src.q->>'quoteDraftAt',src.q->>'created','') desc,src.n desc

 loop
  q:=r.quote_data;
  if not exists(select 1 from public.portal_customers where customer_id=q->>'customerId' and active) then continue;end if;
  begin
   factor:=1+coalesce(nullif(q->>'adjustmentPct','')::numeric,0)/100;
   base_price:=nullif(q->>'saleUnit','')::numeric*factor;
   base_qty:=greatest(1,coalesce(nullif(q->>'qty','')::numeric,1));
   if base_price is null or base_price<=0 or base_price::text in ('NaN','Infinity','-Infinity') or factor<0 then continue;end if;
   select coalesce(jsonb_agg(jsonb_build_object('qty',qty,'unit_price',price) order by qty),'[]') into tiers from(
    select distinct on(qty) qty,price from(
     select (t->>'qty')::numeric qty,round((t->>'saleUnit')::numeric*factor,2) price
     from jsonb_array_elements(case when coalesce(q->>'includeTierPricing','false')='true' then case when jsonb_typeof(q->'priceTiers')='array' then q->'priceTiers' else '[]'::jsonb end else '[]'::jsonb end) t
     where coalesce(q->'tierVisibility'->>(t->>'qty'),'true')<>'false'
     union all select base_qty,round(base_price,2)
    ) visible where qty>0 and price>0 and qty::text not in ('NaN','Infinity','-Infinity') and price::text not in ('NaN','Infinity','-Infinity') order by qty,price
   ) valid;
   template:=coalesce(nullif(q->>'productTemplateId',''),nullif(q->>'templateId',''));
   fingerprint:=md5(jsonb_build_object('name',q->>'name','description',coalesce(q->>'customerDescription',q->>'description',''),'unit',coalesce(q->>'unit','stuks'),'tiers',tiers,'price',round(base_price,2),'source',q->>'id')::text);
   select * into p from public.portal_products where customer_id=q->>'customerId'
    and ((template is not null and source_template_id=template) or ((template is null or source_template_id is null) and lower(btrim(name))=lower(btrim(q->>'name'))))
    order by (source_template_id=template) desc nulls last,created_at limit 1 for update;
   if found then
    if p.quote_source_fingerprint is distinct from fingerprint then
     update public.portal_products set name=q->>'name',description=coalesce(q->>'customerDescription',q->>'description',''),
      source_template_id=coalesce(source_template_id,template),unit=coalesce(nullif(q->>'unit',''),'stuks'),unit_price=round(base_price,2),
      minimum_quantity=(select min((x->>'qty')::numeric) from jsonb_array_elements(tiers) x),price_tiers=tiers,
      quote_source_line_id=q->>'id',quote_source_no=coalesce(q->>'quoteNo',q->>'orderNo'),quote_source_fingerprint=fingerprint,updated_at=now() where id=p.id;
    end if;
   else
    insert into public.portal_products(customer_id,source_template_id,name,description,unit,unit_price,minimum_quantity,price_tiers,quote_source_line_id,quote_source_no,quote_source_fingerprint)
    values(q->>'customerId',template,q->>'name',coalesce(q->>'customerDescription',q->>'description',''),coalesce(nullif(q->>'unit',''),'stuks'),round(base_price,2),
     (select min((x->>'qty')::numeric) from jsonb_array_elements(tiers) x),tiers,q->>'id',coalesce(q->>'quoteNo',q->>'orderNo'),fingerprint);
   end if;
  exception when invalid_text_representation or numeric_value_out_of_range then
   -- A malformed legacy quotation must not stop unrelated planner saves.
   continue;
  end;
 end loop;
end $$;
revoke all on function portal_private.sync_quote_products(jsonb) from public,anon,authenticated;

select portal_private.sync_quote_products(data->'quotes') from public.planner_shared_state where workspace_id='ralabaster';
commit;

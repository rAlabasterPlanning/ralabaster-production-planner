begin;
alter table public.portal_products add column if not exists price_tiers jsonb not null default '[]'::jsonb,
 add column if not exists quote_source_line_id text,add column if not exists quote_source_no text,
 add column if not exists quote_source_fingerprint text;
alter table public.portal_products add constraint portal_products_tiers_array check(jsonb_typeof(price_tiers)='array');

-- Only customer-facing quote values enter the portal: no costing, margins or internal notes.
create or replace function portal_private.sync_quote_products(p_quotes jsonb)
returns void language plpgsql security invoker set search_path='' as $$
declare r record;q jsonb;p public.portal_products%rowtype;tiers jsonb;base_qty numeric;base_price numeric;factor numeric;fingerprint text;template text;
begin
 for r in
  select distinct on (src.q->>'customerId',coalesce(nullif(src.q->>'productTemplateId',''),nullif(src.q->>'templateId',''),lower(btrim(src.q->>'name')))) src.q as quote_data
  from jsonb_array_elements(coalesce(p_quotes,'[]')) with ordinality as src(q,n)
  where coalesce(src.q->>'customerId','')<>'' and coalesce(btrim(src.q->>'name'),'')<>''
   and coalesce(src.q->>'deleted','false')<>'true' and coalesce(src.q->>'isTestOrder',src.q->>'testOrder','false')<>'true'
  order by src.q->>'customerId',coalesce(nullif(src.q->>'productTemplateId',''),nullif(src.q->>'templateId',''),lower(btrim(src.q->>'name'))),
   coalesce(src.q->>'updatedAt',src.q->>'quoteDraftAt',src.q->>'created','') desc,n desc
 loop
  q:=r.quote_data;
  if not exists(select 1 from public.portal_customers where customer_id=q->>'customerId' and active) then continue;end if;
  begin
   factor:=1+coalesce(nullif(q->>'adjustmentPct','')::numeric,0)/100;
   base_price:=nullif(q->>'saleUnit','')::numeric*factor;
   base_qty:=greatest(1,coalesce(nullif(q->>'qty','')::numeric,1));
   if base_price is null or base_price<0 or base_price::text in ('NaN','Infinity','-Infinity') or factor<0 then continue;end if;
   select coalesce(jsonb_agg(jsonb_build_object('qty',qty,'unit_price',price) order by qty),'[]') into tiers from(
    select distinct on(qty) qty,price from(
     select (t->>'qty')::numeric qty,round((t->>'saleUnit')::numeric*factor,2) price
     from jsonb_array_elements(case when coalesce(q->>'includeTierPricing','false')='true' then case when jsonb_typeof(q->'priceTiers')='array' then q->'priceTiers' else '[]'::jsonb end else '[]'::jsonb end) t
     where coalesce(q->'tierVisibility'->>(t->>'qty'),'true')<>'false'
     union all select base_qty,round(base_price,2)
    ) visible where qty>0 and price>=0 and qty::text not in ('NaN','Infinity','-Infinity') and price::text not in ('NaN','Infinity','-Infinity') order by qty,price
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
create or replace function portal_private.sync_quote_products_trigger()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.workspace_id='ralabaster' and (tg_op='INSERT' or new.data->'quotes' is distinct from old.data->'quotes') then
  perform portal_private.sync_quote_products(new.data->'quotes');
 end if;
 return new;
end $$;
revoke all on function portal_private.sync_quote_products_trigger() from public,anon,authenticated;
create trigger portal_sync_quote_products_v1 after insert or update of data on public.planner_shared_state for each row execute function portal_private.sync_quote_products_trigger();
-- Backfill from saved quotes without editing any quotations, orders or production tasks.
select portal_private.sync_quote_products(data->'quotes') from public.planner_shared_state where workspace_id='ralabaster';
create or replace function public.portal_place_order(p_customer_reference text,p_requested_delivery_date date,p_notes text,p_lines jsonb)
returns uuid language plpgsql security definer
set search_path=public,pg_temp
as $$
declare v_uid uuid:=(select auth.uid());v_customer text;v_order uuid:=gen_random_uuid();v_no text;v_line jsonb;v_product public.portal_products%rowtype;v_i integer:=0;v_qty numeric;v_price numeric;
begin
 if v_uid is null then raise exception 'Aanmelding vereist.' using errcode='42501'; end if;
 select customer_id into v_customer from public.portal_customer_users where user_id=v_uid and active;
 if v_customer is null then raise exception 'Geen actief klantaccount.' using errcode='42501'; end if;
 if jsonb_typeof(p_lines)<>'array' or jsonb_array_length(p_lines)=0 then raise exception 'Voeg minimaal één product toe.'; end if;
 v_no:='WEB-'||to_char(now(),'YYYYMMDD')||'-'||upper(substr(replace(v_order::text,'-',''),1,6));
 insert into public.portal_orders(id,customer_id,order_no,customer_reference,status,requested_delivery_date,notes,created_by)
 values(v_order,v_customer,v_no,nullif(trim(p_customer_reference),''),'submitted',p_requested_delivery_date,nullif(trim(p_notes),''),v_uid);
 for v_line in select value from jsonb_array_elements(p_lines) loop
  v_i:=v_i+1;v_qty:=(v_line->>'quantity')::numeric;
  if v_qty is null or v_qty<=0 or v_qty>1000000000 or v_qty::text in ('NaN','Infinity','-Infinity') then raise exception 'Ongeldig aantal.';end if;
  select * into v_product from public.portal_products where id=(v_line->>'product_id')::uuid and customer_id=v_customer and active;
  if v_product.id is null then raise exception 'Product is niet beschikbaar voor deze klant.' using errcode='42501'; end if;
  if v_qty<v_product.minimum_quantity then raise exception 'Minimumaantal voor % is %.',v_product.name,v_product.minimum_quantity; end if;
  select (t->>'unit_price')::numeric into v_price from jsonb_array_elements(v_product.price_tiers) t where (t->>'qty')::numeric<=v_qty order by (t->>'qty')::numeric desc limit 1;
  v_price:=coalesce(v_price,v_product.unit_price);
  insert into public.portal_order_lines(order_id,line_no,product_id,source_template_id,description,quantity,unit,unit_price,line_total)
  values(v_order,v_i,v_product.id,v_product.source_template_id,v_product.name,v_qty,v_product.unit,v_price,case when v_price is null then null else v_price*v_qty end);
 end loop;
 return v_order;
end $$;


commit;

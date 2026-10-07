-- Keep the portal metadata sync compatible with Supabase's safe-update guard.
-- The trigger intentionally rebuilds quote totals, but every UPDATE must still
-- include an explicit predicate.
create or replace function public.portal_sync_metadata_trigger()
returns trigger language plpgsql security definer
set search_path=public,pg_temp
as $$
declare c jsonb;q jsonb;v_quote uuid;v_customer text;v_status text;
begin
 if new.workspace_id<>'ralabaster' then return new; end if;
 for c in select value from jsonb_array_elements(coalesce(new.data->'customers','[]'::jsonb)) loop
  if coalesce(c->>'id','')<>'' and coalesce(c->>'name','')<>'' and coalesce(c->>'relationshipType','customer')<>'prospect' then
   insert into public.portal_customers(customer_id,company_name,contact_name,email,active,updated_at)
   values(c->>'id',c->>'name',nullif(c->>'contact',''),nullif(c->>'email',''),not coalesce((c->>'deleted')::boolean,false),now())
   on conflict(customer_id) do update set company_name=excluded.company_name,contact_name=excluded.contact_name,email=excluded.email,active=excluded.active,updated_at=now();
  end if;
 end loop;
 delete from public.portal_quote_lines where quote_id in (select id from public.portal_quotes);
 update public.portal_quotes set total=0,updated_at=now()
  where id in (select id from public.portal_quotes);
 for q in select value from jsonb_array_elements(coalesce(new.data->'quotes','[]'::jsonb)) loop
  v_customer:=q->>'customerId';v_status:=lower(coalesce(q->>'status','concept'));
  if v_customer is null or not exists(select 1 from public.portal_customers where customer_id=v_customer) or (not(q ? 'sentAt') and v_status='concept') then continue; end if;
  insert into public.portal_quotes(customer_id,source_quote_no,quote_no,project,status,valid_until,estimated_delivery_date,total,notes,created_at,updated_at)
  values(v_customer,coalesce(q->>'quoteNo',q->>'orderNo',q->>'id'),coalesce(q->>'quoteNo',q->>'orderNo',q->>'id'),nullif(q->>'project',''),v_status,nullif(q->>'validUntil','')::date,coalesce(nullif(q->>'communicatedDate','')::date,nullif(q->>'estimatedReadyDate','')::date),coalesce(nullif(q->>'total','')::numeric,0),nullif(q->>'quoteNote',''),coalesce(nullif(q->>'created','')::timestamptz,now()),now())
  on conflict(customer_id,source_quote_no) do update set project=excluded.project,status=case when public.portal_quotes.status like 'customer_%' then public.portal_quotes.status else excluded.status end,valid_until=excluded.valid_until,estimated_delivery_date=excluded.estimated_delivery_date,total=coalesce(public.portal_quotes.total,0)+excluded.total,notes=excluded.notes,updated_at=now()
  returning id into v_quote;
  insert into public.portal_quote_lines(quote_id,line_no,description,quantity,unit,unit_price,line_total)
  values(v_quote,coalesce(nullif(q->>'lineNo','')::integer,1),coalesce(nullif(q->>'name',''),'Product'),coalesce(nullif(q->>'qty','')::numeric,0),'stuks',nullif(q->>'saleUnit','')::numeric,nullif(q->>'total','')::numeric)
  on conflict(quote_id,line_no) do update set description=excluded.description,quantity=excluded.quantity,unit_price=excluded.unit_price,line_total=excluded.line_total;
 end loop;
 return new;
exception when invalid_text_representation or datetime_field_overflow then return new;
end $$;

-- A quote is visible by default; a manual opt-out is independent of status.
alter table public.portal_quotes add column if not exists hidden_from_customer boolean not null default false;

-- Include manually created quotes regardless of status or email delivery metadata.
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
  if v_customer is null or not exists(select 1 from public.portal_customers where customer_id=v_customer)  then continue; end if;
  -- Portal request placeholders are requests, not completed quotations.
  if coalesce(q->>'sourceRequest','') like 'portal:%' and coalesce(q->>'quoteNo','') like 'AAN-%' then continue; end if;
  insert into public.portal_quotes(customer_id,source_quote_no,quote_no,project,status,valid_until,estimated_delivery_date,total,notes,created_at,updated_at,hidden_from_customer)
  values(v_customer,coalesce(q->>'quoteNo',q->>'orderNo',q->>'id'),coalesce(q->>'quoteNo',q->>'orderNo',q->>'id'),nullif(q->>'project',''),v_status,nullif(q->>'validUntil','')::date,coalesce(nullif(q->>'communicatedDate','')::date,nullif(q->>'estimatedReadyDate','')::date),coalesce(nullif(q->>'total','')::numeric,0),nullif(q->>'quoteNote',''),coalesce(nullif(q->>'created','')::timestamptz,now()),now(),exists(select 1 from jsonb_array_elements(coalesce(new.data->'quotes','[]')) g where g->>'customerId'=v_customer and coalesce(g->>'quoteNo',g->>'orderNo',g->>'id')=coalesce(q->>'quoteNo',q->>'orderNo',q->>'id') and g->'portalVisible'='false'::jsonb))
  on conflict(customer_id,source_quote_no) do update set hidden_from_customer=excluded.hidden_from_customer,project=excluded.project,status=case when public.portal_quotes.status like 'customer_%' then public.portal_quotes.status else excluded.status end,valid_until=excluded.valid_until,estimated_delivery_date=excluded.estimated_delivery_date,total=coalesce(public.portal_quotes.total,0)+excluded.total,notes=excluded.notes,updated_at=now()
  returning id into v_quote;
  insert into public.portal_quote_lines(quote_id,line_no,description,quantity,unit,unit_price,line_total)
  values(v_quote,coalesce(nullif(q->>'lineNo','')::integer,1),coalesce(nullif(q->>'name',''),'Product'),coalesce(nullif(q->>'qty','')::numeric,0),'stuks',nullif(q->>'saleUnit','')::numeric,nullif(q->>'total','')::numeric)
  on conflict(quote_id,line_no) do update set description=excluded.description,quantity=excluded.quantity,unit_price=excluded.unit_price,line_total=excluded.line_total;
 end loop;
 return new;
exception when invalid_text_representation or datetime_field_overflow then return new;
end $$;

revoke execute on function public.portal_sync_metadata_trigger() from public,anon,authenticated;

alter policy portal_quotes_read on public.portal_quotes
 using (public.portal_is_admin() or (customer_id=public.portal_current_customer_id() and not hidden_from_customer));
alter policy portal_quote_lines_read on public.portal_quote_lines
 using (public.portal_is_admin() or exists(select 1 from public.portal_quotes q
 where q.id=quote_id and q.customer_id=public.portal_current_customer_id() and not q.hidden_from_customer));

-- Admin-only, customer-scoped and atomic across every product in a quotation.
create or replace function public.portal_set_quote_visibility(p_customer_id text,p_quote_no text,p_visible boolean)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare meta jsonb; lines jsonb;
begin
 if auth.uid() is null or not public.portal_is_admin() then raise exception 'Alleen een plannerbeheerder mag offertes tonen of verbergen.' using errcode='42501'; end if;
 if p_visible is null or nullif(p_customer_id,'') is null or nullif(p_quote_no,'') is null then raise exception 'Klant, offerte en zichtbaarheid zijn verplicht.'; end if;
 select data into meta from public.planner_shared_state where workspace_id='ralabaster' for update;
 if not exists(select 1 from jsonb_array_elements(meta->'quotes') q
 where q->>'customerId'=p_customer_id and coalesce(q->>'quoteNo',q->>'orderNo',q->>'id')=p_quote_no) then raise exception 'Offerte niet gevonden bij deze klant.'; end if;
 select jsonb_agg(case when q->>'customerId'=p_customer_id and coalesce(q->>'quoteNo',q->>'orderNo',q->>'id')=p_quote_no
 then q||jsonb_build_object('portalVisible',p_visible) else q end order by n) into lines
 from jsonb_array_elements(meta->'quotes') with ordinality a(q,n);
 update public.planner_shared_state set data=jsonb_set(data,'{quotes}',lines),updated_at=now() where workspace_id='ralabaster';
 if not exists(select 1 from public.portal_quotes where customer_id=p_customer_id and source_quote_no=p_quote_no and hidden_from_customer=not p_visible) then raise exception 'Portaalzichtbaarheid kon niet worden bevestigd.'; end if;
 return jsonb_build_object('customerId',p_customer_id,'quoteNo',p_quote_no,'visible',p_visible);
end $$;
revoke all on function public.portal_set_quote_visibility(text,text,boolean) from public,anon;
grant execute on function public.portal_set_quote_visibility(text,text,boolean) to authenticated;

-- The decision endpoint must also reject a hidden quote when its UUID is known.
create or replace function public.portal_quote_decision(p_quote_id uuid,p_decision text)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare v_customer text;
begin
 if (select auth.uid()) is null then raise exception 'Aanmelding vereist.' using errcode='42501'; end if;
 select customer_id into v_customer from public.portal_customer_users where user_id=(select auth.uid()) and active;
 if lower(p_decision) not in ('accepted','declined') then raise exception 'Ongeldige keuze.'; end if;
 update public.portal_quotes set status='customer_'||lower(p_decision),updated_at=now()
 where id=p_quote_id and customer_id=v_customer and not hidden_from_customer;
 return found;
end $$;
revoke execute on function public.portal_quote_decision(uuid,text) from public,anon;
grant execute on function public.portal_quote_decision(uuid,text) to authenticated;

create temporary table portal_visibility_backfill(workspace_id text,data jsonb) on commit drop;
create trigger portal_visibility_backfill_sync after insert on portal_visibility_backfill
 for each row execute function public.portal_sync_metadata_trigger();
insert into portal_visibility_backfill select workspace_id,data from public.planner_shared_state where workspace_id='ralabaster' for update;
drop table portal_visibility_backfill;

-- Manual invoice bookkeeping is internal and never changes production status.
create or replace function public.planner_set_invoice_sent(p_order_id text,p_sent boolean)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare saved jsonb;
begin
 if auth.uid() is null or not public.portal_is_admin() then raise exception 'Alleen een plannerbeheerder mag factuurverzending registreren.' using errcode='42501'; end if;
 if p_sent is null then raise exception 'Factuurstatus is verplicht.'; end if;
 update public.planner_orders_v2 set data=data||jsonb_build_object('invoiceSent',p_sent,'invoiceSentAt',case when p_sent then coalesce(nullif(data->>'invoiceSentAt',''),now()::text) else null end,'invoiceStatusUpdatedAt',now()),updated_at=now()
 where workspace_id='ralabaster' and order_id=p_order_id and not deleted and (not active or status='completed') returning data into saved;
 if saved is null then raise exception 'Afgeronde order niet gevonden.'; end if;
 return saved;
end $$;
revoke all on function public.planner_set_invoice_sent(text,boolean) from public,anon;
grant execute on function public.planner_set_invoice_sent(text,boolean) to authenticated;

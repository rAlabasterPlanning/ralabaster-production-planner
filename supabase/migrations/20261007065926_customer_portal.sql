begin;

create extension if not exists pgcrypto;

create table if not exists public.portal_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

insert into public.portal_admins(user_id)
select id from auth.users where lower(email) in ('info@ralabaster.com','info@designlinck.com')
on conflict do nothing;

create table if not exists public.portal_customers (
  customer_id text primary key,
  company_name text not null,
  contact_name text,
  email text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.portal_customer_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  customer_id text not null references public.portal_customers(customer_id) on delete cascade,
  email text not null,
  contact_name text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists portal_customer_users_customer_idx on public.portal_customer_users(customer_id);

create table if not exists public.portal_products (
  id uuid primary key default gen_random_uuid(),
  customer_id text not null references public.portal_customers(customer_id) on delete cascade,
  source_template_id text,
  name text not null,
  customer_sku text,
  description text,
  unit text not null default 'stuks',
  unit_price numeric(14,2),
  minimum_quantity numeric(14,3) not null default 1 check (minimum_quantity > 0),
  image_url text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(customer_id,source_template_id)
);
create index if not exists portal_products_customer_idx on public.portal_products(customer_id,active);

create table if not exists public.portal_orders (
  id uuid primary key default gen_random_uuid(),
  customer_id text not null references public.portal_customers(customer_id) on delete cascade,
  source_order_id text unique,
  internal_order_ids text[] not null default '{}',
  order_no text not null,
  customer_reference text,
  status text not null default 'submitted',
  requested_delivery_date date,
  confirmed_delivery_date date,
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists portal_orders_customer_idx on public.portal_orders(customer_id,created_at desc);

create table if not exists public.portal_order_lines (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.portal_orders(id) on delete cascade,
  line_no integer not null,
  product_id uuid references public.portal_products(id) on delete set null,
  source_template_id text,
  description text not null,
  quantity numeric(14,3) not null check (quantity > 0),
  unit text not null default 'stuks',
  unit_price numeric(14,2),
  line_total numeric(14,2),
  created_at timestamptz not null default now(),
  unique(order_id,line_no)
);
create index if not exists portal_order_lines_order_idx on public.portal_order_lines(order_id);

create table if not exists public.portal_quotes (
  id uuid primary key default gen_random_uuid(),
  customer_id text not null references public.portal_customers(customer_id) on delete cascade,
  source_quote_no text not null,
  quote_no text not null,
  project text,
  status text not null default 'sent',
  valid_until date,
  estimated_delivery_date date,
  total numeric(14,2),
  currency text not null default 'EUR',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(customer_id,source_quote_no)
);
create index if not exists portal_quotes_customer_idx on public.portal_quotes(customer_id,created_at desc);

create table if not exists public.portal_quote_lines (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references public.portal_quotes(id) on delete cascade,
  line_no integer not null,
  description text not null,
  quantity numeric(14,3) not null,
  unit text not null default 'stuks',
  unit_price numeric(14,2),
  line_total numeric(14,2),
  created_at timestamptz not null default now(),
  unique(quote_id,line_no)
);

create table if not exists public.portal_product_requests (
  id uuid primary key default gen_random_uuid(),
  customer_id text not null references public.portal_customers(customer_id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete restrict,
  product_name text not null,
  description text not null,
  dimensions text,
  material text,
  quantity numeric(14,3),
  unit text not null default 'stuks',
  requested_delivery_date date,
  attachment_path text,
  status text not null default 'new',
  customer_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists portal_product_requests_customer_idx on public.portal_product_requests(customer_id,created_at desc);

create or replace function public.portal_is_admin()
returns boolean language sql stable security definer
set search_path=public,pg_temp
as $$ select (select auth.uid()) is not null and exists(select 1 from public.portal_admins a where a.user_id=(select auth.uid())) $$;

create or replace function public.portal_current_customer_id()
returns text language sql stable security definer
set search_path=public,pg_temp
as $$ select customer_id from public.portal_customer_users where user_id=(select auth.uid()) and active limit 1 $$;

revoke all on function public.portal_is_admin() from public,anon;
revoke all on function public.portal_current_customer_id() from public,anon;
grant execute on function public.portal_is_admin() to authenticated;
grant execute on function public.portal_current_customer_id() to authenticated;

alter table public.portal_admins enable row level security;
alter table public.portal_customers enable row level security;
alter table public.portal_customer_users enable row level security;
alter table public.portal_products enable row level security;
alter table public.portal_orders enable row level security;
alter table public.portal_order_lines enable row level security;
alter table public.portal_quotes enable row level security;
alter table public.portal_quote_lines enable row level security;
alter table public.portal_product_requests enable row level security;

create policy portal_admins_admin_select on public.portal_admins for select to authenticated using (public.portal_is_admin());
create policy portal_customers_read on public.portal_customers for select to authenticated using (public.portal_is_admin() or customer_id=public.portal_current_customer_id());
create policy portal_customers_admin_write on public.portal_customers for all to authenticated using (public.portal_is_admin()) with check (public.portal_is_admin());
create policy portal_users_read on public.portal_customer_users for select to authenticated using (public.portal_is_admin() or user_id=(select auth.uid()));
create policy portal_users_admin_write on public.portal_customer_users for all to authenticated using (public.portal_is_admin()) with check (public.portal_is_admin());
create policy portal_products_read on public.portal_products for select to authenticated using (public.portal_is_admin() or customer_id=public.portal_current_customer_id());
create policy portal_products_admin_write on public.portal_products for all to authenticated using (public.portal_is_admin()) with check (public.portal_is_admin());
create policy portal_orders_read on public.portal_orders for select to authenticated using (public.portal_is_admin() or customer_id=public.portal_current_customer_id());
create policy portal_orders_admin_write on public.portal_orders for all to authenticated using (public.portal_is_admin()) with check (public.portal_is_admin());
create policy portal_order_lines_read on public.portal_order_lines for select to authenticated using (public.portal_is_admin() or exists(select 1 from public.portal_orders o where o.id=order_id and o.customer_id=public.portal_current_customer_id()));
create policy portal_order_lines_admin_write on public.portal_order_lines for all to authenticated using (public.portal_is_admin()) with check (public.portal_is_admin());
create policy portal_quotes_read on public.portal_quotes for select to authenticated using (public.portal_is_admin() or customer_id=public.portal_current_customer_id());
create policy portal_quotes_admin_write on public.portal_quotes for all to authenticated using (public.portal_is_admin()) with check (public.portal_is_admin());
create policy portal_quote_lines_read on public.portal_quote_lines for select to authenticated using (public.portal_is_admin() or exists(select 1 from public.portal_quotes q where q.id=quote_id and q.customer_id=public.portal_current_customer_id()));
create policy portal_quote_lines_admin_write on public.portal_quote_lines for all to authenticated using (public.portal_is_admin()) with check (public.portal_is_admin());
create policy portal_requests_read on public.portal_product_requests for select to authenticated using (public.portal_is_admin() or customer_id=public.portal_current_customer_id());
create policy portal_requests_admin_write on public.portal_product_requests for all to authenticated using (public.portal_is_admin()) with check (public.portal_is_admin());

revoke all on public.portal_admins,public.portal_customers,public.portal_customer_users,public.portal_products,public.portal_orders,public.portal_order_lines,public.portal_quotes,public.portal_quote_lines,public.portal_product_requests from anon;
grant select,insert,update,delete on public.portal_customers,public.portal_customer_users,public.portal_products,public.portal_orders,public.portal_order_lines,public.portal_quotes,public.portal_quote_lines,public.portal_product_requests to authenticated;
grant select on public.portal_admins to authenticated;

create or replace function public.portal_place_order(p_customer_reference text,p_requested_delivery_date date,p_notes text,p_lines jsonb)
returns uuid language plpgsql security definer
set search_path=public,pg_temp
as $$
declare v_uid uuid:=(select auth.uid());v_customer text;v_order uuid:=gen_random_uuid();v_no text;v_line jsonb;v_product public.portal_products%rowtype;v_i integer:=0;v_qty numeric;
begin
 if v_uid is null then raise exception 'Aanmelding vereist.' using errcode='42501'; end if;
 select customer_id into v_customer from public.portal_customer_users where user_id=v_uid and active;
 if v_customer is null then raise exception 'Geen actief klantaccount.' using errcode='42501'; end if;
 if jsonb_typeof(p_lines)<>'array' or jsonb_array_length(p_lines)=0 then raise exception 'Voeg minimaal één product toe.'; end if;
 v_no:='WEB-'||to_char(now(),'YYYYMMDD')||'-'||upper(substr(replace(v_order::text,'-',''),1,6));
 insert into public.portal_orders(id,customer_id,order_no,customer_reference,status,requested_delivery_date,notes,created_by)
 values(v_order,v_customer,v_no,nullif(trim(p_customer_reference),''),'submitted',p_requested_delivery_date,nullif(trim(p_notes),''),v_uid);
 for v_line in select value from jsonb_array_elements(p_lines) loop
  v_i:=v_i+1;v_qty:=greatest(0,(v_line->>'quantity')::numeric);
  select * into v_product from public.portal_products where id=(v_line->>'product_id')::uuid and customer_id=v_customer and active;
  if v_product.id is null then raise exception 'Product is niet beschikbaar voor deze klant.' using errcode='42501'; end if;
  if v_qty<v_product.minimum_quantity then raise exception 'Minimumaantal voor % is %.',v_product.name,v_product.minimum_quantity; end if;
  insert into public.portal_order_lines(order_id,line_no,product_id,source_template_id,description,quantity,unit,unit_price,line_total)
  values(v_order,v_i,v_product.id,v_product.source_template_id,v_product.name,v_qty,v_product.unit,v_product.unit_price,case when v_product.unit_price is null then null else v_product.unit_price*v_qty end);
 end loop;
 return v_order;
end $$;

create or replace function public.portal_request_product(p_product_name text,p_description text,p_dimensions text,p_material text,p_quantity numeric,p_unit text,p_requested_delivery_date date,p_attachment_path text)
returns uuid language plpgsql security definer
set search_path=public,pg_temp
as $$
declare v_uid uuid:=(select auth.uid());v_customer text;v_id uuid:=gen_random_uuid();
begin
 if v_uid is null then raise exception 'Aanmelding vereist.' using errcode='42501'; end if;
 select customer_id into v_customer from public.portal_customer_users where user_id=v_uid and active;
 if v_customer is null then raise exception 'Geen actief klantaccount.' using errcode='42501'; end if;
 if length(trim(coalesce(p_product_name,'')))<2 or length(trim(coalesce(p_description,'')))<5 then raise exception 'Naam en omschrijving zijn verplicht.'; end if;
 insert into public.portal_product_requests(id,customer_id,created_by,product_name,description,dimensions,material,quantity,unit,requested_delivery_date,attachment_path)
 values(v_id,v_customer,v_uid,trim(p_product_name),trim(p_description),nullif(trim(p_dimensions),''),nullif(trim(p_material),''),p_quantity,coalesce(nullif(trim(p_unit),''),'stuks'),p_requested_delivery_date,nullif(trim(p_attachment_path),''));
 return v_id;
end $$;

create or replace function public.portal_quote_decision(p_quote_id uuid,p_decision text)
returns boolean language plpgsql security definer
set search_path=public,pg_temp
as $$
declare v_customer text;
begin
 if (select auth.uid()) is null then raise exception 'Aanmelding vereist.' using errcode='42501'; end if;
 select customer_id into v_customer from public.portal_customer_users where user_id=(select auth.uid()) and active;
 if lower(p_decision) not in ('accepted','declined') then raise exception 'Ongeldige keuze.'; end if;
 update public.portal_quotes set status='customer_'||lower(p_decision),updated_at=now() where id=p_quote_id and customer_id=v_customer;
 return found;
end $$;

revoke all on function public.portal_place_order(text,date,text,jsonb) from public,anon;
revoke all on function public.portal_request_product(text,text,text,text,numeric,text,date,text) from public,anon;
revoke all on function public.portal_quote_decision(uuid,text) from public,anon;
grant execute on function public.portal_place_order(text,date,text,jsonb) to authenticated;
grant execute on function public.portal_request_product(text,text,text,text,numeric,text,date,text) to authenticated;
grant execute on function public.portal_quote_decision(uuid,text) to authenticated;

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
  update public.portal_orders set status=case when new.deleted then 'cancelled' when new.status='completed' or new.active=false then 'completed' else coalesce(nullif(new.status,''),'processing') end,confirmed_delivery_date=coalesce(nullif(new.data->>'communicatedDeadline','')::date,new.deadline),internal_order_ids=array(select distinct x from unnest(internal_order_ids||array[new.order_id]) x),updated_at=now() where id=v_portal_id;
  return new;
 end if;
 select id into v_existing from public.portal_orders where source_order_id=new.order_id;
 if v_existing is null then
  insert into public.portal_orders(customer_id,source_order_id,internal_order_ids,order_no,customer_reference,status,requested_delivery_date,confirmed_delivery_date,notes,created_at,updated_at)
  values(v_customer,new.order_id,array[new.order_id],coalesce(nullif(new.order_no,''),'ORD-'||new.order_id),nullif(new.data->>'customerReference',''),case when new.deleted then 'cancelled' when new.status='completed' or new.active=false then 'completed' else coalesce(nullif(new.status,''),'processing') end,new.deadline,coalesce(nullif(new.data->>'communicatedDeadline','')::date,new.deadline),nullif(new.data->>'deliveryNote',''),coalesce(nullif(new.data->>'created','')::timestamptz,now()),now()) returning id into v_existing;
 else
  update public.portal_orders set order_no=coalesce(nullif(new.order_no,''),order_no),customer_reference=coalesce(nullif(new.data->>'customerReference',''),customer_reference),status=case when new.deleted then 'cancelled' when new.status='completed' or new.active=false then 'completed' else coalesce(nullif(new.status,''),'processing') end,requested_delivery_date=coalesce(new.deadline,requested_delivery_date),confirmed_delivery_date=coalesce(nullif(new.data->>'communicatedDeadline','')::date,new.deadline,confirmed_delivery_date),updated_at=now() where id=v_existing;
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

drop trigger if exists portal_sync_order_v1 on public.planner_orders_v2;
create trigger portal_sync_order_v1 after insert or update on public.planner_orders_v2 for each row execute function public.portal_sync_order_trigger();

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
 update public.portal_quotes set total=0,updated_at=now();
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

drop trigger if exists portal_sync_metadata_v1 on public.planner_shared_state;
create trigger portal_sync_metadata_v1 after insert or update on public.planner_shared_state for each row execute function public.portal_sync_metadata_trigger();

create or replace function public.portal_admin_guard()
returns trigger language plpgsql security invoker
set search_path=public,pg_temp
as $$ begin if (select auth.uid()) is not null and not public.portal_is_admin() then raise exception 'Alleen plannerbeheerders hebben toegang.' using errcode='42501'; end if;return coalesce(new,old);end $$;

drop trigger if exists planner_orders_admin_guard on public.planner_orders_v2;
drop trigger if exists planner_tasks_admin_guard on public.planner_tasks_v2;
drop trigger if exists planner_shared_admin_guard on public.planner_shared_state;
create trigger planner_orders_admin_guard before insert or update or delete on public.planner_orders_v2 for each row execute function public.portal_admin_guard();
create trigger planner_tasks_admin_guard before insert or update or delete on public.planner_tasks_v2 for each row execute function public.portal_admin_guard();
create trigger planner_shared_admin_guard before insert or update or delete on public.planner_shared_state for each row execute function public.portal_admin_guard();

drop policy if exists "planner orders insert" on public.planner_orders_v2;
drop policy if exists "planner orders select" on public.planner_orders_v2;
drop policy if exists "planner orders update" on public.planner_orders_v2;
create policy planner_orders_admin_select on public.planner_orders_v2 for select to authenticated using (public.portal_is_admin() and workspace_id='ralabaster');
create policy planner_orders_admin_insert on public.planner_orders_v2 for insert to authenticated with check (public.portal_is_admin() and workspace_id='ralabaster');
create policy planner_orders_admin_update on public.planner_orders_v2 for update to authenticated using (public.portal_is_admin() and workspace_id='ralabaster') with check (public.portal_is_admin() and workspace_id='ralabaster');

drop policy if exists "planner tasks insert" on public.planner_tasks_v2;
drop policy if exists "planner tasks select" on public.planner_tasks_v2;
drop policy if exists "planner tasks update" on public.planner_tasks_v2;
create policy planner_tasks_admin_select on public.planner_tasks_v2 for select to authenticated using (public.portal_is_admin() and workspace_id='ralabaster');
create policy planner_tasks_admin_insert on public.planner_tasks_v2 for insert to authenticated with check (public.portal_is_admin() and workspace_id='ralabaster');
create policy planner_tasks_admin_update on public.planner_tasks_v2 for update to authenticated using (public.portal_is_admin() and workspace_id='ralabaster') with check (public.portal_is_admin() and workspace_id='ralabaster');

drop policy if exists "shared planner insert" on public.planner_shared_state;
drop policy if exists "shared planner select" on public.planner_shared_state;
drop policy if exists "shared planner update" on public.planner_shared_state;
create policy planner_shared_admin_select on public.planner_shared_state for select to authenticated using (public.portal_is_admin() and workspace_id='ralabaster');
create policy planner_shared_admin_insert on public.planner_shared_state for insert to authenticated with check (public.portal_is_admin() and workspace_id='ralabaster');
create policy planner_shared_admin_update on public.planner_shared_state for update to authenticated using (public.portal_is_admin() and workspace_id='ralabaster') with check (public.portal_is_admin() and workspace_id='ralabaster');

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('portal-files','portal-files',false,10485760,array['application/pdf','image/jpeg','image/png','image/webp','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/vnd.openxmlformats-officedocument.wordprocessingml.document'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

create policy portal_files_customer_insert on storage.objects for insert to authenticated with check (bucket_id='portal-files' and (storage.foldername(name))[1]=public.portal_current_customer_id());
create policy portal_files_customer_select on storage.objects for select to authenticated using (bucket_id='portal-files' and (public.portal_is_admin() or (storage.foldername(name))[1]=public.portal_current_customer_id()));
create policy portal_files_admin_all on storage.objects for all to authenticated using (bucket_id='portal-files' and public.portal_is_admin()) with check (bucket_id='portal-files' and public.portal_is_admin());

-- Initial safe snapshot for existing customers, sent quotations and orders.
update public.planner_shared_state set updated_at=updated_at where workspace_id='ralabaster';
update public.planner_orders_v2 set updated_at=updated_at where workspace_id='ralabaster';

commit;

begin;
create table public.order_drawings (
 id uuid primary key default gen_random_uuid(),
 order_key text not null check(length(order_key) between 1 and 250),
 order_no text not null,
 customer_id text not null,
 document_id uuid not null references public.portal_product_documents(id) on delete restrict,
 product_id uuid not null references public.portal_products(id) on delete restrict,
 title text not null,
 linked_at timestamptz not null default now(),
 linked_by uuid default auth.uid(),
 released_at timestamptz,
 released_by uuid,
 production_current boolean not null default false,
 unique(order_key,document_id),
 check(not production_current or released_at is not null)
);
create unique index order_drawings_current on public.order_drawings(order_key,product_id,title) where production_current;
create index order_drawings_product on public.order_drawings(product_id);
alter table public.order_drawings enable row level security;
revoke all on public.order_drawings from public,anon,authenticated;
grant select on public.order_drawings to authenticated;
create policy order_drawings_read on public.order_drawings for select to authenticated using(public.portal_is_admin() or customer_id=public.portal_current_customer_id());
create policy historical_document_read on public.portal_product_documents for select to authenticated using(exists(select 1 from public.order_drawings l where l.document_id=portal_product_documents.id and l.customer_id=public.portal_current_customer_id()));
create policy historical_file_read on storage.objects for select to authenticated using(bucket_id='product-documents' and exists(select 1 from public.portal_product_documents d join public.order_drawings l on l.document_id=d.id where d.storage_path=storage.objects.name and l.customer_id=public.portal_current_customer_id()));

create function portal_private.link_order_drawing(p_order_key text,p_document_id uuid,p_release boolean default false)
returns uuid language plpgsql security definer set search_path='' as $$
declare d public.portal_product_documents; p public.portal_products; c text; n text; v_id uuid; v_admin boolean; child record;
begin
 if auth.uid() is null then raise exception 'Aanmelding vereist' using errcode='42501';end if;
 v_admin:=public.portal_is_admin();
 select * into d from public.portal_product_documents where id=p_document_id;
 if not found then raise exception 'Document niet gevonden';end if;
 select * into p from public.portal_products where id=d.product_id for update;
 if left(p_order_key,7)='portal:' then
  select customer_id,order_no into c,n from public.portal_orders where id::text=substr(p_order_key,8) for update;
  if c is null or not exists(select 1 from public.portal_order_lines where order_id::text=substr(p_order_key,8) and (product_id=p.id or source_template_id=p.source_template_id)) then raise exception 'Product hoort niet bij deze order';end if;
 elsif left(p_order_key,8)='planner:' and v_admin then
  select data->>'customerId',coalesce(order_no,order_id) into c,n from public.planner_orders_v2 where workspace_id='ralabaster' and order_id=substr(p_order_key,9) for update;
 else raise exception 'Geen toegang tot deze order' using errcode='42501';end if;
 if c is null or c<>p.customer_id or (not coalesce(v_admin,false) and c is distinct from public.portal_current_customer_id()) then raise exception 'Geen toegang tot deze order of dit product' using errcode='42501';end if;
 if p_release and (not v_admin or d.approved_at is null) then raise exception 'Beheerder moet deze versie eerst goedkeuren' using errcode='42501';end if;
 insert into public.order_drawings(order_key,order_no,customer_id,document_id,product_id,title) values(p_order_key,n,c,d.id,p.id,d.title) on conflict(order_key,document_id) do nothing;
 select id into v_id from public.order_drawings where order_key=p_order_key and document_id=d.id;
 if p_release then
  update public.order_drawings set production_current=false where order_key=p_order_key and product_id=p.id and title=d.title and production_current;
  update public.order_drawings set production_current=true,released_at=coalesce(released_at,now()),released_by=coalesce(released_by,auth.uid()) where id=v_id;
 end if;
 -- An upload/release on a web order also belongs to its existing production orders.
 if left(p_order_key,7)='portal:' then
  for child in select order_id,coalesce(order_no,order_id) as order_no from public.planner_orders_v2
   where workspace_id='ralabaster' and data->>'portalOrderId'=substr(p_order_key,8) and data->>'customerId'=c
   and coalesce(data->>'productTemplateId',data->'costing'->>'templateId')=p.source_template_id
  loop
   insert into public.order_drawings(order_key,order_no,customer_id,document_id,product_id,title)
   values('planner:'||child.order_id,child.order_no,c,d.id,p.id,d.title) on conflict(order_key,document_id) do nothing;
   if p_release then
    update public.order_drawings set production_current=false where order_key='planner:'||child.order_id and product_id=p.id and title=d.title and production_current;
    update public.order_drawings set production_current=true,released_at=coalesce(released_at,now()),released_by=coalesce(released_by,auth.uid()) where order_key='planner:'||child.order_id and document_id=d.id;
   end if;
  end loop;
 end if;
 return v_id;
end $$;
revoke all on function portal_private.link_order_drawing(text,uuid,boolean) from public,anon;
grant execute on function portal_private.link_order_drawing(text,uuid,boolean) to authenticated;
create function public.link_order_drawing(p_order_key text,p_document_id uuid,p_release boolean default false) returns uuid language sql security invoker set search_path='' as $$select portal_private.link_order_drawing(p_order_key,p_document_id,p_release)$$;
revoke all on function public.link_order_drawing(text,uuid,boolean) from public,anon;
grant execute on function public.link_order_drawing(text,uuid,boolean) to authenticated;

-- Snapshot only at order creation. Changing a product's current file never rewrites an order.
create function portal_private.snapshot_order_drawings() returns trigger language plpgsql security definer set search_path='' as $$
declare k text; c text; n text; t text;
begin
 if TG_TABLE_NAME='portal_order_lines' then
  select 'portal:'||id,customer_id,order_no into k,c,n from public.portal_orders where id=new.order_id;
  insert into public.order_drawings(order_key,order_no,customer_id,document_id,product_id,title,released_at,production_current)
  select k,n,c,d.id,p.id,d.title,d.approved_at,true from public.portal_product_documents d join public.portal_products p on p.id=d.product_id where p.customer_id=c and (p.id=new.product_id or p.source_template_id=new.source_template_id) and d.is_current and d.approved_at is not null on conflict do nothing;
 else
  k:='planner:'||new.order_id;c:=new.data->>'customerId';n:=coalesce(new.order_no,new.order_id);t:=coalesce(new.data->>'productTemplateId',new.data->'costing'->>'templateId');
  if new.data->>'portalOrderId' is not null then
   insert into public.order_drawings(order_key,order_no,customer_id,document_id,product_id,title,released_at,released_by,production_current)
   select k,n,c,l.document_id,l.product_id,l.title,l.released_at,l.released_by,l.production_current from public.order_drawings l join public.portal_products p on p.id=l.product_id where l.order_key='portal:'||(new.data->>'portalOrderId') and l.customer_id=c and p.source_template_id=t on conflict do nothing;
  else
   insert into public.order_drawings(order_key,order_no,customer_id,document_id,product_id,title,released_at,production_current)
   select k,n,c,d.id,p.id,d.title,d.approved_at,true from public.portal_product_documents d join public.portal_products p on p.id=d.product_id where p.customer_id=c and p.source_template_id=t and d.is_current and d.approved_at is not null on conflict do nothing;
  end if;
 end if;
 return new;
end $$;
revoke all on function portal_private.snapshot_order_drawings() from public,anon,authenticated;
create trigger snapshot_portal_order_drawings after insert on public.portal_order_lines for each row execute function portal_private.snapshot_order_drawings();
create trigger snapshot_planner_order_drawings after insert on public.planner_orders_v2 for each row execute function portal_private.snapshot_order_drawings();
commit;

begin;
create table public.portal_product_documents(
 id uuid primary key default gen_random_uuid(),
 product_id uuid not null references public.portal_products(id) on delete restrict,
 title text not null check(length(title) between 1 and 120),
 version integer not null check(version>0),
 file_name text not null check(length(file_name) between 1 and 200),
 storage_path text not null unique,
 uploaded_by uuid references auth.users(id) on delete set null,
 uploader_email text not null,
 note text not null default '' check(length(note)<=1000),
 is_current boolean not null default false, approved_at timestamptz,
 created_at timestamptz not null default now(),
 unique(product_id,title,version)
);
create unique index portal_product_document_current on public.portal_product_documents(product_id,title) where is_current;
create index portal_product_document_uploader on public.portal_product_documents(uploaded_by);
alter table public.portal_product_documents enable row level security;
revoke all on public.portal_product_documents from anon,authenticated;
grant select on public.portal_product_documents to authenticated;
create policy product_documents_read on public.portal_product_documents for select to authenticated using(public.portal_is_admin() or exists(select 1 from public.portal_products p join public.portal_customers c using(customer_id) where p.id=product_id and p.customer_id=public.portal_current_customer_id() and p.active and c.active));
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('product-documents','product-documents',false,26214400,array['application/pdf','image/jpeg','image/png','image/webp','application/octet-stream','application/dxf','image/vnd.dxf','application/acad','application/x-acad','application/step','model/step']) on conflict(id) do nothing;
create policy product_documents_storage_read on storage.objects for select to authenticated using(bucket_id='product-documents' and (public.portal_is_admin() or exists(select 1 from public.portal_products p join public.portal_customers c using(customer_id) where p.id::text=(storage.foldername(name))[1] and p.customer_id=public.portal_current_customer_id() and p.active and c.active)));
create policy product_documents_storage_insert on storage.objects for insert to authenticated with check(bucket_id='product-documents' and (public.portal_is_admin() or exists(select 1 from public.portal_products p join public.portal_customers c using(customer_id) where p.id::text=(storage.foldername(name))[1] and p.customer_id=public.portal_current_customer_id() and p.active and c.active)));
create policy product_documents_storage_cleanup on storage.objects for delete to authenticated using(bucket_id='product-documents' and owner_id=auth.uid()::text and not exists(select 1 from public.portal_product_documents d where d.storage_path=name));
create function portal_private.register_product_document(p_product_id uuid,p_title text,p_file_name text,p_path text,p_note text)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_product public.portal_products;v_id uuid:=gen_random_uuid();v_version integer;v_email text;v_admin boolean;
begin
 if auth.uid() is null then raise exception 'Aanmelding vereist.' using errcode='42501';end if;
 v_admin:=public.portal_is_admin();
 select * into v_product from public.portal_products where id=p_product_id for update;
 if not found or not(v_admin or (v_product.active and v_product.customer_id=public.portal_current_customer_id() and exists(select 1 from public.portal_customers where customer_id=v_product.customer_id and active))) then raise exception 'Geen toegang tot dit product.' using errcode='42501';end if;
 if p_title is null or length(trim(p_title)) not between 1 and 120 or p_file_name is null or length(p_file_name) not between 1 and 200 or length(coalesce(p_note,''))>1000 then raise exception 'Controleer titel, bestandsnaam en opmerking.';end if;
 if lower(p_file_name) !~ '\.(pdf|png|jpg|jpeg|webp|dwg|dxf|step|stp)$' then raise exception 'Dit bestandstype wordt niet ondersteund.';end if;
 if p_path is null or split_part(p_path,'/',1)<>p_product_id::text or not exists(select 1 from storage.objects where bucket_id='product-documents' and name=p_path and owner_id=auth.uid()::text) then raise exception 'Upload ontbreekt of hoort niet bij dit account.' using errcode='42501';end if;
 select coalesce(max(version),0)+1 into v_version from public.portal_product_documents where product_id=p_product_id and title=trim(p_title);
 v_email:=coalesce(auth.jwt()->>'email',(select email from public.portal_customer_users where user_id=auth.uid()),'Beheerder');
 insert into public.portal_product_documents(id,product_id,title,version,file_name,storage_path,uploaded_by,uploader_email,note) values(v_id,p_product_id,trim(p_title),v_version,p_file_name,p_path,auth.uid(),v_email,coalesce(p_note,''));
 if not v_admin then insert into public.portal_activity_log(customer_id,user_id,actor_email,kind,action,target,details) values(v_product.customer_id,auth.uid(),v_email,'change','document_uploaded',p_product_id::text,jsonb_build_object('after',jsonb_build_object('document',trim(p_title),'version',v_version,'file_name',p_file_name)));end if;
 return v_id;
end $$;
revoke all on function portal_private.register_product_document(uuid,text,text,text,text) from public,anon;
grant execute on function portal_private.register_product_document(uuid,text,text,text,text) to authenticated;
create function public.portal_register_product_document(p_product_id uuid,p_title text,p_file_name text,p_path text,p_note text default '') returns uuid language sql security invoker set search_path='' as $$select portal_private.register_product_document(p_product_id,p_title,p_file_name,p_path,p_note)$$;
revoke all on function public.portal_register_product_document(uuid,text,text,text,text) from public,anon;
grant execute on function public.portal_register_product_document(uuid,text,text,text,text) to authenticated;
create function portal_private.set_current_product_document(p_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare v_doc public.portal_product_documents;
begin
 if auth.uid() is null or not public.portal_is_admin() then raise exception 'Alleen beheerders mogen de actuele versie kiezen.' using errcode='42501';end if;
 select * into v_doc from public.portal_product_documents where id=p_id;
 if not found then raise exception 'Document niet gevonden.';end if;
 perform 1 from public.portal_products where id=v_doc.product_id for update;
 update public.portal_product_documents set is_current=false where product_id=v_doc.product_id and title=v_doc.title and is_current;
 update public.portal_product_documents set is_current=true,approved_at=coalesce(approved_at,now()) where id=p_id;
end $$;
revoke all on function portal_private.set_current_product_document(uuid) from public,anon;
grant execute on function portal_private.set_current_product_document(uuid) to authenticated;
create function public.portal_set_current_product_document(p_id uuid) returns void language sql security invoker set search_path='' as $$select portal_private.set_current_product_document(p_id)$$;
revoke all on function public.portal_set_current_product_document(uuid) from public,anon;
grant execute on function public.portal_set_current_product_document(uuid) to authenticated;
commit;
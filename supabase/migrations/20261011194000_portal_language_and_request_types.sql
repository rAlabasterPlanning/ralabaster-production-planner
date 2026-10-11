begin;

alter table public.portal_customers
  add column if not exists preferred_language text not null default 'nl';

alter table public.portal_customers
  drop constraint if exists portal_customers_preferred_language_check;
alter table public.portal_customers
  add constraint portal_customers_preferred_language_check
  check (preferred_language in ('nl','en','de'));

alter table public.portal_product_requests
  add column if not exists request_type text not null default 'quote';

alter table public.portal_product_requests
  drop constraint if exists portal_product_requests_request_type_check;
alter table public.portal_product_requests
  add constraint portal_product_requests_request_type_check
  check (request_type in ('quote','order'));

create or replace function public.portal_request_new_product(
  p_request_type text,
  p_product_name text,
  p_description text,
  p_dimensions text,
  p_material text,
  p_quantity numeric,
  p_unit text,
  p_requested_delivery_date date,
  p_attachment_path text
)
returns uuid
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_uid uuid := (select auth.uid());
  v_customer text;
  v_id uuid := gen_random_uuid();
  v_type text := lower(trim(coalesce(p_request_type,'quote')));
begin
  if v_uid is null then
    raise exception 'Aanmelding vereist.' using errcode='42501';
  end if;
  select customer_id into v_customer
  from public.portal_customer_users
  where user_id=v_uid and active
  limit 1;
  if v_customer is null then
    raise exception 'Geen actief klantaccount.' using errcode='42501';
  end if;
  if v_type not in ('quote','order') then
    raise exception 'Ongeldig aanvraagtype.';
  end if;
  if length(trim(coalesce(p_product_name,'')))<2 or length(trim(coalesce(p_description,'')))<5 then
    raise exception 'Naam en omschrijving zijn verplicht.';
  end if;
  insert into public.portal_product_requests(
    id,customer_id,created_by,request_type,product_name,description,
    dimensions,material,quantity,unit,requested_delivery_date,attachment_path
  ) values(
    v_id,v_customer,v_uid,v_type,trim(p_product_name),trim(p_description),
    nullif(trim(p_dimensions),''),nullif(trim(p_material),''),p_quantity,
    coalesce(nullif(trim(p_unit),''),'stuks'),p_requested_delivery_date,
    nullif(trim(p_attachment_path),'')
  );
  return v_id;
end $$;

revoke all on function public.portal_request_new_product(text,text,text,text,text,numeric,text,date,text) from public,anon;
grant execute on function public.portal_request_new_product(text,text,text,text,text,numeric,text,date,text) to authenticated;

commit;

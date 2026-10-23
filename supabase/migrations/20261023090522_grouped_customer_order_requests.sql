begin;
-- Additive only: old single-product requests and their RPC remain unchanged.
alter table public.portal_product_requests
 add column if not exists customer_reference text,
 add column if not exists product_lines jsonb;
alter table public.portal_product_requests add constraint portal_request_lines_array
 check(product_lines is null or (jsonb_typeof(product_lines)='array' and jsonb_array_length(product_lines) between 1 and 50));

-- Existing request INSERT access is admin-only. Match the existing authenticated
-- customer RPC boundary; derive ownership from active membership, never input.
create or replace function public.portal_submit_order_request(
 p_request_id uuid,p_customer_reference text,p_requested_delivery_date date,p_lines jsonb
) returns uuid language plpgsql security definer set search_path='' as $$
declare
 v_uid uuid := auth.uid(); v_customer text; l jsonb; v_lines jsonb := '[]';
 v_existing public.portal_product_requests%rowtype; v_first jsonb; v_path text;
begin
 if v_uid is null then raise exception 'Aanmelding vereist.' using errcode='42501'; end if;
 select customer_id into v_customer from public.portal_customer_users where user_id=v_uid and active;
 if v_customer is null then raise exception 'Geen actief klantaccount.' using errcode='42501'; end if;
 if p_request_id is null or length(coalesce(p_customer_reference,''))>200 then raise exception 'Ongeldige referentie of aanvraag.'; end if;
 if p_lines is null or jsonb_typeof(p_lines)<>'array' then raise exception 'Productregels ontbreken.'; end if;
 if jsonb_array_length(p_lines) not between 1 and 50 then raise exception 'Voeg 1 tot 50 productregels toe.'; end if;
 for l in select value from jsonb_array_elements(p_lines) loop
  if jsonb_typeof(l)<>'object' or length(trim(coalesce(l->>'product_name',''))) not between 2 and 200
   or length(trim(coalesce(l->>'description',''))) not between 5 and 10000
   or jsonb_typeof(l->'quantity') is distinct from 'number'
   or (l->>'quantity')::numeric<=0 or (l->>'quantity')::numeric>1000000000
   or coalesce(l->>'unit','') not in ('stuks','sets','kg','batch')
   or length(coalesce(l->>'dimensions',''))>500 or length(coalesce(l->>'material',''))>500
  then raise exception 'Ongeldige productregel: naam, omschrijving, positief aantal en eenheid zijn verplicht.'; end if;
  v_path := nullif(l->>'attachment_path','');
  if v_path is not null then
   if v_path not like v_customer||'/'||v_uid::text||'/'||p_request_id::text||'/%'
    or position('..' in v_path)>0
    or not exists(select 1 from storage.objects where bucket_id='portal-files' and name=v_path)
   then raise exception 'Ongeldige of ontbrekende bijlage.' using errcode='42501'; end if;
  end if;
  v_lines := v_lines||jsonb_build_array(jsonb_build_object(
   'product_name',trim(l->>'product_name'),'description',trim(l->>'description'),
   'dimensions',trim(coalesce(l->>'dimensions','')),'material',trim(coalesce(l->>'material','')),
   'quantity',(l->>'quantity')::numeric,'unit',l->>'unit','attachment_path',coalesce(v_path,'')));
 end loop;
 -- Serialize identical retries, so a timeout or double submit never creates two requests.
 perform pg_advisory_xact_lock(hashtextextended(p_request_id::text,0));
 select * into v_existing from public.portal_product_requests where id=p_request_id;
 if found then
  if v_existing.created_by is distinct from v_uid or v_existing.customer_id is distinct from v_customer then
   raise exception 'Aanvraag niet beschikbaar.' using errcode='42501';
  end if;
  if v_existing.product_lines is distinct from v_lines
   or v_existing.customer_reference is distinct from nullif(trim(p_customer_reference),'')
   or v_existing.requested_delivery_date is distinct from p_requested_delivery_date then
   raise exception 'Deze aanvraag is al opgeslagen. Vernieuw de pagina om de bestelling te bekijken.';
  end if;
  return p_request_id;
 end if;
 v_first := v_lines->0;
 insert into public.portal_product_requests(id,customer_id,created_by,request_type,customer_reference,product_lines,
  product_name,description,dimensions,material,quantity,unit,requested_delivery_date,attachment_path)
 values(p_request_id,v_customer,v_uid,'order',nullif(trim(p_customer_reference),''),v_lines,
  case when jsonb_array_length(v_lines)=1 then v_first->>'product_name' else jsonb_array_length(v_lines)||' producten' end,
  v_first->>'description',v_first->>'dimensions',v_first->>'material',(v_first->>'quantity')::numeric,
  v_first->>'unit',p_requested_delivery_date,nullif(v_first->>'attachment_path',''));
 return p_request_id;
end $$;
revoke all on function public.portal_submit_order_request(uuid,text,date,jsonb) from public,anon;
grant execute on function public.portal_submit_order_request(uuid,text,date,jsonb) to authenticated;
commit;

-- Run as database owner. All test writes are rolled back.
begin;
do $$
declare
 u uuid; c text; rid uuid:=gen_random_uuid(); result uuid; before_count bigint;
 payload jsonb:='[{"product_name":"Test lamp","description":"Test product one","dimensions":"10 mm","material":"Albast","quantity":2,"unit":"stuks"},{"product_name":"Test shade","description":"Test product two","dimensions":"20 mm","material":"Albast","quantity":3,"unit":"sets"}]';
begin
 select user_id,customer_id into u,c from public.portal_customer_users where active limit 1;
 if u is null then raise exception 'Test needs an existing active customer membership'; end if;
 select count(*) into before_count from public.portal_product_requests;
 perform set_config('request.jwt.claim.sub',u::text,true);
 result:=public.portal_submit_order_request(rid,'PO test',date '2026-12-01',payload);
 assert result=rid;
 assert (select jsonb_array_length(product_lines)=2 and product_lines->1->>'product_name'='Test shade' and customer_reference='PO test' and customer_id=c from public.portal_product_requests where id=rid);
 assert public.portal_submit_order_request(rid,'PO test',date '2026-12-01',payload)=rid;
 assert (select count(*)=before_count+1 from public.portal_product_requests);
 begin
  perform public.portal_submit_order_request(gen_random_uuid(),'bad',null,jsonb_set(payload,'{1,quantity}','0'));
  raise exception 'Invalid second line accepted';
 exception when raise_exception then
  if sqlerrm='Invalid second line accepted' then raise; end if;
 end;
 assert (select count(*)=before_count+1 from public.portal_product_requests);
 begin
  perform public.portal_submit_order_request(gen_random_uuid(),'bad',null,jsonb_set(payload,'{0,attachment_path}','"other/customer/file.pdf"'));
  raise exception 'Foreign attachment accepted';
 exception when insufficient_privilege then null;
 end;
 perform set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
 begin
  perform public.portal_submit_order_request(gen_random_uuid(),'bad',null,payload);
  raise exception 'Unknown customer accepted';
 exception when insufficient_privilege then null;
 end;
 perform set_config('request.jwt.claim.sub','',true);
 begin
  perform public.portal_submit_order_request(gen_random_uuid(),'bad',null,payload);
  raise exception 'Unauthenticated caller accepted';
 exception when insufficient_privilege then null;
 end;
end $$;
rollback;

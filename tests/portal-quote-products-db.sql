begin;
set local statement_timeout='20s';
select set_config('request.jwt.claim.sub',(select user_id::text from public.portal_admins limit 1),true);
set local role authenticated;
do $$
declare admin_id uuid:=auth.uid();baseline jsonb; q jsonb; quote_id text:='__TIER_QUOTE__'; member_id uuid; cid text; product public.portal_products; pid uuid; result uuid; newer jsonb; foreign_pid uuid;
begin
 select user_id,customer_id into member_id,cid from public.portal_customer_users where active limit 1;
 assert member_id is not null;
 select data into baseline from public.planner_shared_state where workspace_id='ralabaster';
 q:=jsonb_build_object('id','__tier_test_line','quoteNo',quote_id,'customerId',cid,'name','__Tier product test','qty',1,'saleUnit',100,'adjustmentPct',-20,'includeTierPricing',true,'priceTiers','[{"qty":25,"saleUnit":85},{"qty":100,"saleUnit":60}]'::jsonb,'tierVisibility','{"100":false}'::jsonb,'costUnit',999991,'project','INTERNAL SECRET','created','2099-01-01');
 update public.planner_shared_state set data=jsonb_set(data,'{quotes}',coalesce(data->'quotes','[]')||jsonb_build_array(q)) where workspace_id='ralabaster';
 select * into product from public.portal_products where quote_source_line_id='__tier_test_line';
 assert product.id is not null;pid:=product.id;
 assert product.unit_price=80;
 assert product.minimum_quantity=1;
 assert jsonb_array_length(product.price_tiers)=2;
 assert product.price_tiers->1->>'unit_price'='68.00';
 assert product.description not like '%INTERNAL%';
 assert product.price_tiers::text not like '%999991%';
 update public.planner_shared_state set data=jsonb_set(data,'{quotes}',data->'quotes') where workspace_id='ralabaster';
 assert (select count(*) from public.portal_products where quote_source_line_id='__tier_test_line')=1;
 newer:=q||'{"id":"__tier_new_line","productTemplateId":"__tier_template","created":"2099-02-01","saleUnit":120}'::jsonb;
 update public.planner_shared_state set data=jsonb_set(data,'{quotes}',(baseline->'quotes')||jsonb_build_array(q,newer)) where workspace_id='ralabaster';
 assert (select count(*) from public.portal_products where customer_id=cid and name='__Tier product test')=1;
 assert (select unit_price from public.portal_products where id=pid)=96;
 newer:=newer||'{"created":"2099-03-01","saleUnit":0}'::jsonb;
 update public.planner_shared_state set data=jsonb_set(data,'{quotes}',(baseline->'quotes')||jsonb_build_array(q,newer)) where workspace_id='ralabaster';
 assert (select unit_price from public.portal_products where id=pid)=96;
 select id into foreign_pid from public.portal_products where customer_id<>cid and active limit 1;
 -- Customer ordering uses server prices, regardless of client-supplied fake prices.
 perform set_config('request.jwt.claim.sub',member_id::text,true);
 result:=public.portal_place_order('TIER-TEST',null,'Rollback only',jsonb_build_array(jsonb_build_object('product_id',pid,'quantity',30,'unit_price',0.01)));
 assert exists(select 1 from public.portal_order_lines where order_id=result and quantity=30 and unit_price=68 and line_total=2040);
 if foreign_pid is not null then
  assert not exists(select 1 from public.portal_products where id=foreign_pid);
  begin
   perform public.portal_place_order('TIER-TEST',null,'Rollback only',jsonb_build_array(jsonb_build_object('product_id',foreign_pid,'quantity',30)));
   raise exception 'Foreign customer product accepted';
  exception when insufficient_privilege then null;end;
 end if;
 begin
  perform public.portal_place_order('TIER-TEST',null,'Rollback only',jsonb_build_array(jsonb_build_object('product_id',pid,'quantity',0)));
  raise exception 'Zero quantity accepted';
 exception when raise_exception then if sqlerrm not like '%Ongeldig aantal%' then raise;end if;end;
 perform set_config('request.jwt.claim.sub',admin_id::text,true);
 update public.portal_products set active=false where id=pid;
 q:=q||'{"saleUnit":110}'::jsonb;
 update public.planner_shared_state set data=jsonb_set(data,'{quotes}',baseline->'quotes'||jsonb_build_array(q)) where workspace_id='ralabaster';
 assert (select not active from public.portal_products where id=pid);
 assert not has_function_privilege('authenticated','portal_private.sync_quote_products(jsonb)','execute');
end $$;
rollback;
select 'PASS: quote products, customer prices, visible tiers, minimum, retry, server pricing, invalid quantity, disabled product and private sync access' as result;

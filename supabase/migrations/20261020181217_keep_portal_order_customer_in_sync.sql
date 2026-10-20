-- Keep the customer portal projection aligned when an existing planner order
-- is corrected to another customer. Completion already remains terminal via
-- planner_recovery.guard_archived_order().
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
  update public.portal_orders set customer_id=v_customer,status=case when new.deleted then 'cancelled' when new.status='completed' or new.active=false then 'completed' else coalesce(nullif(new.status,''),'processing') end,confirmed_delivery_date=coalesce(nullif(new.data->>'communicatedDeadline','')::date,new.deadline),internal_order_ids=array(select distinct x from unnest(internal_order_ids||array[new.order_id]) x),updated_at=now() where id=v_portal_id;
  return new;
 end if;
 select id into v_existing from public.portal_orders where source_order_id=new.order_id;
 if v_existing is null then
  insert into public.portal_orders(customer_id,source_order_id,internal_order_ids,order_no,customer_reference,status,requested_delivery_date,confirmed_delivery_date,notes,created_at,updated_at)
  values(v_customer,new.order_id,array[new.order_id],coalesce(nullif(new.order_no,''),'ORD-'||new.order_id),nullif(new.data->>'customerReference',''),case when new.deleted then 'cancelled' when new.status='completed' or new.active=false then 'completed' else coalesce(nullif(new.status,''),'processing') end,new.deadline,coalesce(nullif(new.data->>'communicatedDeadline','')::date,new.deadline),nullif(new.data->>'deliveryNote',''),coalesce(nullif(new.data->>'created','')::timestamptz,now()),now()) returning id into v_existing;
 else
  update public.portal_orders set customer_id=v_customer,order_no=coalesce(nullif(new.order_no,''),order_no),customer_reference=coalesce(nullif(new.data->>'customerReference',''),customer_reference),status=case when new.deleted then 'cancelled' when new.status='completed' or new.active=false then 'completed' else coalesce(nullif(new.status,''),'processing') end,requested_delivery_date=coalesce(new.deadline,requested_delivery_date),confirmed_delivery_date=coalesce(nullif(new.data->>'communicatedDeadline','')::date,new.deadline,confirmed_delivery_date),updated_at=now() where id=v_existing;
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

revoke execute on function public.portal_sync_order_trigger() from public, anon, authenticated;

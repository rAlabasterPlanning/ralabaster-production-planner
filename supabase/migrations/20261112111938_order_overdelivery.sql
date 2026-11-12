-- Immutable packing snapshots; delivery never changes the ordered quantity.
create or replace function public.planner_record_delivery_v2(p_order_id text,p_qty integer,p_expected_delivered integer,p_request_id uuid,p_note text default '',p_allow_overdelivery boolean default false)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare o jsonb; entry jsonb; packing jsonb; history jsonb; customer jsonb; delivered integer; ordered integer; extra integer; unit_price numeric; k text; stamp text:=to_char(clock_timestamp() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
begin
 if auth.uid() is null or not public.portal_is_admin() then raise exception 'Log in als plannerbeheerder';end if;
 if p_request_id is null or p_qty is null or p_qty<1 then raise exception 'Vul een positief geheel aantal in';end if;
 if length(coalesce(p_note,''))>2000 then raise exception 'De pakbonopmerking is te lang';end if;
 select data into o from public.planner_orders_v2 where workspace_id='ralabaster' and order_id=p_order_id and not deleted for update;
 if not found then raise exception 'Order niet gevonden';end if;
 history:=coalesce(o->'deliveries','[]');
 select value into entry from jsonb_array_elements(history) where value->>'id'=p_request_id::text;
 if entry is not null then
  if (entry->>'qty')::integer<>p_qty or coalesce(entry->'packing'->>'deliveryNote','')<>coalesce(p_note,'') then raise exception 'Deze levering is al opgeslagen met andere gegevens';end if;
  return jsonb_build_object('order',o,'delivery',entry,'existing',true);
 end if;
 if (o->>'qty')::numeric<>trunc((o->>'qty')::numeric) then raise exception 'Het bestelde aantal moet een geheel aantal zijn';end if;
 delivered:=coalesce((o->>'deliveredQty')::integer,0);ordered:=(o->>'qty')::integer;
 if o->>'quantityPending'='true' or ordered is null or ordered<=0 then raise exception 'Vul eerst het bestelde aantal in';end if;
 if o->>'closed'='true' or o->>'status'='completed' or o->>'active'='false' then raise exception 'Deze order is al afgerond';end if;
 if delivered is distinct from p_expected_delivered then raise exception 'De leveringsstand is gewijzigd. Heropen de order';end if;
 if delivered::bigint+p_qty>2147483647 then raise exception 'Het geleverde aantal is te groot';end if;
 extra:=greatest(delivered+p_qty-ordered,0)-greatest(delivered-ordered,0);
 if extra>0 and p_allow_overdelivery is distinct from true then raise exception 'Bevestig de overlevering en het extra te factureren aantal';end if;
 unit_price:=coalesce(nullif(o->>'saleUnit','')::numeric,nullif(o->>'totalSale','')::numeric/ordered);
 if extra>0 and (unit_price is null or unit_price<0) then raise exception 'Vul eerst een geldige verkoopprijs per stuk in';end if;
 unit_price:=coalesce(unit_price,0);
 packing:=jsonb_build_object('id',p_request_id::text,'orderNo',(o->>'orderNo')||'-DL'||lpad((jsonb_array_length(history)+1)::text,greatest(2,length((jsonb_array_length(history)+1)::text)),'0'),
  'originalOrderNo',o->>'orderNo','qty',p_qty,'completedQty',p_qty,'orderedQty',ordered,'backorderQty',greatest(ordered-delivered-p_qty,0),'overdeliveryQty',extra,'overdeliveredQty',greatest(delivered+p_qty-ordered,0),'deliveryDate',stamp,'deliveryNote',coalesce(p_note,''));
 foreach k in array array['customerId','customerName','customerSnapshot','customerReference','project','product','packages','requestedDeliveryDate','communicatedDeadline'] loop
  if o ? k then packing:=jsonb_set(packing,array[k],o->k,true);end if;
 end loop;
 select c into customer from public.planner_shared_state s,jsonb_array_elements(coalesce(s.data->'customers','[]')) c where s.workspace_id='ralabaster' and c->>'id'=o->>'customerId' limit 1;
 if customer is not null then packing:=jsonb_set(packing,'{customerSnapshot}',customer,true);end if;
 entry:=jsonb_build_object('id',p_request_id::text,'qty',p_qty,'createdAt',stamp,'createdBy',auth.uid(),'overdeliveryConfirmed',extra>0,'overdeliveryQty',extra,'unitPrice',unit_price,'lineTotal',round(p_qty*unit_price,2),'overdeliveryAmount',round(extra*unit_price,2),'packing',packing);
 o:=o||jsonb_build_object('deliveries',history||jsonb_build_array(entry),'deliveredQty',delivered+p_qty,'backorderQty',greatest(ordered-delivered-p_qty,0),
  'overdeliveredQty',greatest(delivered+p_qty-ordered,0),'billableQty',delivered+p_qty,'billableRevenue',round((delivered+p_qty)*unit_price,2),'overdeliveryAmount',round(greatest(delivered+p_qty-ordered,0)*unit_price,2),
  'completedQty',greatest(coalesce((o->>'completedQty')::integer,0),delivered+p_qty),'orderCompletionUpdatedAt',stamp,'deliveryUpdatedAt',stamp);
 perform set_config('planner.delivery_write','on',true);
 update public.planner_orders_v2 set data=o,updated_at=now() where workspace_id='ralabaster' and order_id=p_order_id;
 perform set_config('planner.delivery_write','off',true);
 return jsonb_build_object('order',o,'delivery',entry,'existing',false);
end $$;
revoke all on function public.planner_record_delivery_v2(text,integer,integer,uuid,text,boolean) from public,anon;
grant execute on function public.planner_record_delivery_v2(text,integer,integer,uuid,text,boolean) to authenticated;


-- Older browser saves cannot erase a delivery or its packing slip.
create or replace function planner_recovery.guard_delivery_history() returns trigger language plpgsql security invoker set search_path='' as $$
declare k text;
begin
 if coalesce(current_setting('planner.delivery_write',true),'')<>'on' then
  foreach k in array array['deliveries','deliveredQty','backorderQty','deliveryUpdatedAt','overdeliveredQty','billableQty','billableRevenue','overdeliveryAmount'] loop
   if old.data ? k then new.data:=jsonb_set(new.data,array[k],old.data->k,true);else new.data:=new.data-k;end if;
  end loop;
 end if;
 if coalesce((new.data->>'deliveredQty')::numeric,0)>coalesce((new.data->>'qty')::numeric,0) and
  (coalesce((new.data->>'overdeliveredQty')::numeric,0)<>(new.data->>'deliveredQty')::numeric-(new.data->>'qty')::numeric
   or coalesce((new.data->>'qty')::numeric,0)<coalesce((old.data->>'qty')::numeric,0)) then
  raise exception 'Orderaantal kan niet lager zijn dan het geleverde aantal zonder geregistreerde overlevering';end if;
 if coalesce((new.data->>'completedQty')::numeric,0)<coalesce((new.data->>'deliveredQty')::numeric,0) then new.data:=jsonb_set(new.data,'{completedQty}',new.data->'deliveredQty',true);end if;
 if coalesce((new.data->>'deliveredQty')::numeric,0)>0 and (new.data->>'deliveredQty')::numeric<(new.data->>'qty')::numeric and (not new.active or new.status='completed' or new.data->>'closed'='true') then raise exception 'Er staat nog een backorder open. Registreer eerst de resterende levering';end if;
 return new;
end $$;
revoke all on function planner_recovery.guard_delivery_history() from public,anon,authenticated;


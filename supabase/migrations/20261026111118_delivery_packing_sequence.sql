-- Immutable packing snapshots; delivery never changes the ordered quantity.
create or replace function public.planner_record_delivery_v1(p_order_id text,p_qty integer,p_expected_delivered integer,p_request_id uuid,p_note text default '')
returns jsonb language plpgsql security invoker set search_path='' as $$
declare o jsonb; entry jsonb; packing jsonb; history jsonb; customer jsonb; delivered integer; ordered integer; k text; stamp text:=to_char(clock_timestamp() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
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
 if delivered+p_qty>ordered then raise exception 'Het aantal is groter dan de resterende backorder';end if;
 packing:=jsonb_build_object('id',p_request_id::text,'orderNo',(o->>'orderNo')||'-DL'||lpad((jsonb_array_length(history)+1)::text,greatest(2,length((jsonb_array_length(history)+1)::text)),'0'),
  'originalOrderNo',o->>'orderNo','qty',p_qty,'completedQty',p_qty,'orderedQty',ordered,'backorderQty',ordered-delivered-p_qty,'deliveryDate',stamp,'deliveryNote',coalesce(p_note,''));
 foreach k in array array['customerId','customerName','customerSnapshot','customerReference','project','product','packages','requestedDeliveryDate','communicatedDeadline'] loop
  if o ? k then packing:=jsonb_set(packing,array[k],o->k,true);end if;
 end loop;
 select c into customer from public.planner_shared_state s,jsonb_array_elements(coalesce(s.data->'customers','[]')) c where s.workspace_id='ralabaster' and c->>'id'=o->>'customerId' limit 1;
 if customer is not null then packing:=jsonb_set(packing,'{customerSnapshot}',customer,true);end if;
 entry:=jsonb_build_object('id',p_request_id::text,'qty',p_qty,'createdAt',stamp,'createdBy',auth.uid(),'packing',packing);
 o:=o||jsonb_build_object('deliveries',history||jsonb_build_array(entry),'deliveredQty',delivered+p_qty,'backorderQty',ordered-delivered-p_qty,
  'completedQty',greatest(coalesce((o->>'completedQty')::integer,0),delivered+p_qty),'orderCompletionUpdatedAt',stamp,'deliveryUpdatedAt',stamp);
 perform set_config('planner.delivery_write','on',true);
 update public.planner_orders_v2 set data=o,updated_at=now() where workspace_id='ralabaster' and order_id=p_order_id;
 perform set_config('planner.delivery_write','off',true);
 return jsonb_build_object('order',o,'delivery',entry,'existing',false);
end $$;
revoke all on function public.planner_record_delivery_v1(text,integer,integer,uuid,text) from public,anon;
grant execute on function public.planner_record_delivery_v1(text,integer,integer,uuid,text) to authenticated;


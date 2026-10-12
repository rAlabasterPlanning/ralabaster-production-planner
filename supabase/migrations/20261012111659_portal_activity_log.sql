begin;
create schema if not exists portal_private;
revoke all on schema portal_private from public,anon;
grant usage on schema portal_private to authenticated;
create table public.portal_activity_log (
 id uuid primary key default gen_random_uuid(),
 customer_id text not null references public.portal_customers(customer_id) on delete cascade,
 user_id uuid references auth.users(id) on delete set null,
 actor_email text not null,
 kind text not null check(kind in ('login','page','click','change')),
 page text not null default '',
 action text not null,
 target text not null default '',
 details jsonb not null default '{}',
 auth_session_id text,
 created_at timestamptz not null default now()
);
create index portal_activity_customer_time on public.portal_activity_log(customer_id,created_at desc,id desc);
create index portal_activity_customer_kind_time on public.portal_activity_log(customer_id,kind,created_at desc);
create index portal_activity_user_idx on public.portal_activity_log(user_id);
create unique index portal_activity_login_session on public.portal_activity_log(user_id,auth_session_id) where kind='login';
alter table public.portal_activity_log enable row level security;
revoke all on public.portal_activity_log from anon,authenticated;
grant select on public.portal_activity_log to authenticated;
create policy portal_activity_admin_read on public.portal_activity_log for select to authenticated using ((select public.portal_is_admin()));

-- Private writer derives the customer, actor and login session from verified auth.
create function portal_private.record_activity(p_kind text,p_page text,p_action text,p_target text)
returns void language plpgsql security definer set search_path='' as $$
declare v_customer text;v_email text;v_session text;
begin
 if auth.uid() is null then raise exception 'Aanmelding vereist.' using errcode='42501';end if;
 if public.portal_is_admin() then return;end if;
 select u.customer_id,u.email into v_customer,v_email from public.portal_customer_users u join public.portal_customers c using(customer_id) where u.user_id=auth.uid() and u.active and c.active limit 1;
 if v_customer is null then raise exception 'Geen actief klantaccount.' using errcode='42501';end if;
 if p_kind is null or p_kind not in ('login','page','click') then raise exception 'Ongeldig activiteitstype.';end if;
 if p_page is null or p_page not in ('dashboard','products','orders','completed','quotes','quote_request','order_request','preferences','') then raise exception 'Ongeldige pagina.';end if;
 if (p_kind='login' and p_action is distinct from 'login') or (p_kind='page' and (p_action is distinct from 'view' or p_page='')) or (p_kind='click' and (p_action is null or p_action not in ('add_product','open_cart','close_cart','request_change','submit_change','submit_order','quote_accept','quote_decline','custom_order','download_packing','logout'))) then raise exception 'Ongeldige actie.';end if;
 if length(coalesce(p_target,''))>100 then raise exception 'Ongeldig doel.';end if;
 v_session:=auth.jwt()->>'session_id';
 if p_kind='login' and v_session is null then raise exception 'Geen inlogsessie.' using errcode='42501';end if;
 insert into public.portal_activity_log(customer_id,user_id,actor_email,kind,page,action,target,auth_session_id)
 values(v_customer,auth.uid(),v_email,p_kind,p_page,p_action,coalesce(p_target,''),v_session) on conflict do nothing;
end $$;
revoke all on function portal_private.record_activity(text,text,text,text) from public,anon;
grant execute on function portal_private.record_activity(text,text,text,text) to authenticated;
create function public.portal_record_activity(p_kind text,p_page text,p_action text,p_target text default '') returns void language sql security invoker set search_path='' as $$select portal_private.record_activity(p_kind,p_page,p_action,p_target)$$;
revoke all on function public.portal_record_activity(text,text,text,text) from public,anon;
grant execute on function public.portal_record_activity(text,text,text,text) to authenticated;

-- Database audit: only completed customer writes, with an explicit field allowlist.
create function portal_private.audit_customer_change() returns trigger language plpgsql security definer set search_path='' as $$
declare v_customer text;v_email text;v_new jsonb:=to_jsonb(new);v_old jsonb:='{}';v_before jsonb:='{}';v_after jsonb:='{}';v_fields text[];v_key text;v_action text;v_target text;
begin
 if auth.uid() is null or public.portal_is_admin() then return new;end if;
 select u.customer_id,u.email into v_customer,v_email from public.portal_customer_users u join public.portal_customers c using(customer_id) where u.user_id=auth.uid() and u.active and c.active limit 1;
 if v_customer is null then return new;end if;
 if tg_op='UPDATE' then v_old:=to_jsonb(old);end if;
 if tg_table_name='portal_order_lines' then
  if not exists(select 1 from public.portal_orders where id=new.order_id and customer_id=v_customer) then return new;end if;
 elsif v_new->>'customer_id' is distinct from v_customer then return new;end if;
 v_target:=coalesce(v_new->>'order_id',v_new->>'id',v_customer);
 case tg_table_name
 when 'portal_customers' then
  v_new:=coalesce(v_new->'preferences','{}');v_old:=coalesce(v_old->'preferences','{}');
  v_fields:=array['language','phone','invoice_email','packing_slip_email','order_confirmation_email','logistics_email','invoice_reference','delivery_notes','marketing_opt_in'];v_action:='preferences_saved';
 when 'portal_orders' then v_fields:=array['order_no','customer_reference','requested_delivery_date','notes'];v_action:='order_created';
 when 'portal_order_lines' then v_fields:=array['description','quantity','unit'];v_action:='order_line_added';
 when 'portal_order_change_requests' then v_fields:=array['requested_delivery_date','line_changes','message'];v_action:='change_requested';
 when 'portal_product_requests' then v_fields:=array['request_type','product_name','description','dimensions','material','quantity','unit','requested_delivery_date'];v_action:='product_requested';
 when 'portal_quotes' then v_fields:=array['quote_no','status'];v_action:='quote_decision';
 else return new;
 end case;
 foreach v_key in array v_fields loop
  if (v_new->v_key) is distinct from (v_old->v_key) then
   v_before:=v_before||jsonb_build_object(v_key,v_old->v_key);v_after:=v_after||jsonb_build_object(v_key,v_new->v_key);
  end if;
 end loop;
 if v_after='{}' then return new;end if;
 insert into public.portal_activity_log(customer_id,user_id,actor_email,kind,action,target,details,auth_session_id)
 values(v_customer,auth.uid(),v_email,'change',v_action,v_target,jsonb_build_object('before',v_before,'after',v_after),auth.jwt()->>'session_id');
 return new;
end $$;
revoke all on function portal_private.audit_customer_change() from public,anon,authenticated;
create trigger portal_activity_preferences after update on public.portal_customers for each row execute function portal_private.audit_customer_change();
create trigger portal_activity_orders after insert on public.portal_orders for each row execute function portal_private.audit_customer_change();
create trigger portal_activity_order_lines after insert on public.portal_order_lines for each row execute function portal_private.audit_customer_change();
create trigger portal_activity_changes after insert on public.portal_order_change_requests for each row execute function portal_private.audit_customer_change();
create trigger portal_activity_requests after insert on public.portal_product_requests for each row execute function portal_private.audit_customer_change();
create trigger portal_activity_quotes after update of status on public.portal_quotes for each row execute function portal_private.audit_customer_change();
comment on table public.portal_activity_log is 'Admin-only customer portal activity. Browser page/click events are analytics; change events are database audit records. Recording starts at deployment.';
commit;
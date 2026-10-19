begin;
create table public.planner_request_reviews (
 source text not null check(source in ('portal','acquisition')),
 request_id uuid not null,
 status text not null default 'new' check(status in ('new','reviewing','quoted','completed')),
 notes text not null default '', data jsonb not null default '{}'::jsonb,
 quote_no text, updated_at timestamptz not null default now(),
 primary key(source,request_id)
);
alter table public.planner_request_reviews enable row level security;
revoke all on public.planner_request_reviews from anon,authenticated;
grant select,insert,update on public.planner_request_reviews to authenticated;
create policy request_reviews_admin on public.planner_request_reviews for all to authenticated
 using(public.portal_is_admin()) with check(public.portal_is_admin());
create function public.planner_new_request_count() returns bigint
language sql stable security invoker set search_path='' as $$
 select count(*) from (
  select 'portal'::text as source,id,status from public.portal_product_requests
  union all select 'acquisition',id,status from public.acquisition_requests where kind='quote'
 ) r left join public.planner_request_reviews v on v.source=r.source and v.request_id=r.id
 where public.portal_is_admin() and coalesce(v.status,r.status)='new';
$$;
revoke all on function public.planner_new_request_count() from public,anon;
grant execute on function public.planner_new_request_count() to authenticated;

-- Durable notification queue; customers and browser code cannot read or write it.
create table public.quote_request_notifications (
 id uuid primary key default gen_random_uuid(),
 source text not null check(source in ('portal','acquisition')),request_id uuid not null,
 status text not null default 'pending' check(status in ('pending','claimed','sending','accepted','needs_review','failed')),
 attempts integer not null default 0, available_at timestamptz not null default now(),
 claimed_at timestamptz, accepted_at timestamptz, last_error text,
 recipient text, created_at timestamptz not null default now(),unique(source,request_id)
);
alter table public.quote_request_notifications enable row level security;
revoke all on public.quote_request_notifications from public,anon,authenticated;
grant select,insert,update on public.quote_request_notifications to service_role;
create index quote_notifications_due on public.quote_request_notifications(available_at) where status='pending';

create function portal_private.queue_quote_notification() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if (tg_table_name='portal_product_requests' and new.request_type='quote') then
  insert into public.quote_request_notifications(source,request_id) values('portal',new.id) on conflict do nothing;
 end if;
 return new;
end $$;
revoke all on function portal_private.queue_quote_notification() from public,anon,authenticated;
create trigger queue_portal_quote_notification after insert on public.portal_product_requests
 for each row execute function portal_private.queue_quote_notification();
create function portal_private.queue_acquisition_quote_notification() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.kind='quote' then
  insert into public.quote_request_notifications(source,request_id) values('acquisition',new.id) on conflict do nothing;
 end if;
 return new;
end $$;
revoke all on function portal_private.queue_acquisition_quote_notification() from public,anon,authenticated;
create trigger queue_acquisition_quote_notification after insert on public.acquisition_requests
 for each row execute function portal_private.queue_acquisition_quote_notification();

-- Only the server may claim work; concurrent workers cannot send the same row.
create function public.claim_quote_notification() returns setof public.quote_request_notifications
language plpgsql security invoker set search_path='' as $$
begin
 update public.quote_request_notifications set status='needs_review',last_error='Verzendresultaat onbekend; controleer Verzonden items.'
  where status='sending' and claimed_at<now()-interval '10 minutes';
 update public.quote_request_notifications set status='pending'
  where status='claimed' and claimed_at<now()-interval '10 minutes';
 return query update public.quote_request_notifications set status='claimed',claimed_at=now(),attempts=attempts+1
 where id=(select id from public.quote_request_notifications where status='pending' and available_at<=now()
  order by created_at for update skip locked limit 1) returning *;
end $$;
revoke all on function public.claim_quote_notification() from public,anon,authenticated;
grant execute on function public.claim_quote_notification() to service_role;
commit;

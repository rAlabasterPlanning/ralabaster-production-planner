-- Isolated acquisition data; existing planner/customer/order records are read-only here.
create table public.acquisition_settings (
 workspace_id text primary key check(workspace_id='ralabaster'), data jsonb not null default '{}'::jsonb,
 revision bigint not null default 0, sending_enabled boolean not null default false,
 updated_at timestamptz not null default now()
);
insert into public.acquisition_settings(workspace_id) values('ralabaster');
create table public.acquisition_prospects (
 id uuid primary key default gen_random_uuid(), workspace_id text not null default 'ralabaster' check(workspace_id='ralabaster'),
 domain text not null unique, company text not null, review_day date not null,
 status text not null default 'new' check(status in ('new','approved','rejected','later','researching','contacted','replied','sample_requested','sample_sent','quote_requested','stopped')),
 data jsonb not null, revision bigint not null default 0, reason text not null default '',
 approved_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index acquisition_review_queue on public.acquisition_prospects(review_day,status);
create table public.acquisition_events (
 id uuid primary key default gen_random_uuid(), request_id uuid unique,
 prospect_id uuid references public.acquisition_prospects(id), kind text not null, data jsonb not null default '{}'::jsonb,
 actor uuid, created_at timestamptz not null default now()
);
create table public.acquisition_outbox (
 id uuid primary key default gen_random_uuid(), prospect_id uuid not null references public.acquisition_prospects(id),
 step integer not null check(step>=0), status text not null default 'scheduled' check(status in ('scheduled','drafted','sending','sent','stopped','needs_review')),
 subject text, body text, recipient text, provider_id text, conversation_id text,
 due_at timestamptz not null default now(), sent_at timestamptz, error text,
 created_at timestamptz not null default now(), unique(prospect_id,step)
);
create index acquisition_outbox_due on public.acquisition_outbox(due_at) where status='scheduled';
create table public.acquisition_connections (
 provider text primary key check(provider='microsoft'), email text not null, encrypted_tokens text not null,
 connected_by uuid not null, updated_at timestamptz not null default now()
);
create table public.acquisition_oauth_states (
 id text primary key, user_id uuid not null, verifier text not null, expires_at timestamptz not null
);
create table public.acquisition_runs (
 id uuid primary key default gen_random_uuid(), kind text not null, status text not null default 'running',
 details jsonb not null default '{}'::jsonb, started_at timestamptz not null default now(), finished_at timestamptz
);
create table public.acquisition_leases (
 id text primary key, owner uuid not null, expires_at timestamptz not null
);
create table public.acquisition_intake_links (
 token_hash text primary key, prospect_id uuid not null references public.acquisition_prospects(id),
 expires_at timestamptz not null, submissions integer not null default 0, created_at timestamptz not null default now()
);
create table public.acquisition_requests (
 id uuid primary key default gen_random_uuid(), prospect_id uuid not null references public.acquisition_prospects(id),
 request_id uuid not null unique, kind text not null check(kind in ('sample','quote')), data jsonb not null,
 status text not null default 'new', created_at timestamptz not null default now()
);
do $$ declare t text; begin
 foreach t in array array['acquisition_settings','acquisition_prospects','acquisition_events','acquisition_outbox','acquisition_connections','acquisition_oauth_states','acquisition_runs','acquisition_leases','acquisition_intake_links','acquisition_requests'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from anon,authenticated',t);
 execute format('grant all on public.%I to service_role',t);
 end loop;
 foreach t in array array['acquisition_settings','acquisition_prospects','acquisition_events','acquisition_outbox','acquisition_runs','acquisition_requests'] loop
 execute format('grant select on public.%I to authenticated',t);
 execute format('create policy acquisition_admin_read on public.%I for select to authenticated using ((select public.portal_is_admin()))',t);
 end loop;
end $$;
grant update(data,revision,updated_at) on public.acquisition_settings to authenticated;
create policy acquisition_admin_settings on public.acquisition_settings for update to authenticated using ((select public.portal_is_admin())) with check ((select public.portal_is_admin()));
grant update(status,reason,revision,approved_at,updated_at) on public.acquisition_prospects to authenticated;
create policy acquisition_admin_review on public.acquisition_prospects for update to authenticated using ((select public.portal_is_admin())) with check ((select public.portal_is_admin()));
grant insert on public.acquisition_events to authenticated;
create policy acquisition_admin_event on public.acquisition_events for insert to authenticated with check ((select public.portal_is_admin()));
create function public.acquisition_save_settings(p_revision bigint,p_data jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare r public.acquisition_settings%rowtype;
begin
 if not public.portal_is_admin() then raise exception 'Log in met het planneraccount' using errcode='42501';end if;
 if jsonb_typeof(p_data)<>'object' or octet_length(p_data::text)>150000 then raise exception 'Ongeldige of te grote instellingen';end if;
 if p_data::text ~* '"[^" ]*(password|secret|access.?token|refresh.?token|api.?key)[^" ]*"\s*:' then raise exception 'Bewaar geen inloggegevens in de instellingen';end if;
 select * into r from public.acquisition_settings where workspace_id='ralabaster' for update;
 if r.revision<>p_revision then raise exception 'Instellingen zijn op een ander apparaat gewijzigd. Vernieuw en controleer opnieuw.' using errcode='40001';end if;
 update public.acquisition_settings set data=p_data,revision=revision+1,updated_at=now() where workspace_id='ralabaster' returning * into r;
 return to_jsonb(r);
end $$;
create function public.acquisition_review(p_request uuid,p_id uuid,p_revision bigint,p_choice text,p_reason text) returns jsonb language plpgsql security invoker set search_path='' as $$
declare r public.acquisition_prospects%rowtype;result jsonb;
begin
 if not public.portal_is_admin() then raise exception 'Log in met het planneraccount' using errcode='42501';end if;
 if p_choice not in ('approved','rejected','later') or length(p_reason)>2000 then raise exception 'Ongeldige beoordeling';end if;
 perform pg_advisory_xact_lock(hashtext('acquisition-review'));
 select data into result from public.acquisition_events where request_id=p_request;if found then return result;end if;
 select * into r from public.acquisition_prospects where id=p_id for update;
 if not found or r.status not in ('new','later') or r.revision<>p_revision then raise exception 'Deze prospect is al beoordeeld of gewijzigd. Vernieuw de lijst.' using errcode='40001';end if;
 update public.acquisition_prospects set status=p_choice,reason=coalesce(p_reason,''),approved_at=case when p_choice='approved' then now() else null end,revision=revision+1,updated_at=now() where id=p_id returning * into r;
 result:=jsonb_build_object('id',r.id,'status',r.status,'reason',r.reason,'revision',r.revision,'company',r.company);
 insert into public.acquisition_events(request_id,prospect_id,kind,data,actor) values(p_request,p_id,'review',result,auth.uid());
 return result;
end $$;
revoke all on function public.acquisition_save_settings(bigint,jsonb),public.acquisition_review(uuid,uuid,bigint,text,text) from public,anon;
grant execute on function public.acquisition_save_settings(bigint,jsonb),public.acquisition_review(uuid,uuid,bigint,text,text) to authenticated;
create function public.acquisition_claim(p_owner uuid,p_seconds integer default 240) returns boolean language plpgsql security invoker set search_path='' as $$
declare n integer;
begin
 insert into public.acquisition_leases(id,owner,expires_at) values('runner',p_owner,now()+make_interval(secs=>least(300,greatest(30,p_seconds))))
 on conflict(id) do update set owner=excluded.owner,expires_at=excluded.expires_at where public.acquisition_leases.expires_at<now();
 get diagnostics n=row_count;return n>0;
end $$;
revoke all on function public.acquisition_claim(uuid,integer) from public,anon,authenticated;
grant execute on function public.acquisition_claim(uuid,integer) to service_role;
-- Prospect uploads stay private. Files are limited to STEP/STP/PDF/images by the server.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('acquisition-files','acquisition-files',false,20000000,array['application/octet-stream','application/pdf','image/png','image/jpeg']) on conflict(id) do nothing;
-- Manual, authenticated research can run before unattended hosting is configured.
grant insert on public.acquisition_prospects,public.acquisition_runs to authenticated;
grant update(status,details,finished_at) on public.acquisition_runs to authenticated;
create policy acquisition_admin_prospect_insert on public.acquisition_prospects for insert to authenticated with check ((select public.portal_is_admin()));
create policy acquisition_admin_run_insert on public.acquisition_runs for insert to authenticated with check ((select public.portal_is_admin()));
create policy acquisition_admin_run_update on public.acquisition_runs for update to authenticated using ((select public.portal_is_admin())) with check ((select public.portal_is_admin()));
grant select,insert,update,delete on public.acquisition_leases to authenticated;
create policy acquisition_admin_lease on public.acquisition_leases for all to authenticated using ((select public.portal_is_admin())) with check ((select public.portal_is_admin()));
grant execute on function public.acquisition_claim(uuid,integer) to authenticated;

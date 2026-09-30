
create schema if not exists planner_recovery;
revoke all on schema planner_recovery from public, anon, authenticated;
create table planner_recovery.daily_snapshots (
 id bigint generated always as identity primary key,
 workspace_id text not null, created_at timestamptz not null default now(),
 reason text not null, data jsonb not null
);
create table planner_recovery.quote_versions (
 id bigint generated always as identity primary key,
 workspace_id text not null, created_at timestamptz not null default now(),
 source text not null, quotes jsonb not null
);
alter table planner_recovery.daily_snapshots enable row level security;
alter table planner_recovery.quote_versions enable row level security;
revoke all on all tables in schema planner_recovery from public, anon, authenticated;
create index quote_versions_workspace_time on planner_recovery.quote_versions(workspace_id,created_at desc);
create index daily_snapshots_workspace_time on planner_recovery.daily_snapshots(workspace_id,created_at desc);

create function planner_recovery.guard_quotes() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
 old_quotes jsonb := coalesce(old.data->'quotes','[]'::jsonb);
 incoming jsonb := coalesce(new.data->'quotes','[]'::jsonb);
 baseline jsonb := new.data->'quoteWriteBaseline';
 preserved jsonb := '[]'::jsonb;
 q jsonb; submitted jsonb; prior jsonb; intent jsonb; valid_delete boolean;
begin
 if tg_op = 'DELETE' then raise exception 'Planner metadata cannot be permanently deleted'; end if;
 if auth.uid() is null and current_setting('request.jwt.claim.role',true) = 'authenticated' then
  raise exception 'Authenticated planner user required';
 end if;
 if new.workspace_id <> old.workspace_id then raise exception 'Workspace cannot be changed'; end if;
 if jsonb_typeof(incoming) <> 'array' then raise exception 'Quotes must be an array'; end if;
 if exists(select 1 from jsonb_array_elements(incoming) x where nullif(x->>'id','') is null)
 or (select count(*) from jsonb_array_elements(incoming)) <> (select count(distinct x->>'id') from jsonb_array_elements(incoming) x) then raise exception 'Quotation IDs must be unique and nonempty'; end if;
 for q in select value from jsonb_array_elements(old_quotes) loop
  select value into submitted from jsonb_array_elements(incoming) where value->>'id'=q->>'id';
  valid_delete := false;
  if submitted is null then
   for intent in select value from jsonb_array_elements(coalesce(new.data->'quoteDeletionIntents','[]'::jsonb)) loop
    if intent->>'id'=q->>'id' and nullif(intent->>'at','') is not null
       and not coalesce(old.data->'quoteDeletionIntents','[]'::jsonb) @> jsonb_build_array(intent) then valid_delete := true; end if;
   end loop;
   if not valid_delete then preserved := preserved || jsonb_build_array(q); end if;
  else
   -- An unchanged stale quote cannot overwrite a newer server version.
   if jsonb_typeof(baseline)='array' then
    select value into prior from jsonb_array_elements(baseline) where value->>'id'=q->>'id';
    if submitted = prior and q is distinct from prior then submitted := q; end if;
   end if;
   preserved := preserved || jsonb_build_array(submitted);
  end if;
 end loop;
 for q in select value from jsonb_array_elements(incoming) loop
  if not exists(select 1 from jsonb_array_elements(old_quotes) x where x->>'id'=q->>'id') then preserved := preserved || jsonb_build_array(q); end if;
 end loop;
 new.data := jsonb_set(new.data - 'quoteWriteBaseline','{quotes}',preserved,true);
 if old_quotes is distinct from preserved then
  insert into planner_recovery.quote_versions(workspace_id,source,quotes) values(old.workspace_id,'before-change',old_quotes),(new.workspace_id,'after-change',preserved);
 end if;
 return new;
end $$;
revoke all on function planner_recovery.guard_quotes() from public, anon, authenticated;
create trigger planner_preserve_quote_versions before update or delete on public.planner_shared_state for each row execute function planner_recovery.guard_quotes();

create function planner_recovery.capture_daily_snapshot(p_reason text default 'daily') returns void
language plpgsql security invoker set search_path = '' as $$
begin
 insert into planner_recovery.daily_snapshots(workspace_id,reason,data)
 select s.workspace_id,p_reason,jsonb_build_object(
  'sharedState',to_jsonb(s),
  'orders',coalesce((select jsonb_agg(to_jsonb(o) order by o.order_id) from public.planner_orders_v2 o where o.workspace_id=s.workspace_id),'[]'::jsonb),
  'tasks',coalesce((select jsonb_agg(to_jsonb(t) order by t.task_id) from public.planner_tasks_v2 t where t.workspace_id=s.workspace_id),'[]'::jsonb),
  'workers',coalesce((select jsonb_agg(to_jsonb(w) order by w.employee) from public.planner_workers w where w.workspace_id=s.workspace_id),'[]'::jsonb),
  'legacyStates',coalesce((select jsonb_agg(to_jsonb(l)) from public.planner_state l),'[]'::jsonb)
 ) from public.planner_shared_state s;
 delete from planner_recovery.daily_snapshots where created_at < now() - interval '90 days';
end $$;
revoke all on function planner_recovery.capture_daily_snapshot(text) from public, anon, authenticated;
insert into planner_recovery.quote_versions(workspace_id,source,quotes) select workspace_id,'initial',coalesce(data->'quotes','[]'::jsonb) from public.planner_shared_state;
select planner_recovery.capture_daily_snapshot('initial');
create extension if not exists pg_cron;
select cron.schedule('ralabaster_daily_planner_backup','0 2 * * *',$job$select planner_recovery.capture_daily_snapshot('daily');$job$);

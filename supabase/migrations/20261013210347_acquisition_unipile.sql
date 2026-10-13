-- Same service-only account table; no changes to planner or customer records.
alter table public.acquisition_connections drop constraint acquisition_connections_provider_check;
alter table public.acquisition_connections add constraint acquisition_connections_provider_check
 check(provider in ('microsoft','unipile_linkedin','unipile_instagram'));
create index if not exists acquisition_events_social_day on public.acquisition_events(kind,created_at);

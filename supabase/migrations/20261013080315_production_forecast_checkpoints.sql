-- Cumulative between-shift/session counts with optimistic concurrency checks.
-- Existing command and material-stock transactions remain the only writers.
begin;
create or replace function public.production_checkpoint_context() returns jsonb
language plpgsql stable security invoker set search_path='' as $$
begin
 if not public.portal_is_admin() then raise exception 'Log in met het planneraccount' using errcode='42501';end if;
 return coalesce((select jsonb_agg(to_jsonb(x)) from (
 select s.id as session_id,s.good,s.scrap,s.rework,s.stone_used_pieces,s.stone_used_kg,
 (select max(coalesce((e.result->>'at')::timestamptz,e.occurred_at)) from public.production_events e where
 (e.session_id=s.id and e.action in ('counts','stop','correction','backfill')) or
 (e.action='close_day' and exists(select 1 from jsonb_array_elements(coalesce(e.payload->'rows','[]')) r where r->>'session_id'=s.id::text))) as last_report_at,
 coalesce((select jsonb_agg(to_jsonb(m)) from (select material_id,kind,sum(quantity) as quantity from public.production_material_moves where session_id=s.id and kind in ('used','broken','alabaster_scrap') group by material_id,kind)m),'[]'::jsonb) as material_totals
 from public.production_sessions s where s.ended_at is null or s.review_needed
 )x),'[]'::jsonb);
end$$;
create or replace function public.production_checkpoint(p_request uuid,p_payload jsonb,p_occurred_at timestamptz default now()) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare s public.production_sessions%rowtype; result jsonb; v_payload jsonb:=p_payload; field text; total numeric; previous numeric; expected numeric; item jsonb; material_rows jsonb:='[]'; loss numeric; action text:=coalesce(p_payload->>'action','counts');
begin
 if not public.portal_is_admin() then raise exception 'Log in met het planneraccount' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtext('ralabaster-production-floor'));
 select e.result into result from public.production_events e where e.request_id=p_request;
 if found then return result;end if;
 if action not in ('counts','stop') then raise exception 'Onbekende tussenstandactie';end if;
 select * into s from public.production_sessions where id=(p_payload->>'session_id')::uuid and employee=p_payload->>'employee' for update;
 if not found or (s.ended_at is not null and not s.review_needed) then raise exception 'Werk gewijzigd of afgesloten; vernieuw de registratie';end if;
 foreach field in array array['good','scrap','rework','stone_used_pieces','stone_used_kg'] loop
 total:=(p_payload->>field)::numeric;previous:=coalesce((to_jsonb(s)->>field)::numeric,0);expected:=(p_payload->'expected'->>field)::numeric;
 if total is null or expected is null or expected<>previous then raise exception 'Tussenstand is intussen gewijzigd; vernieuw en controleer je invoer';end if;
 if total<previous or (field in ('good','scrap','rework','stone_used_pieces') and total<>trunc(total)) then raise exception 'Vul een geldig totaal in, minimaal de al geregistreerde waarde. Gebruik correctie om aantallen te verlagen';end if;
 if field in ('good','scrap','rework') then v_payload:=jsonb_set(v_payload,array[field],to_jsonb(total-previous));end if;
 end loop;
 if (select count(*) from jsonb_array_elements(coalesce(p_payload->'materials','[]')))<>(select count(distinct (value->>'material_id',coalesce(value->>'kind','used'))) from jsonb_array_elements(coalesce(p_payload->'materials','[]'))) then raise exception 'Een artikel is dubbel ingevoerd';end if;
 for item in select value from jsonb_array_elements(coalesce(p_payload->'materials','[]')) loop
 if coalesce(item->>'kind','used') not in ('used','broken') then raise exception 'Onbekend materiaalverbruik';end if;
 select coalesce(sum(quantity),0) into previous from public.production_material_moves where session_id=s.id and material_id=(item->>'material_id')::uuid and kind=coalesce(item->>'kind','used');
 total:=(item->>'quantity')::numeric;expected:=(item->>'expected')::numeric;
 if expected is null or expected<>previous or total is null or total<previous then raise exception 'Materiaalverbruik gewijzigd of totaal te laag; controleer de invoer';end if;
 if total>previous then material_rows:=material_rows||jsonb_build_array(item||jsonb_build_object('quantity',total-previous));end if;
 end loop;
 select coalesce(sum(quantity),0) into previous from public.production_material_moves where session_id=s.id and kind='alabaster_scrap';
 loss:=(p_payload->>'stone_loss_kg')::numeric;expected:=(p_payload->'expected'->>'stone_loss_kg')::numeric;
 if loss is null or expected is null or expected<>previous or loss<previous then raise exception 'Albastuitval gewijzigd of totaal te laag';end if;
 v_payload:=v_payload||jsonb_build_object('materials',material_rows,'stone_loss_kg',loss-previous,'checkpoint_totals',p_payload-'expected');
 result:=public.production_command(p_request,action,v_payload,p_occurred_at);
 update public.production_sessions set stone_used_pieces=(p_payload->>'stone_used_pieces')::int,stone_used_kg=(p_payload->>'stone_used_kg')::numeric where id=s.id;
 return result;
end$$;
create or replace function public.production_monitor_snapshot() returns jsonb
language plpgsql stable security invoker set search_path='' as $$
begin
 if not public.portal_is_admin() then raise exception 'Log in met het planneraccount' using errcode='42501';end if;
 return public.production_cost_snapshot()||jsonb_build_object('checkpointContext',public.production_checkpoint_context());
end$$;
revoke all on function public.production_checkpoint_context(),public.production_checkpoint(uuid,jsonb,timestamptz),public.production_monitor_snapshot() from public,anon;
grant execute on function public.production_checkpoint_context(),public.production_checkpoint(uuid,jsonb,timestamptz),public.production_monitor_snapshot() to authenticated;
commit;

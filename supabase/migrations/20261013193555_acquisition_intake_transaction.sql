create function public.acquisition_submit_intake(p_hash text,p_request uuid,p_data jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare l public.acquisition_intake_links%rowtype;r public.acquisition_requests%rowtype;
begin
 select * into l from public.acquisition_intake_links where token_hash=p_hash for update;
 if not found or l.expires_at<=now() then raise exception 'De aanvraaglink is verlopen';end if;
 select * into r from public.acquisition_requests where request_id=p_request;
 if found then if r.prospect_id<>l.prospect_id then raise exception 'Ongeldig aanvraagnummer';end if;return jsonb_build_object('ok',true,'id',r.id);end if;
 if l.submissions>=10 then raise exception 'Maximum aantal aanvragen bereikt';end if;
 if jsonb_typeof(p_data)<>'object' or octet_length(p_data::text)>10000 or p_data->>'kind' not in ('sample','quote') or coalesce(trim(p_data->>'company'),'')='' or coalesce(trim(p_data->>'contact'),'')='' or coalesce(trim(p_data->>'email'),'')='' or coalesce(trim(p_data->>'description'),'')='' then raise exception 'Onvolledige aanvraag';end if;
 insert into public.acquisition_requests(prospect_id,request_id,kind,data) values(l.prospect_id,p_request,p_data->>'kind',p_data) returning * into r;
 update public.acquisition_intake_links set submissions=submissions+1 where token_hash=p_hash;
 update public.acquisition_prospects set status=case when r.kind='sample' then 'sample_requested' else 'quote_requested' end,revision=revision+1,updated_at=now() where id=l.prospect_id;
 update public.acquisition_outbox set status='stopped' where prospect_id=l.prospect_id and status in ('scheduled','drafted');
 insert into public.acquisition_events(prospect_id,kind,data) values(l.prospect_id,r.kind||'_requested',jsonb_build_object('request_id',r.id,'summary',case when r.kind='sample' then 'Sample aangevraagd via klantpagina' else 'Offerte aangevraagd via klantpagina' end));
 return jsonb_build_object('ok',true,'id',r.id);
end $$;
revoke all on function public.acquisition_submit_intake(text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.acquisition_submit_intake(text,uuid,jsonb) to service_role;

begin;
-- Tests are rolled back; no customer or production records are changed.
create temporary table acq_test_ids as select user_id as admin_id from public.portal_admins limit 1;
insert into public.acquisition_prospects(id,domain,company,review_day,data) values('10000000-0000-4000-8000-000000000001','acquisition-test.invalid','Test prospect',current_date,'{"website":"https://acquisition-test.invalid"}');
select set_config('request.jwt.claims',json_build_object('sub',(select admin_id from acq_test_ids),'role','authenticated')::text,true);
set local role authenticated;
select public.acquisition_save_settings(0,'{"company":"Test setup"}');
select public.acquisition_review('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001',0,'approved','Eigen collectie');
-- Repeat request returns previous result; no additional event or revision.
select public.acquisition_review('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001',0,'approved','Eigen collectie');
do $$begin
 begin perform public.acquisition_save_settings(0,'{}');raise exception 'Stale save unexpectedly succeeded';exception when serialization_failure then null;end;
 if (select count(*) from public.acquisition_events where request_id='20000000-0000-4000-8000-000000000001')<>1 then raise exception 'Duplicate review event';end if;
 if (select revision from public.acquisition_prospects where id='10000000-0000-4000-8000-000000000001')<>1 then raise exception 'Duplicate review revision';end if;
 begin perform public.acquisition_save_settings(1,'{"password":"not-stored"}');raise exception 'Credential unexpectedly accepted';exception when raise_exception then if sqlerrm='Credential unexpectedly accepted' then raise;end if;end;
end$$;
reset role;
-- A signed-in customer / unlisted user sees no acquisition records.
select set_config('request.jwt.claims','{"sub":"30000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
set local role authenticated;
do $$begin
 if exists(select 1 from public.acquisition_settings) then raise exception 'Non-admin can see settings';end if;
 if exists(select 1 from public.acquisition_prospects) then raise exception 'Non-admin can see prospects';end if;
 begin perform public.acquisition_save_settings(0,'{}');raise exception 'Unauthorized write accepted';exception when insufficient_privilege then null;end;
 begin perform 1 from public.acquisition_connections;raise exception 'Tokens exposed';exception when insufficient_privilege then null;end;
end$$;
reset role;
insert into public.acquisition_intake_links(token_hash,prospect_id,expires_at) values('test-hash','10000000-0000-4000-8000-000000000001',now()+interval '1 day');
set local role service_role;
select public.acquisition_submit_intake('test-hash','40000000-0000-4000-8000-000000000001','{"kind":"quote","company":"Test","contact":"Buyer","email":"buyer@example.invalid","description":"Shade","quantity":50}');
select public.acquisition_submit_intake('test-hash','40000000-0000-4000-8000-000000000001','{"kind":"quote","company":"Test","contact":"Buyer","email":"buyer@example.invalid","description":"Shade","quantity":50}');
do $$begin
 if (select submissions from public.acquisition_intake_links where token_hash='test-hash')<>1 then raise exception 'Duplicate intake';end if;
 if (select count(*) from public.acquisition_requests where request_id='40000000-0000-4000-8000-000000000001')<>1 then raise exception 'Duplicate request';end if;
end$$;
reset role;
rollback;
select 'acquisition database tests passed; changes rolled back' as result;

create or replace function planner_recovery.guard_metadata_lists()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare k text; old_list jsonb; new_list jsonb; baseline jsonb;
begin
 if current_setting('ralabaster.restore_mode',true)='on' and current_user='postgres' then return new; end if;
 foreach k in array array['customers','productTemplates','orderConfirmations','aiDecisionLog'] loop
  old_list := old.data->k; new_list := new.data->k; baseline := new.data->'metadataWriteBaseline'->k;
  if jsonb_typeof(old_list)='array' and jsonb_array_length(old_list)>0 and
     (new_list is null or jsonb_typeof(new_list)<>'array' or new_list='[]'::jsonb) and
     baseline is distinct from old_list then
   new.data := jsonb_set(new.data,array[k],old_list,true);
  end if;
 end loop;
 new.data := new.data-'metadataWriteBaseline';
 return new;
end $$;
revoke all on function planner_recovery.guard_metadata_lists() from public,anon,authenticated;
create trigger planner_preserve_metadata_lists before update on public.planner_shared_state
for each row execute function planner_recovery.guard_metadata_lists();

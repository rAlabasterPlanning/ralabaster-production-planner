do $$
declare f record; definition text; patched text;
begin
 for f in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('apply_ai_task_changes','apply_ai_record_changes')
 loop
  definition:=pg_get_functiondef(f.oid);
  patched:=replace(definition, 'jsonb_build_object(''deleted'',true)', 'jsonb_build_object(''deleted'',true,''deletedAt'',v_now)');
  patched:=replace(patched, 'jsonb_build_object(''deleted'',true,''updatedBy'',''chatgpt-agent'')', 'jsonb_build_object(''deleted'',true,''deletedAt'',v_now,''updatedBy'',''chatgpt-agent'')');
  if patched=definition then raise exception 'Expected deletion branch was not found'; end if;
  execute patched;
 end loop;
end $$;

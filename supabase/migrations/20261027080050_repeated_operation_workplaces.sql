-- Keep the physical workplace separate from each occurrence's editable label.
do $migration$
declare definition text;
begin
 select pg_get_functiondef(p.oid) into strict definition
 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname='planner_accept_quote_v2';
 if strpos(definition,'''machine'',op->>''name''')=0 then
  raise exception 'Unexpected quotation acceptance definition; inspect before changing';
 end if;
 definition:=replace(definition,'''machine'',op->>''name''',
  '''machine'',coalesce(nullif(op->>''machine'',''''),op->>''name''),''operationInstanceId'',op->>''id'',''sourceOpId'',coalesce(op->>''sourceOpId'',op->>''id'')');
 execute definition;
end;
$migration$;

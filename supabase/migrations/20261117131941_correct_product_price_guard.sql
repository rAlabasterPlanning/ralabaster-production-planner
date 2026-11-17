create or replace function portal_private.guard_product_prices()
returns trigger language plpgsql set search_path='' as $$
declare incoming jsonb; previous jsonb; merged jsonb='[]'::jsonb;
begin
 if new.workspace_id<>'ralabaster' then return new; end if;
 for incoming in select value from jsonb_array_elements(coalesce(new.data->'productTemplates','[]')) loop
  select value into previous from jsonb_array_elements(coalesce(old.data->'productTemplates','[]')) where value->>'id'=incoming->>'id' limit 1;
  if previous is not null and coalesce(incoming->>'updated','') < coalesce(previous->>'updated','') then
   incoming=incoming || jsonb_build_object('saleUnit',previous->'saleUnit','manualSalePrice',previous->'manualSalePrice','updated',previous->'updated');
  end if;
  merged=merged || jsonb_build_array(incoming);
 end loop;
 new.data=jsonb_set(new.data,'{productTemplates}',merged);
 return new;
end $$;

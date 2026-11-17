create or replace function portal_private.guard_product_prices()
returns trigger language plpgsql set search_path='' as $$
declare merged jsonb;
begin
 if new.workspace_id<>'ralabaster' then return new; end if;
 select jsonb_agg(
  case when previous.p is not null
    and coalesce(incoming.p->>'updated','') < coalesce(previous.p->>'updated','')
    then incoming.p || jsonb_build_object('saleUnit',previous.p->'saleUnit','manualSalePrice',previous.p->'manualSalePrice','updated',previous.p->'updated')
    else incoming.p end order by incoming.ord)
 into merged
 from jsonb_array_elements(coalesce(new.data->'productTemplates','[]')) with ordinality incoming(p,ord)
 left join lateral (select p from jsonb_array_elements(coalesce(old.data->'productTemplates','[]')) p where p->>'id'=incoming.p->>'id' limit 1) previous on true;
 if merged is not null then new.data=jsonb_set(new.data,'{productTemplates}',merged); end if;
 return new;
end $$;
revoke all on function portal_private.guard_product_prices() from public,anon,authenticated;
create trigger zz_guard_product_prices before update on public.planner_shared_state for each row execute function portal_private.guard_product_prices();

create or replace function portal_private.product_card_portal_price()
returns trigger language plpgsql security definer set search_path='' as $$
declare card jsonb; fixed numeric;
begin
 select p into card from public.planner_shared_state s cross join lateral jsonb_array_elements(s.data->'productTemplates') p
 where s.workspace_id='ralabaster' and p->>'id'=new.source_template_id limit 1;
 fixed=coalesce(nullif(card->>'manualSalePrice','')::numeric,nullif(card->>'saleUnit','')::numeric);
 if fixed is not null then new.unit_price=fixed; new.price_tiers='[]'::jsonb; end if;
 return new;
end $$;
revoke all on function portal_private.product_card_portal_price() from public,anon,authenticated;
create trigger portal_product_card_price before insert or update on public.portal_products for each row execute function portal_private.product_card_portal_price();

create or replace function portal_private.sync_product_card_prices()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.workspace_id='ralabaster' and new.data->'productTemplates' is distinct from old.data->'productTemplates' then
 update public.portal_products p set unit_price=coalesce(nullif(card->>'manualSalePrice','')::numeric,nullif(card->>'saleUnit','')::numeric),
 price_tiers='[]'::jsonb,updated_at=clock_timestamp()
 from jsonb_array_elements(new.data->'productTemplates') card
 where p.source_template_id=card->>'id'
 and coalesce(nullif(card->>'manualSalePrice','')::numeric,nullif(card->>'saleUnit','')::numeric) is not null
 and (p.unit_price is distinct from coalesce(nullif(card->>'manualSalePrice','')::numeric,nullif(card->>'saleUnit','')::numeric) or p.price_tiers<>'[]'::jsonb);
 end if;
 return new;
end $$;
revoke all on function portal_private.sync_product_card_prices() from public,anon,authenticated;
create trigger zz_sync_product_card_prices after update on public.planner_shared_state for each row execute function portal_private.sync_product_card_prices();

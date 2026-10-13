-- Read-only cost context. The existing workfloor registration RPCs stay unchanged.
begin;
create or replace function public.production_cost_snapshot() returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare meta jsonb;
begin
 if not public.portal_is_admin() then raise exception 'Log in met het planneraccount' using errcode='42501';end if;
 select data into meta from public.planner_shared_state where workspace_id='ralabaster';
 return public.production_snapshot()||jsonb_build_object(
 'costOrders',coalesce((select jsonb_agg(jsonb_build_object('id',o.order_id,'orderNo',o.order_no,'qty',o.data->'qty','costing',o.data->'costing','templateOps',(select t->'ops' from jsonb_array_elements(coalesce(meta->'productTemplates','[]'))t where t->>'id'=o.data->>'productTemplateId' limit 1))) from public.planner_orders_v2 o where o.workspace_id='ralabaster' and not o.deleted),'[]'),
 'costTasks',coalesce((select jsonb_agg(q.data||jsonb_build_object('id',q.task_id,'orderId',q.order_id,'machine',q.machine,'status',q.status,'type',q.task_type)) from public.planner_tasks_v2 q where q.workspace_id='ralabaster' and not q.deleted),'[]'),
 'costHistory',coalesce((select jsonb_agg(to_jsonb(h)) from (
  select s.order_id,s.workplace_name,s.task_id,min(s.started_at) as started_at,max(s.ended_at) as last_at,sum(s.good) as good,sum(s.scrap) as scrap,
   sum(coalesce(p.production,0)) as production,sum(coalesce(p.setup,0)) as setup,sum(coalesce(p.downtime,0)) as downtime,sum(coalesce(p.waiting,0)) as waiting,
   sum(coalesce(l.production,0)) as labor_production,sum(coalesce(l.setup,0)) as labor_setup,sum(coalesce(l.downtime,0)) as labor_downtime,sum(coalesce(l.waiting,0)) as labor_waiting
  from public.production_sessions s
  left join lateral(select
   sum(public.production_minutes(p.started_at,least(coalesce(p.ended_at,s.ended_at),s.auto_end),s.workplace_type<>'machine' and p.phase in ('production','setup'))) filter(where p.phase='production') as production,
   sum(public.production_minutes(p.started_at,least(coalesce(p.ended_at,s.ended_at),s.auto_end),s.workplace_type<>'machine' and p.phase in ('production','setup'))) filter(where p.phase='setup') as setup,
   sum(public.production_minutes(p.started_at,least(coalesce(p.ended_at,s.ended_at),s.auto_end),false)) filter(where p.phase='downtime') as downtime,
   sum(public.production_minutes(p.started_at,least(coalesce(p.ended_at,s.ended_at),s.auto_end),false)) filter(where p.phase='waiting') as waiting
   from public.production_phases p where p.session_id=s.id)p on true
  left join lateral(select
   sum(public.production_minutes(greatest(p.started_at,l.started_at),least(coalesce(p.ended_at,s.ended_at),s.auto_end,coalesce(l.ended_at,l.stop_at),l.stop_at),true)/cardinality(l.session_ids)) filter(where p.phase='production') as production,
   sum(public.production_minutes(greatest(p.started_at,l.started_at),least(coalesce(p.ended_at,s.ended_at),s.auto_end,coalesce(l.ended_at,l.stop_at),l.stop_at),true)/cardinality(l.session_ids)) filter(where p.phase='setup') as setup,
   sum(public.production_minutes(greatest(p.started_at,l.started_at),least(coalesce(p.ended_at,s.ended_at),s.auto_end,coalesce(l.ended_at,l.stop_at),l.stop_at),true)/cardinality(l.session_ids)) filter(where p.phase='downtime') as downtime,
   sum(public.production_minutes(greatest(p.started_at,l.started_at),least(coalesce(p.ended_at,s.ended_at),s.auto_end,coalesce(l.ended_at,l.stop_at),l.stop_at),true)/cardinality(l.session_ids)) filter(where p.phase='waiting') as waiting
   from public.production_phases p join public.production_labor l on s.id=any(l.session_ids) and l.superseded_at is null and l.started_at<least(coalesce(p.ended_at,s.ended_at),s.auto_end) and coalesce(l.ended_at,l.stop_at)>p.started_at where p.session_id=s.id)l on true
  where s.ended_at is not null group by s.order_id,s.workplace_name,s.task_id
 )h),'[]'),
 'costMaterialTotals',coalesce((select jsonb_agg(to_jsonb(m)) from (
  select order_id,workplace_name,sum(quantity*unit_cost) as cost,count(*) filter(where unit_cost is null or unit_cost<=0) as unpriced
  from public.production_material_moves where kind in ('used','broken') group by order_id,workplace_name
 )m),'[]')
 );
end$$;
revoke all on function public.production_cost_snapshot() from public,anon;
grant execute on function public.production_cost_snapshot() to authenticated;
commit;

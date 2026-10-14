-- Schuren en polijsten vormen voortaan één handmatige bewerking.
-- Alleen open taken worden samengevoegd; afgeronde taken blijven als historie bestaan.

create temporary table _finishing_merge on commit drop as
with finishing as (
  select
    workspace_id,
    order_id,
    task_id,
    seq,
    row_number() over (partition by workspace_id, order_id order by seq, task_id) as rn,
    first_value(task_id) over (partition by workspace_id, order_id order by seq, task_id) as keeper_id
  from public.planner_tasks_v2
  where workspace_id = 'ralabaster'
    and deleted = false
    and coalesce(status, 'open') not in ('done', 'completed')
    and coalesce(nullif(data->>'name', ''), machine) ~* '^(Schuren|Polijsten)$'
)
select
  f.*,
  sum(coalesce((t.data->>'estimate')::numeric, 0)) over (partition by f.workspace_id, f.order_id) as merged_estimate,
  sum(coalesce((t.data->>'actual')::numeric, 0)) over (partition by f.workspace_id, f.order_id) as merged_actual,
  max(coalesce((t.data->>'doneQty')::numeric, 0)) over (partition by f.workspace_id, f.order_id) as merged_done_qty,
  sum(coalesce((t.data->>'orderCalcMinutes')::numeric, 0)) over (partition by f.workspace_id, f.order_id) as merged_order_minutes,
  sum(coalesce((t.data->>'costMinutes')::numeric, 0)) over (partition by f.workspace_id, f.order_id) as merged_cost_minutes
from finishing f
join public.planner_tasks_v2 t
  on t.workspace_id = f.workspace_id and t.task_id = f.task_id;

update public.planner_tasks_v2 t
set machine = 'Schuren & polijsten',
    data = jsonb_set(
      jsonb_set(
        jsonb_set(
          jsonb_set(
            jsonb_set(
              jsonb_set(t.data, '{name}', to_jsonb('Schuren & polijsten'::text), true),
              '{machine}', to_jsonb('Schuren & polijsten'::text), true
            ),
            '{estimate}', to_jsonb(m.merged_estimate), true
          ),
          '{actual}', to_jsonb(m.merged_actual), true
        ),
        '{doneQty}', to_jsonb(m.merged_done_qty), true
      ),
      '{orderCalcMinutes}', to_jsonb(m.merged_order_minutes), true
    ) || jsonb_build_object('costMinutes', m.merged_cost_minutes),
    updated_at = now()
from _finishing_merge m
where m.rn = 1
  and t.workspace_id = m.workspace_id
  and t.task_id = m.task_id;

update public.planner_tasks_v2 t
set deleted = true,
    status = 'deleted',
    data = t.data || jsonb_build_object(
      'deleted', true,
      'deletedAt', now(),
      'mergedIntoTaskId', m.keeper_id
    ),
    updated_at = now()
from _finishing_merge m
where m.rn > 1
  and t.workspace_id = m.workspace_id
  and t.task_id = m.task_id;

-- Houd bestaande lopende registraties bruikbaar en bundel de rapportage onder één naam.
update public.production_sessions
set workplace_name = 'Schuren & polijsten'
where workspace_id = 'ralabaster' and workplace_name ~* '^(Schuren|Polijsten)$';

update public.production_material_moves
set workplace_name = 'Schuren & polijsten'
where workspace_id = 'ralabaster' and workplace_name ~* '^(Schuren|Polijsten)$';

update public.production_task_progress
set workplace_name = 'Schuren & polijsten'
where workspace_id = 'ralabaster' and workplace_name ~* '^(Schuren|Polijsten)$';

update public.production_opening_balances
set workplace_name = 'Schuren & polijsten'
where workspace_id = 'ralabaster' and workplace_name ~* '^(Schuren|Polijsten)$';

update public.production_workplace_incidents
set workplace_name = 'Schuren & polijsten'
where workspace_id = 'ralabaster' and workplace_name ~* '^(Schuren|Polijsten)$';

-- Eén werkplek in de gedeelde stamdata; behoud het eerste bestaande id.
with source as (
  select s.workspace_id, w.value as workplace, w.ordinality as ord,
         min(w.ordinality) filter (where coalesce(w.value->>'name', '') ~* '^(Schuren|Polijsten|Schuren & polijsten)$') over (partition by s.workspace_id) as first_finishing
  from public.planner_shared_state s
  cross join lateral jsonb_array_elements(coalesce(s.data->'workplaces', '[]'::jsonb)) with ordinality w(value, ordinality)
  where s.workspace_id = 'ralabaster'
), rebuilt as (
  select workspace_id,
         jsonb_agg(
           case when ord = first_finishing then
             jsonb_set(
               jsonb_set(
                 jsonb_set(workplace, '{name}', to_jsonb('Schuren & polijsten'::text), true),
                 '{active}', 'true'::jsonb, true
               ),
               '{preferredEmployees}', '["Shaffi","Youri","Peter"]'::jsonb, true
             )
           else workplace end
           order by ord
         ) as workplaces
  from source
  where workplace->>'name' !~* '^(Schuren|Polijsten|Schuren & polijsten)$' or ord = first_finishing
  group by workspace_id
)
update public.planner_shared_state s
set data = jsonb_set(
             jsonb_set(s.data, '{workplaces}', r.workplaces, true),
             '{workplacePreferenceDefaultsVersion}', '3'::jsonb, true
           ),
    updated_at = now()
from rebuilt r
where s.workspace_id = r.workspace_id;

-- Voeg dubbele bewerkingen in producttemplates en nog niet omgezette offertes samen.
with rebuilt as (
  select s.workspace_id,
         jsonb_agg(
           jsonb_set(p.value, '{ops}', coalesce((
             select jsonb_agg(x.op order by x.ord)
             from (
               select o.value as op, o.ordinality as ord
               from jsonb_array_elements(coalesce(p.value->'ops', '[]'::jsonb)) with ordinality o(value, ordinality)
               where coalesce(o.value->>'name', '') !~* '^(Schuren|Polijsten|Schuren & polijsten)$'
               union all
               select jsonb_set(
                        jsonb_set((array_agg(o.value order by o.ordinality))[1], '{name}', to_jsonb('Schuren & polijsten'::text), true),
                        '{minutes}', to_jsonb(sum(coalesce((o.value->>'minutes')::numeric, 0))), true
                      ) as op,
                      min(o.ordinality) as ord
               from jsonb_array_elements(coalesce(p.value->'ops', '[]'::jsonb)) with ordinality o(value, ordinality)
               where coalesce(o.value->>'name', '') ~* '^(Schuren|Polijsten|Schuren & polijsten)$'
               having count(*) > 0
             ) x
           ), '[]'::jsonb), true)
           order by p.ordinality
         ) as product_templates
  from public.planner_shared_state s
  cross join lateral jsonb_array_elements(coalesce(s.data->'productTemplates', '[]'::jsonb)) with ordinality p(value, ordinality)
  where s.workspace_id = 'ralabaster'
  group by s.workspace_id
)
update public.planner_shared_state s
set data = jsonb_set(s.data, '{productTemplates}', r.product_templates, true), updated_at = now()
from rebuilt r
where s.workspace_id = r.workspace_id;

with rebuilt as (
  select s.workspace_id,
         jsonb_agg(
           jsonb_set(q.value, '{ops}', coalesce((
             select jsonb_agg(x.op order by x.ord)
             from (
               select o.value as op, o.ordinality as ord
               from jsonb_array_elements(coalesce(q.value->'ops', '[]'::jsonb)) with ordinality o(value, ordinality)
               where coalesce(o.value->>'name', '') !~* '^(Schuren|Polijsten|Schuren & polijsten)$'
               union all
               select jsonb_set(
                        jsonb_set((array_agg(o.value order by o.ordinality))[1], '{name}', to_jsonb('Schuren & polijsten'::text), true),
                        '{minutes}', to_jsonb(sum(coalesce((o.value->>'minutes')::numeric, 0))), true
                      ) as op,
                      min(o.ordinality) as ord
               from jsonb_array_elements(coalesce(q.value->'ops', '[]'::jsonb)) with ordinality o(value, ordinality)
               where coalesce(o.value->>'name', '') ~* '^(Schuren|Polijsten|Schuren & polijsten)$'
               having count(*) > 0
             ) x
           ), '[]'::jsonb), true)
           order by q.ordinality
         ) as quotes
  from public.planner_shared_state s
  cross join lateral jsonb_array_elements(coalesce(s.data->'quotes', '[]'::jsonb)) with ordinality q(value, ordinality)
  where s.workspace_id = 'ralabaster'
  group by s.workspace_id
)
update public.planner_shared_state s
set data = jsonb_set(s.data, '{quotes}', r.quotes, true), updated_at = now()
from rebuilt r
where s.workspace_id = r.workspace_id;

-- De JSON-cache volgt exact de genormaliseerde, actieve taken.
update public.planner_shared_state s
set data = jsonb_set(
             s.data,
             '{tasks}',
             coalesce((
               select jsonb_agg(t.data order by t.order_id, t.seq, t.task_id)
               from public.planner_tasks_v2 t
               where t.workspace_id = s.workspace_id and t.deleted = false
             ), '[]'::jsonb),
             true
           ),
    updated_at = now()
where s.workspace_id = 'ralabaster';

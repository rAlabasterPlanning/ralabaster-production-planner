# rAlabaster Productieplanner — Project Context

_Last updated: 2026-09-22_

## Purpose

This repository contains the temporary/operational rAlabaster production planner used until Odoo fully covers the workflow. It is a browser-based production planning / lightweight ERP app deployed on Vercel, backed by Supabase, with GitHub as the source of truth for code.

The planner must stay fast, simple, and practical for daily production use. The user often tests changes directly in production and gives immediate feedback.

## Core architecture

- Frontend: static HTML/CSS/JS.
- Deployment: Vercel, main branch auto-deploys.
- Database: Supabase.
- Source repo: `rAlabasterPlanning/ralabaster-production-planner`.
- Main app state was historically stored in `planner_shared_state`; operational order/task data has been migrated to normalized tables.
- Normalized operational tables:
  - `planner_orders_v2`
  - `planner_tasks_v2`
- `planner_shared_state` is metadata-only and uses `normalizedVersion = 2`.
- Performance layer: `assets/performance-v1.js`.
- Workplace metadata (`workplaces`, `maintenanceRecords`, `toolItems`,
  `toolCostEntries`) remains in `planner_shared_state`; normalized orders/tasks
  stay in their existing v2 tables.
- `assets/ai-planner-v1.js` owns the conversational AI tab, Dutch browser speech
  input and explicit approval flow for proposed task changes.
- `api/ai-planner.mjs` reads the authorized Supabase snapshot and may return a
  bounded `proposal`; it never writes to Supabase directly.

## Workplace operations

- `Werkplekken` owns central hourly cost, target rate, capacity, setup time and
  employee preference order.
- Machine KPIs combine planned/completed task time with maintenance and allocated
  tooling costs for the selected week/month/year.
- `Gereedschap` tracks compact operational stock and allocates invoices across
  one or more machines. SnelStart remains the accounting system.

## Non-negotiable performance rules

1. Never run expensive planning scenarios during normal rendering/navigation.
2. Never run full-factory optimization merely because a tab is opened.
3. Heavy calculations are allowed only after a real planning action or explicit optimization request.
4. Avoid broad `MutationObserver` handlers on `document.body` / whole `main` that rescan the DOM after every mutation.
5. UI/navigation must remain responsive while Supabase synchronizes.
6. Cloud persistence must happen in the background and must not block navigation.
7. Use normalized order/task persistence; do not reintroduce full operational-state snapshot syncing.
8. For scale, render only visible/current-page data where possible.
9. Target: ordinary navigation and opening an order should feel immediate (~0.2–0.5 s on a normal machine).

### Performance incident to remember

On 2026-09-11 the app became very slow because:

- `renderOrders()` automatically called a full `scenario()` calculation that recalculated production 3 times (normal / Peter / Saturday overtime).
- availability code installed a global `MutationObserver` that repeatedly rescanned task cards.
- product batching also used a global mutation observer.

These were removed/reworked. Do not reintroduce these patterns.

## Production/planning rules

### Employees / work hours

- Monday–Thursday: 08:15–16:30 = 495 min/day.
- Friday: only Ralph, 08:15–15:00 = 405 min/day.
- Saturday: optional overtime 08:00–12:00; not standard capacity.
- Sunday: no production.
- Employees: Ralph, Peter, Kaan, Lance, Shaffi.
- Setup tasks are normally assigned to Ralph.

### Special process behavior

- `Droogruimte`: no employee capacity; fixed wait process, 24/7.
- Standard external operation lead time: 14 calendar days unless overridden.
- External operations do not consume internal employee capacity.
- Hard process sequence must be preserved.
- Started/completed/locked tasks must not be silently moved by re-planning.

### Deadline model

- Customer/communicated deadline can include a delivery buffer.
- Internal target is normally 3 calendar days before hard maximum date.
- Existing code uses fields such as:
  - `quotedEstimatedReadyDate`
  - `communicatedDeadline`
  - `maximumReadyDate`
  - `internalTargetDate`
  - `deadline`

### Mori flexibility

- Work intended for Mori ZL15 #1/#2 may be scheduled on ZL15 #1, ZL15 #2 or SL25 if allowed by the planner.
- Work explicitly designated for SL25 stays on SL25.

### Product batching

- Identical products may be grouped when this does not compromise hard deadlines.
- Repeated setup may be shared/removed only when the planner verifies it is safe.
- Batching runs only when explicitly requested or when a real planning action requires it — never on passive render.

## Order / calculation workflow

Desired workflow:

`Orders → Open order → Naar calculatie → edit existing order → Opslaan naar order → re-plan remaining movable tasks → return to order`

Important rules:

- Editing an existing order must not create a duplicate order.
- Standard behavior changes only that order.
- Optional checkbox allows updating the product template for future orders.
- Existing completed/started tasks are preserved.
- Remaining open/movable steps are recalculated/replanned after saving.
- Product steps should preferably use known standard operations rather than free-form text, to avoid machine-name inconsistencies.

Relevant files include:

- `assets/order-calculation-bridge-v1.js`
- `assets/order-calculation-button-fix-v1.js`
- `assets/calculator.js`
- `assets/erp.js`

## Internal expected ready date

`internalExpectedDate` should represent the current expected production-ready date for the order.

- For a fully planned route, derive it from the last actual planned process finish date.
- If future steps are still unplanned, use an exact planning calculation where needed.
- Update after real planning changes; do not perform full expensive forecasting on every screen render.
- Existing imported Excel orders also need this value populated.

Relevant file:

- `assets/internal-ready-date-v1.js`

## Excel import

The first bulk import used an Excel workbook and created a set of active orders and tasks.

Important: never blindly re-import or restore an old snapshot, because the live user may already have modified/deleted/replanned records afterwards.

Known import mapping includes:

- material cost → order/product material cost
- external cost → expected external cost
- incoming external steps may represent long incoming lead times

Relevant files:

- `assets/bulk-excel-import-v1.js`
- `assets/bulk-excel-gildemeister-v1.js`

## Mobile / iPad UI

The app should remain usable on phone and iPad.

Principles:

- touch-friendly controls
- no hover-only interactions
- forms 1 column on phones, 2 columns where useful on iPad
- horizontal scrolling for wide planning/table views rather than shrinking to unreadable sizes
- modals near-fullscreen on mobile
- prevent unwanted Safari input zoom
- respect safe areas

Relevant file:

- `assets/mobile-responsive-v1.css`

## Supabase / sync rules

- Normalized tables are the operational source for orders/tasks.
- Do not put full orders/tasks back into the metadata snapshot.
- Local UI actions should feel immediate.
- Sync changed records asynchronously.
- Avoid a full state reload after every save.
- Cloud refresh must not block rendering/navigation.

## UX philosophy

The planner is used in production, not as a demo. Prefer:

- fewer clicks
- clear labels
- direct actions
- safe defaults
- visible order context
- no hidden destructive behavior
- performance over decorative complexity

## AI production leader

- `assets/ai-planner-v1.js` provides the first observer/advisor phase.
- The server endpoint now reloads the authoritative Supabase metadata plus all
  normalized order/task records for every AI question. The browser does not
  decide which records the AI may see.
- Full read scope covers active and archived orders, tasks and planning,
  customers, quotations, calculations, products, workplaces, maintenance,
  tooling, operational machine costs, staff absence, history and AI decisions.
- Supabase RLS and the signed-in user's JWT remain the authorization boundary;
  no service-role key is exposed or used.
- The client keeps a compact fallback snapshot, shows risks/capacity/batch
  opportunities, offers a planning conversation, and stores feedback and manual planning changes
  as metadata (`aiDecisionLog`, `aiPlannerRules`, `aiPlannerMessages`).
- The deterministic planner remains authoritative for hard constraints and all
  actual planning changes.
- The AI endpoint is `api/ai-planner.mjs`, requires a valid Supabase session, and
  uses Vercel AI Gateway. Never expose AI credentials in the browser.
- Passive navigation must not run full planning scenarios. The AI view uses
  lightweight current-state analysis and only opens the existing concept planner
  after an explicit user action.

## Development workflow for ChatGPT / future sessions

Before making changes:

1. Read this file.
2. Read `DECISIONS.md`.
3. Read `CHANGELOG.md` for latest work.
4. Fetch the current version/SHA of every file that will be edited.
5. Do not rely on stale code from an older chat summary.
6. Preserve data and planning semantics unless the user explicitly asks to change them.
7. For risky or architectural changes, first explain exactly what will change and wait for explicit user approval.

## User interaction rule

The user prefers that substantive code/system changes are not made until the proposed change has been explained and they explicitly say something equivalent to `doe`, `bouwen`, `ja`, `let's go`, etc.

After approval, implement directly through the connected tools with minimal manual steps for the user.

## 2026-10-12 — Live production floor

- `/productie` is the shared production screen: employees left, physical workplaces in the middle, all active orders on the right, live session timers; `/productie?overzicht=1` opens the automatic day/week KPI report. Same existing Vercel project, same planner-admin auth storage key. Never expose operational data without the existing admin authorization.
- `assets/production-core.js` contains Amsterdam timezone/break calculations, workplace matching and deterministic reporting; `production-floor.js` handles the dedicated screen without loading the main planning engine.
- Normalized production tables: `production_sessions`, `production_phases`, `production_labor`, `production_attendance`, `production_events`, `production_task_baselines`. RLS is admin-only, workspace restricted; events append-only. Public RPCs are security invoker. Commands are transactional/idempotent and serialized to prevent two operators occupying one machine.
- Automatic labor breaks 10:00–10:15 and 12:15–12:45. Machine/stoppage clocks are independent. Concurrent engaged assignments share labor equally; total employee time is counted once. Shift-end caps prevent overnight accumulation and mark forgotten registrations for review. Friday follows existing Ralph-only schedule; explicit overtime is supported.
- Good/scrap/rework are incremental per operation; good counts and allocated labor update existing task progress with authoritative revision timestamps. Baselines retain the original estimate and preserve progress registered via other screens. A whole operation completes only on explicit confirmation; orders are not automatically closed.
- KPI finish dates are explicitly indicative (extra hours / 7.5 hours per weekday above the existing planned finish), not full factory replanning. No automatic schedule writes. Per-operation counts must not be interpreted as finished end-product totals.
- Offline commands retain UUIDs in a durable local queue; validation conflicts require review. Pending actions are visibly unconfirmed until accepted by Supabase. Database-backed clocks survive reload; multiple devices poll every 15 seconds.
- Existing hourly/daily backups now include production ledgers. Restoring planner snapshots does not delete production audit history.
- Tests: `production-floor.test.cjs`, `production-floor-db.sql` (transactional rollback fixture), `production-floor-browser.cjs` (Playwright with synthetic RPCs, TV/iPad/phone).

## Completion/deadline sync protection (2026-10-12)

Pending startup must not unconditionally merge cached operational rows over newer cloud revisions. `mergeOperationalRows` preserves authoritative completion/deadline/progress groups using the existing read baseline. Archived order IDs are fetched separately to exclude cached active copies. Deadline writes carry `deadlineWriteBase` matching the read revision; the database rejects fresh restamps from obsolete clients. Returned authoritative server fields replace a rejected attempted patch if the live values have not changed during the request. Completed orders require explicit `reopenedAt` and `reopenReason` to reopen; a browser sync is never a reopening action. For incident repair, restore individual proven fields from the latest good per-record snapshot, not the full snapshot.

## 2026-10-12 — Order-first production floor
- Floor start flow is employee → physical workplace → order, with no required operation selection. Order-level sessions keep `task_id` null; logged time and quantities must not silently mark a route operation complete.
- All active orders remain selectable. Earlier unfinished operations for the earliest matching workplace operation are shown as a reminder, with skip or explicit individually checked “already completed”. Completion checks use the read task revision, preserve recorded actual minutes, and are audited in the start event. Archived/deleted orders remain excluded.
- Floor presentation uses gray/white and the planner's system font; red/amber remain status signals.
- Remaining quantity and pace are calculated per order and workplace stage; Mori machines share the same stage to count simultaneous banks once. Good quantities reduce the required count, scrap does not. Production phases only determine pace; setup, downtime and waiting are excluded. Daily target = today's good + estimated output in remaining registered shift capacity, capped at required quantity. Older production is retained by historical aggregates outside the 30-day snapshot. Typical next-workday target is explicitly indicative; it assumes the currently active number of machines and normal hours.
- Whole-order completion forecasting remains unassigned for order-level time because the complete production route is not measured. Do not show a measured whole-route completion estimate or mark the order completed automatically.

## Workstation filtering and persistent incidents
- Select only active orders with unfinished compatible route work for the selected workplace, independent of predecessor readiness. Mori ZL15 #1 work can run on #2 or SL25; explicit SL25-only routes retain that constraint. Setup on #1 is not a requirement to produce exclusively on #1. The backend validates the same route match.
- `production_workplace_incidents` records downtime until explicit resolve, without a shift end. `production_workplace_events` is immutable and idempotent. Incidents block new work and resuming production/setup; existing employee labor pauses on that workplace. Release does not automatically resume work. Backups include both tables.
- Incident identity, employee, workplace, reason/details and timestamps provide attachment points for later material/tool usage. No material quantities or stock movements are inferred today.

## 2026-10-12 — Consumption, supplies stock and next-operation proposals
- `production_materials` catalogue has explicit known/unknown stock, unit, minimum, unit price, workplace scopes and stock revision. Ten sanding discs are predefined: P80/120/180/240/320 × diameter 90/150 mm, with unknown stock and no guessed minimum. Insert types wait for the user's photos/counts.
- Supply use is recorded since the prior report at quantities, stopping, day close and setup completion. Movements are append-only, linked to registration, order, workplace and employee, with price-at-use and used/broken distinction. Stock deduction and production command succeed atomically and retries are idempotent. Reused already-booked supplies must not be booked again.
- Stocktake uses a read revision; deliveries add stock; counts replace it with a recorded delta. Actual use may reveal negative stock, which is highlighted rather than erasing real consumption. Unknown stock remains unknown until counted. Minimum/price changes also require the read revision.
- Scrap products remain existing count events; optional alabaster scrap kg has its own movement with zero stock delta to avoid double deduction from the separate stone inventory.
- Explicit completion of order-level workplace production requires enough good output and no other running session for the same stage, completes the compatible production route task and logs the action. Merely stopping does not complete the route. After completion, propose the next open internal operation; starting still requires confirmation.
- `/productie` has supplies management and period consumption report; scheduled backups include catalogue, movements and request idempotency records.

## 2026-10-13 — Historical floor entry
- `production_backfill` accepts a previous Amsterdam workday, max 30 days back, explicit interval, employee, physical workplace, order, quantities, stones used (pieces/kg), optional tools/consumables and scrap kg. A note is required. Records are closed and tagged `is_backfill`; events use the workday as `occurred_at` and preserve the actual entry timestamp separately.
- Existing registrations may receive extra counts/materials with the original times preserved and expected-count validation. New overlapping registrations on a physical machine are rejected, rather than duplicating existing work. Archived orders remain archived; no route status is inferred from backfilled counts.
- Past employee labor is rebuilt from the original allocation intervals plus closed backfill intervals, sharing overlapping employee minutes once and deducting standard breaks. Original labor rows are retained as superseded audit; today/live rows are untouched and omitted historical replacements are excluded from snapshots.
- Supply use before a later physical count/initial stock entry is recorded with zero stock delta, because that count already includes the historic use. Historical material moves carry entry timestamps; pieces/kg of raw stones are recorded without double-booking the separate stone inventory.
- The entry form accepts start/end or a net-hour helper; explicit times are required for overlap allocation. Saving opens the chosen historical day report, including used-stone figures and archived order reporting. Backups automatically retain the added columns and original/superseded labor rows.

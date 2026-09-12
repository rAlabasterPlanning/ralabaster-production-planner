# rAlabaster Productieplanner — Project Context

_Last updated: 2026-09-12_

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

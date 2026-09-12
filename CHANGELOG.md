# rAlabaster Productieplanner — Changelog

This is a practical development log, not a full semantic-versioning history. It exists so future work can quickly understand recent changes and avoid reintroducing old problems.

## 2026-09-12

### Added persistent project memory

- Added `PROJECT_CONTEXT.md` with architecture, planning rules, performance rules, workflow conventions, and data/sync guidance.
- Added `DECISIONS.md` with durable product/technical decisions.
- Added this `CHANGELOG.md`.

### Existing-order → Calculatie workflow

- Added a bridge from an opened order to Calculatie.
- Existing order can be edited without creating a duplicate.
- Intended controls include order fields, pricing/material values and production steps.
- Remaining movable steps are replanned after saving.
- Optional checkbox can update the product template for future orders.
- Added a follow-up fix so the `Naar calculatie` button waits for the async order modal to exist before injection.

Relevant files:
- `assets/order-calculation-bridge-v1.js`
- `assets/order-calculation-button-fix-v1.js`

### Internal expected ready date

- Added background maintenance of `internalExpectedDate`.
- Existing imported orders should also receive a calculated internal ready date.
- Calculation was deliberately kept out of ordinary render loops to protect performance.

Relevant file:
- `assets/internal-ready-date-v1.js`

### Mobile / iPad responsive UI

- Added responsive behavior for phone and iPad.
- Navigation becomes horizontally scrollable.
- Touch targets and inputs are larger.
- Forms collapse to fewer columns.
- Modals use most of the mobile viewport.
- Wide planning/table views remain horizontally scrollable.
- Added viewport safe-area support.

Relevant file:
- `assets/mobile-responsive-v1.css`

## 2026-09-11

### Performance regression fixed

Major slowdown was traced to three patterns introduced during feature work:

1. `renderOrders()` triggered a full production `scenario()` recalculation on ordinary render.
2. staff availability used a broad MutationObserver and rescanned planning cards after DOM changes.
3. product batching also used a broad MutationObserver.

Fixes:
- full planning scenarios removed from passive order rendering;
- staff availability moved away from broad DOM observation;
- batching button behavior moved away from broad continuous DOM scanning.

Result: normal navigation became fast again.

### Supabase sync redesign

- Operational data moved to normalized order/task tables.
- Full operational snapshot removed from the normal sync route.
- Cloud persistence decoupled from navigation/UI rendering.
- Local interaction remains immediate while Supabase syncs in the background.

### Performance layer

- Added indexing/caching layer for orders, tasks, scheduled entries, machine options, etc.
- Exact planning remains available for explicit planning actions.
- Passive screens use lightweight/cached calculations.

Relevant file:
- `assets/performance-v1.js`

### Deadline-driven planning

- Added deadline-based planning and scenario logic.
- Setup/run sequence preservation.
- Normal capacity / Peter / overtime scenarios available explicitly.
- Added buffer deadline model.

Relevant files:
- `assets/planning-deadline-v2.js`
- `assets/planning-deadline-fixes-v2.js`
- `assets/planning-deadline-render-fix-v1.js`

### Product batching

- Added preference for identical products to run consecutively when deadlines remain safe.
- Shared setup behavior supported where safe.

Relevant file:
- `assets/planning-product-batching-v2.js`

### Staff availability

- Added vacation/absence handling as capacity constraints.
- Added customer planning PDF functionality.

Relevant file:
- `assets/staff-availability-customer-planning-v2.js`

### Excel bulk import

- Imported initial batch of production orders and tasks from Excel.
- Material and external-cost mappings added.
- Gildemeister-specific import support added.

Important: never rerun the old import blindly over live data.

Relevant files:
- `assets/bulk-excel-import-v1.js`
- `assets/bulk-excel-gildemeister-v1.js`

---

## Update policy

After a meaningful work session, add a short entry containing:

- what changed;
- why it changed;
- important behavior/constraints;
- relevant files;
- any regression or performance lesson that must not be forgotten.

Do not use this file as a dump of every tiny CSS or text change. Keep it useful for resuming development in a future chat.

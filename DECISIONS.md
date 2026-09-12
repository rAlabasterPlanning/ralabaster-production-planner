# rAlabaster Productieplanner — Decisions

_Last updated: 2026-09-12_

This file records decisions that should survive individual ChatGPT conversations.

## 2026-09-11 — Normalize operational storage

Decision: orders and tasks are stored in normalized Supabase tables (`planner_orders_v2`, `planner_tasks_v2`) instead of relying on a full operational JSON snapshot.

Reason: performance, scalability, safer partial updates, and future growth toward thousands of orders.

Consequence: `planner_shared_state` is metadata-only (`normalizedVersion = 2`). Do not move full operational order/task state back into it.

## 2026-09-11 — Cloud sync must not block UI

Decision: Supabase persistence happens asynchronously in the background.

Reason: the app previously became slow/unresponsive while cloud sync and full-state processing were coupled to UI work.

Consequence: local interaction is immediate; changed data is persisted in the background; normal navigation does not wait for Supabase.

## 2026-09-11 — No expensive calculations on passive render

Decision: full deadline/scenario calculations are not allowed during ordinary screen rendering.

Reason: `renderOrders()` previously ran a complete three-scenario planning pass and caused severe slowdown.

Consequence: normal views use cached/lightweight values. Exact calculations run only on real planning changes or explicit optimization actions.

## 2026-09-11 — No broad DOM mutation scanning

Decision: do not use broad MutationObservers that repeatedly scan all task cards / the entire document.

Reason: availability and batching observers caused repeated DOM work and made the app progressively slow.

Consequence: decorate UI through explicit render hooks/event delegation instead.

## 2026-09-11 — Deadline hierarchy

Decision: hard deadlines stay leading. Product batching may improve efficiency only if it does not make a previously feasible hard deadline infeasible.

Consequence: grouping equal products is secondary to deadline safety.

## 2026-09-11 — Mori machine flexibility

Decision: ZL15 work may move between Mori ZL15 #1, ZL15 #2 and Mori SL25 where allowed. Work explicitly intended for SL25 remains on SL25.

Reason: exploit available capacity without violating machine constraints.

## 2026-09-11 — Setup behavior

Decision: setup operations are normally done by Ralph and stay directly connected to the corresponding machine operation.

## 2026-09-11 — Order editing from Calculatie

Decision: an existing production order can be opened in Calculatie and edited there.

Rules:
- no duplicate order is created;
- by default only that order changes;
- an explicit checkbox can update the product template for future orders;
- completed/started/locked work is preserved;
- remaining movable work is replanned after save.

## 2026-09-12 — Standard product steps preferred

Decision: when adding a process step in order calculation, standard known operations should be selectable and should populate default machine/type/rate/time values. Free text remains only for an explicit custom step.

Reason: avoid spelling variants that break machine planning and costing consistency.

Status: desired behavior; verify implementation before assuming it is live.

## 2026-09-11 — Internal expected ready date

Decision: `internalExpectedDate` must be a derived operational date, kept current after planning changes.

Rules:
- use the latest actual planned finish if the route is planned;
- use exact planning/forecast when necessary for still-unplanned work;
- update on changes, not by expensive recalculation on every render.

## 2026-09-11 — Mobile/iPad is first-class

Decision: the same web application should work on desktop, iPad, and phone. Do not create a separate mobile app unless there is a later explicit reason.

## 2026-09-12 — Persistent project memory in repo

Decision: important project context, architecture choices, performance lessons, and change history are stored in repository markdown files (`PROJECT_CONTEXT.md`, `DECISIONS.md`, `CHANGELOG.md`).

Reason: future chats should be able to resume safely without relying on one long conversation or model memory alone.

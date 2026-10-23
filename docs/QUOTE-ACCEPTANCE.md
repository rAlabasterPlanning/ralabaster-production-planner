# Accepting a quotation

Open a saved quotation and choose **Accept → order**. Select the accepted quantity price for each product, then confirm the final order quantity. Changing the selected tier initially copies its quantity. A custom quantity requires explicit confirmation of the customer price agreement and a reason; the selected tier's unit price remains applicable, including the quotation adjustment percentage. Hidden quantity prices cannot be selected.

Enter **0** for products the customer does not order. These lines remain in the original quotation but create no order, revenue, cost or production tasks; they require no price-deviation approval. At least one product must have a positive whole quantity. Blank, negative and fractional quantities remain invalid. An identical partial-acceptance retry returns the existing selected orders; changing which products are selected after acceptance is blocked by the existing duplicate protection.

Acceptance uses the saved quotation, not unsaved values in the document editor. Save intentional quotation changes separately before accepting. The original quotation is never updated by acceptance, including its quantities, prices, status and complete quantity-pricing table. Orders store `sourceQuoteNo`, `sourceQuoteLineId`, `sourceQuoteSnapshot`, `acceptanceChoice`, the accepted tier and the accepting user/time. The quotations and request inboxes derive acceptance from the linked order. Existing legacy `orderId` links remain supported.

`planner_accept_quote_v1` runs as the signed-in caller under the existing planner-admin RLS policies. It locks the shared workspace row, compares the reviewed quotation snapshot, validates all selections, and inserts orders and tasks in one transaction. Unit operations scale with the final quantity; batch, wait and external lead times remain fixed. Material and external costs are recalculated. Exact retries return the existing orders; changed selections on an accepted quotation are rejected. A unique index prevents two orders from using the same source quotation line, including archived or soft-deleted orders. Quotation editing and accepting are serialized by the shared row lock.

To change tiers later, open the order and use **Aantal / staffel wijzigen**. The original quote snapshot supplies its price table, including the original discount/surcharge. Started production continues to require the existing calculation workflow. New orders are initially unplanned, as before.

Acceptance requires a successful planner synchronization and database response. On synchronization failure or stale quotation data, nothing is created locally. Do not bypass synchronization errors: resolve the underlying invalid pending change first. A lost response can be retried safely.

The normalized loader also checks server deletion records before merging a pending browser cache. If a locally active order has already been deleted on the server, its complete local order and task versions are saved first in `ralabaster_sync_recovery_v1` in browser storage and in `syncRecoveryRecords` in planner metadata. Only then are those stale active copies excluded from synchronization. This prevents an old cache from resurrecting deleted orders or blocking unrelated saves. Storage failure stops recovery before any local records are removed. Server deletion backups and archive protection remain unchanged.

On startup, differing cached quotation versions are preserved in the same recovery journal. The saved quotation wins unless the cached version has an explicitly newer `updatedAt`/`quoteDraftAt`. Quotes created locally that do not yet exist on the server remain pending additions. This avoids copying old cached prices over newer saved quotes when a formerly blocked sync resumes.

## Verification

Run `node --test tests/quote-acceptance.test.cjs tests/request-inbox.test.cjs tests/order-tier-adjustment.test.cjs tests/production-forecast.test.cjs tests/planner-plugin-core.test.cjs` after installing the project/test dependencies.

`tests/quote-acceptance-db.sql` exercises the real RPC and RLS as an existing planner administrator. It appends synthetic quotations inside a transaction, tests multiple products, rollback, custom quantity validation, hidden tiers, stale data, duplicate prevention and retry, then explicitly rolls back. It never accepts a real customer quotation. The SQL test requires an existing planner admin and the `ralabaster` workspace.

Apply the database migration before deploying the frontend. Deploying the frontend without the RPC fails closed and creates no local order.

## Order details entered at acceptance

The acceptance dialog captures a shared customer PO/reference, the customer's requested delivery date and our confirmed delivery date for all selected product lines. Existing saved reference/date values prefill the fields. `planner_accept_quote_v2` validates and stores these details atomically with the accepted orders and production tasks, keeping v1 available for older clients. The confirmed date drives the production deadline; the requested date is kept separately and projected separately into the customer portal.

Identical retries include the same PO and delivery dates. Changing them after acceptance is rejected instead of silently rewriting an accepted order. The saved source quotation and its snapshot remain unchanged. Regenerated quotation documents read the accepted details from the linked orders. Order confirmations, packing lists, production sheets and Outlook PDF attachments include the customer PO and distinguish requested from confirmed delivery.

Additional verification: `tests/quote-acceptance-po-db.sql` tests all selected lines and portal projections inside an explicit rollback; `tests/accepted-order-documents.test.cjs` checks the PDF/print/document flow.

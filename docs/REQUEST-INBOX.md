# Nieuwe aanvragen en offerte-e-mailmeldingen

## Where requests arrive

- Customer portal `portal_request_new_product` saves quote/order requests in `public.portal_product_requests`; attachments live in private `portal-files` storage. Customers see their own earlier requests. The existing staff screen is Klantportaal → Nieuwe productaanvragen, refreshed on opening or with Vernieuwen. It had no quote notification badge or email.
- Acquisition intake saves structured quotes in `public.acquisition_requests` and updates prospect/events atomically. These remain visible in Acquisitie → Acties. Samples and unstructured conversational expressions of interest are not quote submissions.
- Staff now have a top-level **Nieuwe aanvragen** tab. It shows both sources, quote/order filters, original submissions, internal amendments, status, attachments and a new-request counter refreshed every minute while the tab is closed. Opening/refreshing fetches current requests. Internal amendments live in admin-only `planner_request_reviews`; the original customer submission is preserved.

## Handling an application

1. Open Bekijken / aanvullen; fill the product, positive quantity, material, dimensions, requested date and internal notes. Save amendments.
2. For acquisition requests, explicitly choose an existing customer (create the relationship in Klanten first if needed). No relation is guessed when multiple email matches exist.
3. Calculatie / offerte voorbereiden creates one linked concept quotation and opens the existing calculator. The stable request-derived quotation number prevents repeat clicks making another quote. Complete process steps, pricing and delivery dates there, then update the quotation. Internal notes are excluded from the customer document.
4. Offerte bekijken / order bevestigen opens the existing quotation document workflow. Confirm an order there using the existing controls. The request then offers Order bekijken / inplannen, opening that linked order's production editor. Creating an empty calculation does not schedule factory work.

## Email activation (not enabled merely by deploying code)

New quotes in either source are inserted into `quote_request_notifications` in the same transaction. Orders, updates, and historic requests are not emailed. No browser-controlled recipient or arbitrary mail body is accepted.

On the **production** Vercel project `ralabaster_planner`, configure:

- `QUOTE_NOTIFICATION_TO=info@ralabaster.com` — explicitly provided by Ralph on 19 October 2026.
- `MS_TENANT_ID`, `MS_CLIENT_ID`, `MS_CLIENT_SECRET` — existing Microsoft application credentials, if valid. Do not copy acquisition delegated OAuth credentials blindly.
- `MS_SENDER_EMAIL` — explicitly configured sending mailbox. This worker has no guessed fallback sender.
- Microsoft Graph application permission `Mail.Send` with administrator consent and access to the sending mailbox. Prefer restricting application mailbox access.
- `SUPABASE_SERVICE_ROLE_KEY` (or `SUPABASE_SECRET_KEY`) and `CRON_SECRET` — server-only secrets; never place in browser assets.

Redeploy after setting variables. Configure a scheduler to invoke `GET /api/quote-notifications` with `Authorization: Bearer <CRON_SECRET>` every five minutes. Vercel Cron may be configured in `vercel.json` after checking the project's plan supports this frequency; an authenticated external scheduler is also possible. No background scheduler is silently assumed active. One run handles at most five requests, so increase frequency/capacity if sustained incoming volume exceeds that.

Only production deployment execution is allowed (`VERCEL_ENV=production`). Do not point previews at production secrets. Verify a single clearly identified test submission end to end after activation and check the receiving mailbox and sender's Sent Items. Microsoft Graph's HTTP 202 means accepted for processing, not proven inbox delivery.

## Operations

Inspect queue status with an administrator/server connection. `pending` retries pre-send failures with backoff, at most five attempts. `claimed` work abandoned before sending is recoverable after ten minutes. `sending` interrupted after the provider call becomes `needs_review`; network uncertainty and post-send database failures are never blindly retried. Check Sent Items before manually requeuing `needs_review`, to avoid duplicate emails. `accepted` means Microsoft accepted the message; `failed` needs configuration/data correction and deliberate requeue. Original requests remain in the inbox independently of mail success.

The migration does not backfill email for older requests. It enables RLS and service-only queue access; review rows are restricted by `portal_is_admin()`. The worker is protected by `CRON_SECRET` and reads request contents from the database.

## Verification

`node --test tests/quote-notifications.test.cjs tests/request-inbox.test.cjs tests/nav-more.test.cjs`

Run `tests/request-inbox-db.sql` against the intended database. It rolls back all fixtures and checks portal/acquisition inserts, order exclusion, update deduplication, claims and permissions. No real mail is sent by these tests.

References: [Supabase database webhooks](https://supabase.com/docs/guides/database/webhooks), [Microsoft Graph sendMail](https://learn.microsoft.com/en-us/graph/api/user-sendmail?view=graph-rest-1.0).

-- ============================================================
-- AURA OS — migration 0366: issuing, voiding and deleting a receivable say who did it
--                           (SEC-01 stage 3, wave A)
-- ------------------------------------------------------------
-- MEASURED against the running API. `created_by` is on the row and the `created` event carries the
-- actor. Every act AFTER that is anonymous:
--
--   finance.customer_invoice.created     actor_id = 'u-e2e-finance'
--   finance.customer_invoice.issued      actor_id = NULL
--   finance.customer_invoice.cancelled   actor_id = NULL
--   finance.customer_invoice.receipt_recorded   actor_id = NULL
--
-- Not a bug in the event writer: the actor never reaches the service. `issue(id)`, `cancel(id)`,
-- `recordReceipt(id, amount)`, `softDelete(tenantId, id)` and `restore(tenantId, id)` take no actor
-- at all, so the controller has nobody to pass. SENDING AN INVOICE TO A CUSTOMER, TAKING MONEY
-- AGAINST IT AND VOIDING A RECEIVABLE ARE THE THREE MOST CONSEQUENTIAL THINGS THAT HAPPEN TO THIS
-- RECORD, and the system could not name who did any of them.
--
-- A SOFT-DELETED ISSUED INVOICE was also accepted — 200 — so a document already sent to a customer
-- disappeared from every list, with `deleted_at` set and nobody named. That is refused in the domain
-- now (cancel it, which is the act that exists for it) and the column below records the actor for
-- the drafts that may still be deleted.
-- ============================================================

alter table public.aura_finance_customer_invoices
  add column if not exists issued_by     text,
  add column if not exists issued_at     timestamptz,
  add column if not exists cancelled_by  text,
  add column if not exists cancelled_at  timestamptz,
  add column if not exists cancel_reason text,
  add column if not exists deleted_by    text;

comment on column public.aura_finance_customer_invoices.issued_by is
  'Who sent this invoice to the customer. The moment it stops being an internal draft and becomes a claim on somebody — and it was anonymous.';
comment on column public.aura_finance_customer_invoices.cancel_reason is
  'WHY the receivable was voided. Required with cancelled_by/at: raising an invoice may be routine, un-raising one that a customer has already seen may not be silent.';

-- INVARIANT 1 — issue provenance is all-or-nothing, and an issued invoice has it. Historical rows
-- are exempt by the `issued_at is null` branch: they were issued before the column existed, and
-- inferring a time from `created_at` would manufacture a fact.
alter table public.aura_finance_customer_invoices
  drop constraint if exists aura_customer_invoice_issued_complete;
alter table public.aura_finance_customer_invoices
  add constraint aura_customer_invoice_issued_complete check (
    (issued_by is null and issued_at is null)
    or (issued_by is not null and issued_at is not null)
  );

-- INVARIANT 2 — a void says who, when and why, or says nothing. A cancellation that names nobody and
-- gives no reason is the shape this programme keeps removing: a status that says WHERE the record is
-- and never HOW IT GOT THERE.
alter table public.aura_finance_customer_invoices
  drop constraint if exists aura_customer_invoice_cancelled_complete;
alter table public.aura_finance_customer_invoices
  add constraint aura_customer_invoice_cancelled_complete check (
    (cancelled_by is null and cancelled_at is null and cancel_reason is null)
    or (
      cancelled_by is not null
      and cancelled_at is not null
      and cancel_reason is not null
      and btrim(cancel_reason) <> ''
    )
  );
-- NOTE the `cancel_reason is not null` test. Without it, `btrim(NULL) <> ''` evaluates to NULL,
-- `FALSE OR NULL` is NULL, and a CHECK constraint PASSES on NULL — so a void naming who and when
-- while refusing to say why would be accepted. That exact hole shipped in 0362 and was caught by its
-- own test; it is not repeated here.

-- INVARIANT 3 — nothing is cancelled that was never issued or that holds money. Both are already
-- refused in the domain; this is the database refusing them too, which is what makes them invariants
-- rather than code paths. `status` is the authority on where the invoice is.
alter table public.aura_finance_customer_invoices
  drop constraint if exists aura_customer_invoice_cancelled_status;
alter table public.aura_finance_customer_invoices
  add constraint aura_customer_invoice_cancelled_status check (
    cancelled_at is null or status = 'cancelled'
  );

create index if not exists idx_aura_customer_invoices_issued
  on public.aura_finance_customer_invoices (tenant_id, issued_at);

-- @DOWN
drop index if exists idx_aura_customer_invoices_issued;
alter table public.aura_finance_customer_invoices drop constraint if exists aura_customer_invoice_cancelled_status;
alter table public.aura_finance_customer_invoices drop constraint if exists aura_customer_invoice_cancelled_complete;
alter table public.aura_finance_customer_invoices drop constraint if exists aura_customer_invoice_issued_complete;
alter table public.aura_finance_customer_invoices drop column if exists deleted_by;
alter table public.aura_finance_customer_invoices drop column if exists cancel_reason;
alter table public.aura_finance_customer_invoices drop column if exists cancelled_at;
alter table public.aura_finance_customer_invoices drop column if exists cancelled_by;
alter table public.aura_finance_customer_invoices drop column if exists issued_at;
alter table public.aura_finance_customer_invoices drop column if exists issued_by;

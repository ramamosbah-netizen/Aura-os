-- ============================================================
-- AURA OS — migration 0360: a purchase order records who moved its life, and why (J3-01)
-- ------------------------------------------------------------
-- J3-01 was recorded as "an update-only actor can set status=approved". That string had been refused
-- for a while and the record stayed open, because the refusal patched a VALUE IN A LIST rather than
-- the shape that produced it: one generic `PATCH /status` endpoint, governed by one permission
-- (`procurement.po.update`), owning four different business acts. Executed against the running API,
-- a Buyer holding only `update` could still issue an order to a supplier, cancel a Director-approved
-- order of 90,000 — reversing its committed cost in the ledger — and close one.
--
-- The status column could not have told anybody that. It says WHERE an order is and has never said
-- HOW IT GOT THERE: no approver, no time, no reason, no authority. So a status set by a governed
-- command and a status set by a generic PATCH were indistinguishable after the fact, which is why
-- this went unnoticed long enough to be found by reading code rather than by reading data.
--
-- THE AUTO-APPROVAL COLUMN IS THE POINT OF THIS MIGRATION. An order below the approval threshold
-- used to be issued with NO APPROVAL FACT ANYWHERE — the threshold was read as "this needs no
-- approval" and implemented as "skip the step". It now means the opposite: the approval HAPPENS, and
-- happens automatically, which is a fact with an actor (`approval_basis = 'automatic'`), a time and
-- a level. The difference is invisible in a status and decisive in an audit.
-- ============================================================

alter table public.aura_procurement_purchase_orders
  -- APPROVAL. `approval_basis` distinguishes a decision somebody took from one the matrix took on
  -- their behalf; `approval_level` records which tier was satisfied, so a later change to the
  -- thresholds cannot silently re-interpret a past approval.
  add column if not exists approved_by         text,
  add column if not exists approved_at         timestamptz,
  add column if not exists approval_level      integer,
  add column if not exists approval_basis      text,
  -- ISSUE. The commitment going OUT to the supplier, which is the act the Buyer could perform with
  -- no approval anywhere behind it.
  add column if not exists issued_by           text,
  add column if not exists issued_at           timestamptz,
  -- CANCELLATION. A reason is required by the domain, and `cancelled_value` is what was actually
  -- reversed — NOT the order's value. An order part delivered has part become real, and reversing
  -- the whole commitment would say the company never committed to goods standing in its store.
  add column if not exists cancelled_by        text,
  add column if not exists cancelled_at        timestamptz,
  add column if not exists cancellation_reason text,
  add column if not exists cancelled_value     numeric(18,4),
  -- CLOSURE. A different act from cancellation, with different conditions and a different authority:
  -- operational completion, not the undoing of a commitment.
  add column if not exists closed_by           text,
  add column if not exists closed_at           timestamptz;

alter table public.aura_procurement_purchase_orders
  drop constraint if exists aura_po_approval_basis;
alter table public.aura_procurement_purchase_orders
  add constraint aura_po_approval_basis
  check (approval_basis is null or approval_basis in ('manual','automatic'));

comment on column public.aura_procurement_purchase_orders.approval_basis is
  'manual = a person with the authority approved it; automatic = the value fell in the auto-approve tier and the approval was recorded on their behalf. NULL = never approved. An order is never issued without one of the two.';
comment on column public.aura_procurement_purchase_orders.cancelled_value is
  'What the cancellation actually reversed: the commitment LESS whatever had already been received or invoiced. Never the order value on a part-delivered order.';

-- Historical rows keep NULL throughout, deliberately and not backfilled. An order approved before
-- this existed has no recorded approver, and inventing one — even "system" — would manufacture an
-- audit fact that never happened. NULL is the honest answer: nobody wrote it down at the time.

-- @DOWN
alter table public.aura_procurement_purchase_orders
  drop constraint if exists aura_po_approval_basis;
alter table public.aura_procurement_purchase_orders
  drop column if exists closed_at,
  drop column if exists closed_by,
  drop column if exists cancelled_value,
  drop column if exists cancellation_reason,
  drop column if exists cancelled_at,
  drop column if exists cancelled_by,
  drop column if exists issued_at,
  drop column if exists issued_by,
  drop column if exists approval_basis,
  drop column if exists approval_level,
  drop column if exists approved_at,
  drop column if exists approved_by;

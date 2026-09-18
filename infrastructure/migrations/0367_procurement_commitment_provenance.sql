-- ============================================================
-- AURA OS — migration 0367: activating a blanket commitment, and sending an enquiry, say who
--                           (SEC-01 stage 3, wave A)
-- ------------------------------------------------------------
-- MEASURED against the running API.
--
-- A FRAMEWORK AGREEMENT is a blanket commitment: activating one binds this business to a supplier up
-- to its ceiling, and every call-off draws down against that figure. `created_by` is on the row.
-- ACTIVATING AND TERMINATING RECORD NOBODY — the service writes `actorId: null` on both events,
-- because the actor never reached it: `activate(id)` and `terminate(id)` took no actor, so the
-- controller had none to pass. The third table in this wave with that exact shape, after the
-- subcontractor claim and the customer invoice.
--
-- AN RFQ is the enquiry itself. `sent_by` did not exist either, and the Buyer — whose job is running
-- the enquiry cycle — was REFUSED the send, because the role held `procurement.*.read/create/update`
-- and `send` is none of those. Authority defined by the shape of the verb rather than by the job.
--
-- Nothing here touches the sourcing decision. SUP-13 and SUP-14 are closed to new scope and ADR-0022
-- fixes what each of those four acts may do; this migration adds no column to their tables.
-- ============================================================

alter table public.aura_procurement_framework_agreements
  add column if not exists activated_by  text,
  add column if not exists activated_at  timestamptz,
  add column if not exists terminated_by text,
  add column if not exists terminated_at timestamptz;

comment on column public.aura_procurement_framework_agreements.activated_by is
  'Who committed this business to the agreement''s ceiling. Required for maker/checker: the person who created it may not activate it, and without this the rule cannot be expressed.';

alter table public.aura_procurement_rfqs
  add column if not exists sent_by text,
  add column if not exists sent_at timestamptz;

comment on column public.aura_procurement_rfqs.sent_by is
  'Who sent the enquiry to suppliers. The act the Buyer could not perform, recorded by nobody when it was performed.';

-- INVARIANT 1 — each transition's provenance is all-or-nothing. A row saying it was activated while
-- refusing to name who, or when, is a commitment with no signature on it.
alter table public.aura_procurement_framework_agreements
  drop constraint if exists aura_framework_activated_complete;
alter table public.aura_procurement_framework_agreements
  add constraint aura_framework_activated_complete check (
    (activated_by is null and activated_at is null)
    or (activated_by is not null and activated_at is not null)
  );

alter table public.aura_procurement_framework_agreements
  drop constraint if exists aura_framework_terminated_complete;
alter table public.aura_procurement_framework_agreements
  add constraint aura_framework_terminated_complete check (
    (terminated_by is null and terminated_at is null)
    or (terminated_by is not null and terminated_at is not null)
  );

alter table public.aura_procurement_rfqs
  drop constraint if exists aura_rfq_sent_complete;
alter table public.aura_procurement_rfqs
  add constraint aura_rfq_sent_complete check (
    (sent_by is null and sent_at is null)
    or (sent_by is not null and sent_at is not null)
  );

-- INVARIANT 2 — a terminated agreement was activated first. Terminating something never in force is
-- not a state this record can be in, and the domain already refuses it; this is the database saying
-- the same thing. Historical rows are exempt by construction: they carry neither column.
alter table public.aura_procurement_framework_agreements
  drop constraint if exists aura_framework_terminated_after_active;
alter table public.aura_procurement_framework_agreements
  add constraint aura_framework_terminated_after_active check (
    terminated_at is null or activated_at is not null or status <> 'terminated'
  );

create index if not exists idx_aura_framework_activated
  on public.aura_procurement_framework_agreements (tenant_id, activated_at);

-- @DOWN
drop index if exists idx_aura_framework_activated;
alter table public.aura_procurement_framework_agreements drop constraint if exists aura_framework_terminated_after_active;
alter table public.aura_procurement_rfqs drop constraint if exists aura_rfq_sent_complete;
alter table public.aura_procurement_framework_agreements drop constraint if exists aura_framework_terminated_complete;
alter table public.aura_procurement_framework_agreements drop constraint if exists aura_framework_activated_complete;
alter table public.aura_procurement_rfqs drop column if exists sent_at;
alter table public.aura_procurement_rfqs drop column if exists sent_by;
alter table public.aura_procurement_framework_agreements drop column if exists terminated_at;
alter table public.aura_procurement_framework_agreements drop column if exists terminated_by;
alter table public.aura_procurement_framework_agreements drop column if exists activated_at;
alter table public.aura_procurement_framework_agreements drop column if exists activated_by;

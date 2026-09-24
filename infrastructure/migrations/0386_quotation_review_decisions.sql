-- ============================================================
-- AURA OS — migration 0386: a commercial review has two outcomes
-- ------------------------------------------------------------
-- A quotation could be SUBMITTED for review and then only ever go forward. `TRANSITIONS` allowed
-- `internal_review → approved` and nothing else back to `draft`: an offer whose figures a reviewer
-- wanted corrected had to be cancelled or expired outright, taking its number and its history with
-- it. Every other review gate in AURA has a second outcome — the technical study has
-- `request-changes`, the NCR verification has `rejected` — and this one did not.
--
-- It matters more now that the costing FREEZES when review is requested (EST-17: "approvers review
-- the same frozen build-up"). Without a route back, freezing would strand a correction rather than
-- govern one.
--
--   * aura_crm_quotation_review_decisions — append-only. Who returned an offer, when, at which
--     revision, and WHY. Append-only because a second send-back does not erase the first: an offer
--     returned twice for the same reason is a different fact from one returned once, and the
--     estimator is owed the whole list rather than the latest line.
-- ============================================================

create table if not exists public.aura_crm_quotation_review_decisions (
  id             uuid        primary key,
  tenant_id      text        not null,
  company_id     text,
  quotation_id   uuid        not null,
  quote_number   text        not null,
  -- The revision the decision was made against. A returned offer is re-priced and resubmitted, so
  -- without this the list cannot say which set of figures each send-back was about.
  revision       integer     not null default 0,
  outcome        text        not null, -- returned
  decided_by     text,
  decided_at     timestamptz not null default now(),
  -- Mandatory in the domain: a send-back with no reason tells the estimator nothing and is not a
  -- review decision, it is an obstruction.
  reason         text        not null
);

create index if not exists idx_crm_quotation_review_decisions_quotation
  on public.aura_crm_quotation_review_decisions (tenant_id, quotation_id);

alter table public.aura_crm_quotation_review_decisions enable row level security;
alter table public.aura_crm_quotation_review_decisions force row level security;

drop policy if exists tenant_isolation on public.aura_crm_quotation_review_decisions;
create policy tenant_isolation on public.aura_crm_quotation_review_decisions
  using (tenant_id::text = public.current_tenant_id() and public.current_tenant_id() is not null)
  with check (tenant_id::text = public.current_tenant_id() and public.current_tenant_id() is not null);

-- @DOWN
drop table if exists public.aura_crm_quotation_review_decisions;

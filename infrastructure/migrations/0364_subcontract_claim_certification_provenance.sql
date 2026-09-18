-- ============================================================
-- AURA OS — migration 0364: a subcontractor payment certificate says who raised it, who certified
--                           it and who released the money (SEC-01 stage 3, wave A)
-- ------------------------------------------------------------
-- MEASURED against the running API. One administrator raised a claim, certified it, and paid it —
-- three acts, one person, no refusal at any step. Behind that:
--
--   * `certified_by` / `certified_at` existed; WHO RAISED THE CLAIM did not. So the maker/checker
--     rule was unwritable here for the same reason it was unwritable for a solution scope (0361) and
--     for a purchase order (0360): a record that cannot say who wrote it cannot refuse that person's
--     signature. This is the third table in a row with that shape.
--   * PAYMENT recorded NOBODY. `payClaim(id, actorId)` put the actor on the event and never on the
--     row, so "who released the money to this subcontractor" was not a fact the record held.
--   * CERTIFYING TWICE silently re-stamped `certified_at` and `certified_by`. The second call
--     returned 200 and the first certification was gone — no refusal, no history, and a payment
--     certificate is an external commitment to pay somebody.
--
-- Certification is not reopened here the way a finance period is (0362). The claim model is already
-- CUMULATIVE — `work_completed_value` less `previously_certified_value` — so a correction is the next
-- claim, which the domain has always supported. Adding generations would be a second way to say the
-- same thing, and two mechanisms for one fact is the shape this programme keeps removing.
-- ============================================================

alter table public.aura_subcontracts_claims
  add column if not exists created_by text,
  add column if not exists paid_by    text,
  add column if not exists paid_at    timestamptz;

comment on column public.aura_subcontracts_claims.created_by is
  'Who raised this claim. Required for maker/checker: the person who raised a claim may not certify it, and without this the rule cannot be expressed. NULL on rows written before it existed.';
comment on column public.aura_subcontracts_claims.paid_by is
  'Who released the payment. It was recorded only on the event spine before, which no rule and no screen reads at decision time.';

-- INVARIANT 1 — certification provenance is all-or-nothing. A claim that says it was certified while
-- refusing to say by whom, or when, is a certificate with no signature on it.
alter table public.aura_subcontracts_claims
  drop constraint if exists aura_subcontract_claim_certified_complete;
alter table public.aura_subcontracts_claims
  add constraint aura_subcontract_claim_certified_complete check (
    (certified_by is null and certified_at is null)
    or (certified_by is not null and certified_at is not null)
  );

-- INVARIANT 2 — payment provenance is all-or-nothing, for the same reason and with more money at
-- stake. Historical rows are exempt by construction: they carry neither column.
alter table public.aura_subcontracts_claims
  drop constraint if exists aura_subcontract_claim_paid_complete;
alter table public.aura_subcontracts_claims
  add constraint aura_subcontract_claim_paid_complete check (
    (paid_by is null and paid_at is null)
    or (paid_by is not null and paid_at is not null)
  );

-- INVARIANT 3 — the status and the signatures cannot disagree. A row reading `paid` with nothing
-- certified would mean money left against a certificate nobody issued.
--
-- Written to tolerate the rows already on disk: claims certified or paid before this migration have
-- no `paid_by`, so the rule binds the CERTIFICATION a payment rests on, not the payment's own
-- provenance, which only rows written from now on can carry.
alter table public.aura_subcontracts_claims
  drop constraint if exists aura_subcontract_claim_paid_after_certified;
alter table public.aura_subcontracts_claims
  add constraint aura_subcontract_claim_paid_after_certified check (
    status <> 'paid' or certified_at is not null
  );

create index if not exists idx_aura_subcontracts_claims_certified
  on public.aura_subcontracts_claims (tenant_id, subcontract_id, certified_at);

-- ── VARIATIONS ──────────────────────────────────────────────────────────────
-- A variation changes what the subcontract is worth: approving one ADDS its signed amount to
-- `aura_subcontracts.value`, which is what every certification ceiling is measured against. Approval
-- recorded `approved_by`; rejection recorded nothing at all, and neither said WHEN.
alter table public.aura_subcontracts_variations
  add column if not exists created_by  text,
  add column if not exists decided_by  text,
  add column if not exists decided_at  timestamptz;

comment on column public.aura_subcontracts_variations.decided_by is
  'Who approved OR rejected this variation, and when. `approved_by` names only one of the two outcomes; a rejection is a decision somebody made and was previously anonymous.';

alter table public.aura_subcontracts_variations
  drop constraint if exists aura_subcontract_variation_decided_complete;
alter table public.aura_subcontracts_variations
  add constraint aura_subcontract_variation_decided_complete check (
    status = 'pending' or decided_by is null or decided_at is not null
  );

-- @DOWN
alter table public.aura_subcontracts_variations drop constraint if exists aura_subcontract_variation_decided_complete;
alter table public.aura_subcontracts_variations drop column if exists decided_at;
alter table public.aura_subcontracts_variations drop column if exists decided_by;
alter table public.aura_subcontracts_variations drop column if exists created_by;
drop index if exists idx_aura_subcontracts_claims_certified;
alter table public.aura_subcontracts_claims drop constraint if exists aura_subcontract_claim_paid_after_certified;
alter table public.aura_subcontracts_claims drop constraint if exists aura_subcontract_claim_paid_complete;
alter table public.aura_subcontracts_claims drop constraint if exists aura_subcontract_claim_certified_complete;
alter table public.aura_subcontracts_claims drop column if exists paid_at;
alter table public.aura_subcontracts_claims drop column if exists paid_by;
alter table public.aura_subcontracts_claims drop column if exists created_by;

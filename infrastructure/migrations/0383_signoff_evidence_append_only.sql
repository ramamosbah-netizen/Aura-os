-- ============================================================
-- AURA OS — migration 0383: a correction keeps what it corrects
--                           (XOP-12 — commissioning sign-off evidence)
-- ------------------------------------------------------------
-- 0381 gave the sign-off evidence a unique index on (tenant, record, party) and said a second
-- signature for the same party is "a CORRECTION, not a second opinion". That reasoning was right
-- and the mechanism was wrong: the upsert it enabled REPLACED the earlier row, so correcting a
-- sign-off destroyed the fact that it had been signed once already and then signed again.
--
-- That is precisely what an auditor needs and precisely what an in-place overwrite removes. It
-- also contradicted the rule the other three evidence tables follow: site evidence, inspection
-- evidence and handover acceptance are all append-only, and their surfaces resolve the LATEST row
-- while the earlier ones remain.
--
-- So the index goes, the store appends, and `evidenceForParty` takes the last. One vocabulary for
-- one idea across all four surfaces.
--
-- Nothing is lost by dropping it: no row was ever deleted by the upsert path in a deployed
-- environment, and the ordering the readers use (`created_at asc`) already existed.
-- ============================================================

drop index if exists public.uq_cx_signoff_evidence_party;

comment on table public.aura_commissioning_signoff_evidence is
  'Append-only. A party signing again is a CORRECTION that keeps the earlier row — readers resolve the latest per party, and that the sign-off was signed and then re-signed is part of the record rather than something an overwrite erased.';

-- @DOWN
create unique index if not exists uq_cx_signoff_evidence_party
  on public.aura_commissioning_signoff_evidence (tenant_id, commissioning_id, party);

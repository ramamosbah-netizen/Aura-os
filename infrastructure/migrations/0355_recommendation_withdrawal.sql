-- ============================================================
-- AURA OS — migration 0355: an approved recommendation can be withdrawn (SUP-13 / SUP-14)
-- ------------------------------------------------------------
-- One live recommendation per RFQ is a real rule: two competing live ones are two answers to the
-- same question. But `draft`, `submitted` and `approved` all count as live, and until now only a
-- `submitted` one could be moved out of that set — by a decision. An APPROVED recommendation had
-- nowhere to go except the award.
--
-- SUP-14 turns that into a deadlock rather than an inconvenience. The award refuses a recommendation
-- that has gone stale — a supplier sent a newer revision after approval, so awarding would place an
-- order on terms nobody reviewed. That recommendation now cannot be awarded (stale), cannot be
-- decided (it is not awaiting a decision) and cannot be replaced (it is live). The RFQ is stuck, and
-- the only ways out are editing rows by hand or awarding something nobody checked.
--
-- So withdrawal exists, and it is its own status rather than a reuse of `rejected`. A rejection is a
-- checker's verdict ON a recommendation — "I looked at this and I will not approve it" — and reading
-- back a withdrawal as one would put words in the approver's mouth. Withdrawn means the
-- recommendation is no longer being pursued, and the reason says by whom and why.
-- ============================================================

alter table public.aura_procurement_sourcing_recommendations
  drop constraint if exists aura_sourcing_reco_status;
alter table public.aura_procurement_sourcing_recommendations
  add constraint aura_sourcing_reco_status
  check (status in ('draft','submitted','approved','rejected','returned','awarded','withdrawn'));

comment on column public.aura_procurement_sourcing_recommendations.status is
  'draft → submitted → approved → awarded, with rejected/returned as a checker''s verdict and withdrawn as the maker or approver standing it down. Only draft, submitted and approved are LIVE, and one RFQ has at most one live recommendation.';

-- @DOWN
-- A recommendation already withdrawn would violate the narrower constraint, so it is not narrowed
-- blindly: the rollback refuses rather than destroying the record of a decision being stood down.
do $$
declare stuck int;
begin
  select count(*) into stuck
    from public.aura_procurement_sourcing_recommendations where status = 'withdrawn';
  if stuck > 0 then
    raise exception 'cannot roll back 0355: % recommendation(s) are withdrawn, and the earlier constraint has no status for them', stuck;
  end if;
end $$;

alter table public.aura_procurement_sourcing_recommendations
  drop constraint if exists aura_sourcing_reco_status;
alter table public.aura_procurement_sourcing_recommendations
  add constraint aura_sourcing_reco_status
  check (status in ('draft','submitted','approved','rejected','returned','awarded'));

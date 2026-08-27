-- ============================================================
-- AURA OS — migration 0256: the award's commercial basis (ADR-0021 follow-up)
-- ------------------------------------------------------------
-- WHICH approved offer a tender-award Contract is built from, pinned to the award instead of
-- resolved when the reactor happens to run.
--
-- THE DEFECT THIS CLOSES. The contract reactor called `findTenderBaseline` at DELIVERY time: it
-- ranked the tender's quotations (accepted > approved > sent) and took the LATEST locked baseline.
-- Delivery is not immediate — the outbox polls, retries, and stalls indefinitely while the API is
-- down — so a quotation accepted in that window changed which baseline the contract inherited. The
-- baseline ROW was always immutable; WHICH baseline applied was pinned to nothing.
--
-- Three money measures stay separate, and this column is only the third:
--   Tender.value                    our ESTIMATE                    (never a contract value)
--   award_evidence.awardedValue     what the CUSTOMER awarded, ex-VAT (the DEAL's provenance)
--   commercial_basis.value          our approved offer, baseline.total, VAT-INCLUSIVE (the CONTRACT)
--
-- Shape (jsonb, versioned — the reader refuses any other version rather than half-reading a basis):
--   { version, kind, baselineId, quotationId, value, establishedAt }
--
-- `kind` is AT_AWARD (a baseline existed at the award, captured in that same transaction) or
-- POST_AWARD_LINKED (none did; one locked later and was linked). They are different historical
-- claims and must never collapse into one.
--
-- NO CURRENCY, deliberately: `aura_crm_commercial_baselines` has none and
-- `aura_contracts_contracts` has no currency column either, so stamping one here would invent
-- provenance and harden "the platform is de-facto AED" into an implicit invariant. Tracked as its
-- own money/currency slice.
-- ============================================================

alter table public.aura_tendering_tenders
  add column if not exists commercial_basis jsonb;

comment on column public.aura_tendering_tenders.commercial_basis is
  'ADR-0021 follow-up: the approved commercial basis (locked baseline) a tender-award Contract is built from, pinned at award time (AT_AWARD) or linked afterwards (POST_AWARD_LINKED). NULL = awaiting commercial basis -> NO contract is created. Value is baseline.total (incl. VAT). NEVER derived from tenders.value.';

-- Established once, then never again — the same reasoning as award_evidence. A contract already
-- built on a basis must not be re-based by a later lock, and a "cleared" basis is indistinguishable
-- from one that was never established.
create or replace function public.aura_tendering_commercial_basis_immutable() returns trigger
  language plpgsql as $$
begin
  if old.commercial_basis is not null
     and new.commercial_basis is distinct from old.commercial_basis
  then
    raise exception 'aura_tendering_tenders.commercial_basis is immutable once established (tender %): a contract''s commercial basis can never be rewritten or cleared', old.id
      using errcode = 'restrict_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_tendering_commercial_basis_immutable on public.aura_tendering_tenders;
create trigger trg_tendering_commercial_basis_immutable
  before update on public.aura_tendering_tenders
  for each row execute function public.aura_tendering_commercial_basis_immutable();

-- A commercial basis only means something for a tender that was actually won. Both kinds — captured
-- at the award, or linked after it — presuppose the award.
alter table public.aura_tendering_tenders
  drop constraint if exists aura_tendering_tenders_commercial_basis_needs_won;
alter table public.aura_tendering_tenders
  add constraint aura_tendering_tenders_commercial_basis_needs_won
  check (commercial_basis is null or status = 'won') not valid;

-- Structural floor at the persistence boundary, where a direct SQL write never passes the factory:
-- a real kind, the baseline it came from, and a finite non-negative value (0 is a valid total).
alter table public.aura_tendering_tenders
  drop constraint if exists aura_tendering_tenders_commercial_basis_valid;
alter table public.aura_tendering_tenders
  add constraint aura_tendering_tenders_commercial_basis_valid
  check (
    commercial_basis is null
    or (
      commercial_basis ->> 'kind' in ('AT_AWARD', 'POST_AWARD_LINKED')
      and coalesce(nullif(commercial_basis ->> 'baselineId', ''), null) is not null
      and coalesce(nullif(commercial_basis ->> 'quotationId', ''), null) is not null
      and jsonb_typeof(commercial_basis -> 'value') = 'number'
      and (commercial_basis ->> 'value')::numeric >= 0
    )
  ) not valid;

-- @DOWN
alter table public.aura_tendering_tenders
  drop constraint if exists aura_tendering_tenders_commercial_basis_valid;
alter table public.aura_tendering_tenders
  drop constraint if exists aura_tendering_tenders_commercial_basis_needs_won;
drop trigger if exists trg_tendering_commercial_basis_immutable on public.aura_tendering_tenders;
drop function if exists public.aura_tendering_commercial_basis_immutable();
alter table public.aura_tendering_tenders
  drop column if exists commercial_basis;

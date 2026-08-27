-- ============================================================
-- AURA OS — migration 0253: Tender Award Evidence (ADR-0021)
-- ------------------------------------------------------------
-- What the CUSTOMER awarded, captured on the Tender aggregate itself.
--
-- Until now AURA held no field meaning "what the customer awarded". `value` is the ESTIMATED bid
-- value (ours, and mutable), `submitted_value` and `our_bid_value` are what WE bid, and BOQ and
-- estimate totals are our own build-up. A tender win therefore could not produce a trustworthy
-- contracted value, and the deal correctly read LEGACY_WON — "won, award not evidenced".
--
-- This column does NOT compete with the Approved Commercial Baseline. ADR-0021 separates the two
-- concepts rather than making them two sources for one number:
--
--   Approved Commercial Baseline  =  offer / commercial basis   -> still governs the CONTRACT (G-50)
--   award_evidence (this column)  =  customer award authority   -> governs the DEAL's provenance
--
-- Shape (jsonb, versioned — the reader refuses any other version rather than half-reading an award):
--   { version, awardedValue, currency, awardedAt, awardReference, evidenceDocumentId,
--     capturedBy, capturedAt }
--
-- `awardedValue` is EXCLUDING VAT, matching Award Value in the money vocabulary
-- (Quoted Total incl. VAT · Award Value excl. VAT · Contract Value). A real 0 is a valid award;
-- absence is the absence of evidence, never a zero.
-- ============================================================

alter table public.aura_tendering_tenders
  add column if not exists award_evidence jsonb;

comment on column public.aura_tendering_tenders.award_evidence is
  'ADR-0021 Tender Award Evidence: what the CUSTOMER awarded (versioned jsonb, excl. VAT). NULL = award not evidenced -> the deal reads LEGACY_WON. Immutable once captured. NEVER derived from value/submitted_value/BOQ.';

-- Award evidence is the record of a past event: capture it once, then never again. The guard fires
-- on ANY change including a set-to-null, and says so — "cleared" evidence is indistinguishable from
-- evidence that was never captured, which is exactly the ambiguity this column exists to remove.
--
-- This is a database guarantee on purpose, not service discipline. The write-once store method binds
-- THIS codebase; the trigger binds a future code path, a psql session and an ORM-style full-row
-- update as well.
create or replace function public.aura_tendering_award_evidence_immutable() returns trigger
  language plpgsql as $$
begin
  if old.award_evidence is not null
     and new.award_evidence is distinct from old.award_evidence
  then
    raise exception 'aura_tendering_tenders.award_evidence is immutable once captured (tender %): customer award evidence can never be rewritten or cleared', old.id
      using errcode = 'restrict_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_tendering_award_evidence_immutable on public.aura_tendering_tenders;
create trigger trg_tendering_award_evidence_immutable
  before update on public.aura_tendering_tenders
  for each row execute function public.aura_tendering_award_evidence_immutable();

-- Evidence may only exist on a tender that is actually won. The DB-side statement of the inverse of
-- "status = won is not a documented award": winning without evidence is legitimate and stays
-- LEGACY_WON, but EVIDENCE WITHOUT A WIN is incoherent — there is no award to evidence.
-- NOT VALID so the constraint binds new writes without re-scanning history (every existing row has
-- a null award_evidence anyway).
alter table public.aura_tendering_tenders
  drop constraint if exists aura_tendering_tenders_award_evidence_needs_won;
alter table public.aura_tendering_tenders
  add constraint aura_tendering_tenders_award_evidence_needs_won
  check (award_evidence is null or status = 'won') not valid;

-- The award amount is money: finite and non-negative, with 0 explicitly allowed. Stated here as well
-- as in the domain factory because a direct SQL write never passes through the factory — the same
-- write-boundary reasoning as migration 0252's win_probability range CHECK.
alter table public.aura_tendering_tenders
  drop constraint if exists aura_tendering_tenders_award_evidence_value_valid;
alter table public.aura_tendering_tenders
  add constraint aura_tendering_tenders_award_evidence_value_valid
  check (
    award_evidence is null
    or (
      jsonb_typeof(award_evidence -> 'awardedValue') = 'number'
      and (award_evidence ->> 'awardedValue')::numeric >= 0
      and coalesce(nullif(award_evidence ->> 'currency', ''), null) is not null
      and coalesce(nullif(award_evidence ->> 'awardedAt', ''), null) is not null
    )
  ) not valid;

-- @DOWN
alter table public.aura_tendering_tenders
  drop constraint if exists aura_tendering_tenders_award_evidence_value_valid;
alter table public.aura_tendering_tenders
  drop constraint if exists aura_tendering_tenders_award_evidence_needs_won;
drop trigger if exists trg_tendering_award_evidence_immutable on public.aura_tendering_tenders;
drop function if exists public.aura_tendering_award_evidence_immutable();
alter table public.aura_tendering_tenders
  drop column if exists award_evidence;

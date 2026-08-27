-- ============================================================
-- AURA OS — migration 0251: qualification record + immutable qualification-at-award snapshot
-- ------------------------------------------------------------
-- See docs/adr/0020-qualification-record-and-award-snapshot.md.
--
-- THE OBSERVED DEFECT. The four BANT columns (budget_confirmed / authority_confirmed /
-- need_confirmed / timeline_confirmed) are plain mutable booleans and stay writable after a deal
-- closes. On 2026-08-26 opportunity 41aee1b0 was awarded at 17:07 and had need_confirmed un-ticked
-- at 18:39, moving a CLOSED deal's qualification from 1/4 to 0/4. Nothing was corrupted — the model
-- simply had no notion of "what was true at award", so every figure AURA could show for a closed
-- deal was the CURRENT one, and no surface could honestly say "Qualification at award: 3/4".
--
-- Two additive, nullable jsonb columns, holding two DIFFERENT facts that must stay separately
-- readable:
--
--   qualification           the canonical, MUTABLE, evidence-bearing record. Per dimension:
--                           { status: UNKNOWN|CONFIRMED|CONCERN|BLOCKER, evidence, source,
--                             confirmedBy, confirmedAt }.
--                           The four booleans become its derived compatibility shadow (CONFIRMED ⇒
--                           true), the same relationship execution_type already has with
--                           requires_tender. NULL = predates this model; it is read through the
--                           boolean adapter (status only, NO provenance) and is deliberately NOT
--                           backfilled — stamping a source and a date we do not have would invent
--                           the provenance this model exists to make honest.
--
--   qualification_at_award  the IMMUTABLE snapshot, a COMPLETE copy of the record as it stood when a
--                           real award was recorded — never a reference into the mutable one:
--                           { version, capturedAt, awardSource, awardedQuotationId, dimensions }.
--                           Versioned because the qualification structure will keep evolving and
--                           history must not; a v1 document stays readable as v1 forever.
--
-- WHY JSONB AND NOT COLUMNS. Twenty dedicated columns would freeze a shape we already expect to
-- change, and every future dimension would be another migration against a table that must never
-- rewrite history. A versioned document can hold v1 faithfully while v2 is written alongside it.
--
-- WRITE-ONCE, ENFORCED HERE. The application only ever writes the snapshot through a dedicated
-- store method guarded by `where qualification_at_award is null`, inside the award's own
-- transaction. That is service discipline, and service discipline does not bind direct SQL, a
-- future code path, or an ORM-style full-row update. The trigger below makes immutability a
-- property of the DATABASE: once non-null, qualification_at_award can never change again — nor be
-- set back to null, which would silently delete the evidence.
--
-- Additive: null on every existing row, and no behaviour changes until the service captures.
-- ============================================================

alter table public.aura_crm_opportunities
  add column if not exists qualification          jsonb,
  add column if not exists qualification_at_award jsonb;

-- The snapshot is history: capture it once, then never again. Note the guard deliberately fires on
-- ANY change including a set-to-null, and says so — a "cleared" snapshot is indistinguishable from
-- one that was never captured, which is exactly the ambiguity this column removes.
create or replace function public.aura_crm_qualification_at_award_immutable() returns trigger
  language plpgsql as $$
begin
  if old.qualification_at_award is not null
     and new.qualification_at_award is distinct from old.qualification_at_award
  then
    raise exception 'aura_crm_opportunities.qualification_at_award is immutable once captured (opportunity %): a qualification-at-award snapshot can never be rewritten or cleared', old.id
      using errcode = 'restrict_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_crm_qualification_at_award_immutable on public.aura_crm_opportunities;
create trigger trg_crm_qualification_at_award_immutable
  before update on public.aura_crm_opportunities
  for each row execute function public.aura_crm_qualification_at_award_immutable();

-- A snapshot may only exist alongside the award provenance that justified capturing it. This is the
-- DB-side statement of "stage = 'won' is not a trigger": the legacy manual close leaves award_source
-- null and must leave no snapshot behind. NOT VALID so the constraint binds new writes without
-- re-scanning history it cannot retroactively fix (every existing row has a null snapshot anyway).
alter table public.aura_crm_opportunities
  drop constraint if exists aura_crm_opportunities_qualification_at_award_needs_provenance;
alter table public.aura_crm_opportunities
  add constraint aura_crm_opportunities_qualification_at_award_needs_provenance
  check (qualification_at_award is null or award_source is not null) not valid;

-- @DOWN
alter table public.aura_crm_opportunities
  drop constraint if exists aura_crm_opportunities_qualification_at_award_needs_provenance;
drop trigger if exists trg_crm_qualification_at_award_immutable on public.aura_crm_opportunities;
drop function if exists public.aura_crm_qualification_at_award_immutable();
alter table public.aura_crm_opportunities
  drop column if exists qualification_at_award,
  drop column if exists qualification;

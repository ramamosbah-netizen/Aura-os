-- ============================================================
-- AURA OS — migration 0361: a solution scope records who wrote it (J1-07)
-- ------------------------------------------------------------
-- J1-07 reads "a scope author without approval can auto-approve during create". The literal path is
-- gone — `makeSolutionScope` starts in `draft` and `createScope` approves nothing — and the record
-- stayed open for the reason J3-01 did: the shape underneath was never addressed.
--
-- Executed against the running API: whoever can author a scope can sign it off AND turn it into a
-- customer quotation, all three under one wildcard, with `approvedBy` naming the same person who
-- created it. "Study review and sign-off" had no review and no separate signer.
--
-- THE MAKER/CHECKER RULE CANNOT BE WRITTEN AGAINST THIS TABLE AS IT STANDS. `approved_by` exists;
-- `created_by` does not. A record that cannot say who wrote it cannot refuse that person's approval,
-- so the control is not weak here — it is unwritable. That is the same missing-provenance shape
-- migration 0360 fixed for purchase orders, and the reason both findings sat open for so long: a
-- status says WHERE something is and never says HOW IT GOT THERE.
--
-- Requirements get the same column for the same reason: they are the customer's stated need, and
-- who recorded one is part of what it is.
-- ============================================================

alter table public.aura_crm_solution_scopes
  add column if not exists created_by text;
alter table public.aura_crm_requirements
  add column if not exists created_by text;

comment on column public.aura_crm_solution_scopes.created_by is
  'Who authored this scope. Required for the maker/checker rule: the author may not approve their own scope, and without this the rule cannot be expressed at all. NULL on rows written before it existed.';

-- Historical rows keep NULL, deliberately and not backfilled. A scope written before this existed
-- has no recorded author, and inferring one — from the approver, from the opportunity owner — would
-- manufacture an authorship fact that never happened.
--
-- WHAT AN UNKNOWN AUTHOR MEANS FOR THE RULE, decided here rather than left to whoever reads it next.
-- Refusing to approve every legacy scope would block real work for a fact nobody recorded at the
-- time; approving them silently would let a self-approval through while the screen implies a control
-- that did not run. Neither. The approval proceeds and the ROW SAYS the separation could not be
-- verified (`separation_of_duties`), so it is visible, countable and finite: every scope written
-- from now on has an author, so the exception drains rather than accumulating.
alter table public.aura_crm_solution_scopes
  add column if not exists separation_of_duties text;

alter table public.aura_crm_solution_scopes
  drop constraint if exists aura_crm_scope_separation;
alter table public.aura_crm_solution_scopes
  add constraint aura_crm_scope_separation
  check (separation_of_duties is null or separation_of_duties in ('enforced','unverifiable'));

comment on column public.aura_crm_solution_scopes.separation_of_duties is
  'enforced = the approver was checked against a known author and differs. unverifiable = the scope predates authorship being recorded, so the check could not run. NULL = never approved. Never silently absent on an approved scope.';

-- @DOWN
alter table public.aura_crm_requirements      drop column if exists created_by;
alter table public.aura_crm_solution_scopes   drop constraint if exists aura_crm_scope_separation;
alter table public.aura_crm_solution_scopes   drop column if exists separation_of_duties;
alter table public.aura_crm_solution_scopes   drop column if exists created_by;

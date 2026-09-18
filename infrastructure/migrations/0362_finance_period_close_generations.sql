-- ============================================================
-- AURA OS — migration 0362: closing the books is a history, not a flag (SEC-01 / finance period close)
-- ------------------------------------------------------------
-- WHAT THIS TABLE USED TO DO. A period was closed iff a row existed for (tenant, period), and
-- REOPENING DELETED THE ROW. Executed against the running API: close → reopen → close left exactly
-- one row, reading `closedBy = <whoever closed it last>`, with no trace that the books had ever been
-- opened again. Two closes and two reopens inside one second, and the register said "closed once".
--
-- The events (`finance.period.closed` / `.reopened`) were on the spine the whole time. That is not a
-- substitute: every screen, every query and every control reads THIS TABLE, and an event log is not
-- somewhere a rule can read from at decision time. It is the same shape as the recommendation
-- withdrawal that erased its own approval, and the same shape as a status that says WHERE a record is
-- and never HOW IT GOT THERE — on the highest-consequence act in the finance register.
--
-- WHAT IT DOES NOW. Each close is a GENERATION. Reopening does not delete it; it writes who reopened
-- it, when, and WHY onto that generation, which then stays forever. A re-close writes generation n+1.
-- The period's current state is "the generation with no reopen metadata", and the whole history is
-- readable behind it.
--
-- FOUR INVARIANTS, enforced here rather than trusted to the service:
--   1. generation is unique per (tenant, period)              — a generation cannot be written twice
--   2. at most ONE generation per (tenant, period) is open    — a period cannot be closed twice over
--   3. reopen provenance is all-or-nothing                    — no "reopened by nobody, for no reason"
--   4. the currently-closed generation carries no reopen data — which is what makes (2) mean anything
-- ============================================================

alter table public.aura_finance_period_closes
  add column if not exists generation    integer not null default 1,
  add column if not exists reopened_by   text,
  add column if not exists reopened_at   timestamptz,
  add column if not exists reopen_reason text;

comment on column public.aura_finance_period_closes.generation is
  'Which close of this period this row is. 1 is the first. A reopen never deletes a generation; the next close writes the next one.';
comment on column public.aura_finance_period_closes.reopen_reason is
  'WHY the books were opened again. Required with reopened_by/at — closing may carry an optional note, reopening may not be silent.';

-- (1) A generation is written once. The old `unique (tenant_id, period)` said a period could be
-- closed only once ever, which is what forced reopening to be a DELETE in the first place.
alter table public.aura_finance_period_closes
  drop constraint if exists aura_finance_period_closes_tenant_id_period_key;
alter table public.aura_finance_period_closes
  drop constraint if exists aura_finance_period_close_generation;
alter table public.aura_finance_period_closes
  add constraint aura_finance_period_close_generation unique (tenant_id, period, generation);

alter table public.aura_finance_period_closes
  drop constraint if exists aura_finance_period_close_generation_positive;
alter table public.aura_finance_period_closes
  add constraint aura_finance_period_close_generation_positive check (generation >= 1);

-- (2) + (4) At most one OPEN generation per period, and "open" means "carries no reopen metadata".
-- One partial index states both: the current close is the row that was never reopened, and there can
-- only be one of it. Without this, two concurrent closes would both succeed and the period would be
-- closed twice with two different signatures.
drop index if exists idx_aura_finance_period_close_current;
create unique index idx_aura_finance_period_close_current
  on public.aura_finance_period_closes (tenant_id, period)
  where reopened_at is null;

-- (3) Reopen provenance is all three or none. A half-written reopen would be worse than the DELETE it
-- replaces: the row would look reopened while refusing to say by whom or why.
alter table public.aura_finance_period_closes
  drop constraint if exists aura_finance_period_close_reopen_complete;
alter table public.aura_finance_period_closes
  add constraint aura_finance_period_close_reopen_complete check (
    (reopened_by is null and reopened_at is null and reopen_reason is null)
    or (reopened_by is not null and reopened_at is not null and btrim(reopen_reason) <> '')
  );

-- Existing rows are generation 1 and were never reopened, which is exactly what they are: every
-- reopen before today deleted its row, so nothing on disk is a reopened generation. Nothing is
-- backfilled and nothing is inferred — the history that was deleted is not recoverable from here,
-- and pretending otherwise would manufacture provenance.

create index if not exists idx_aura_finance_period_close_history
  on public.aura_finance_period_closes (tenant_id, period, generation desc);

-- @DOWN
drop index if exists idx_aura_finance_period_close_history;
drop index if exists idx_aura_finance_period_close_current;
alter table public.aura_finance_period_closes drop constraint if exists aura_finance_period_close_reopen_complete;
alter table public.aura_finance_period_closes drop constraint if exists aura_finance_period_close_generation_positive;
alter table public.aura_finance_period_closes drop constraint if exists aura_finance_period_close_generation;
alter table public.aura_finance_period_closes drop column if exists reopen_reason;
alter table public.aura_finance_period_closes drop column if exists reopened_at;
alter table public.aura_finance_period_closes drop column if exists reopened_by;
alter table public.aura_finance_period_closes drop column if exists generation;

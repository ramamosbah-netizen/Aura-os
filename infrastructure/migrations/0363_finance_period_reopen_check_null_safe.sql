-- ============================================================
-- AURA OS — migration 0363: the reopen-provenance check actually refuses a missing reason
-- ------------------------------------------------------------
-- 0362 added this constraint to make a half-written reopen impossible:
--
--   check (
--     (reopened_by is null and reopened_at is null and reopen_reason is null)
--     or (reopened_by is not null and reopened_at is not null and btrim(reopen_reason) <> '')
--   )
--
-- IT DID NOT REFUSE THE MOST IMPORTANT CASE. With `reopened_by` and `reopened_at` set and
-- `reopen_reason` left NULL, the second branch evaluates to
--
--   TRUE AND TRUE AND (btrim(NULL) <> '')  ->  TRUE AND TRUE AND NULL  ->  NULL
--
-- and `FALSE OR NULL` is NULL. A CHECK constraint rejects a row only when it evaluates to FALSE —
-- NULL passes. So a reopen naming who and when while refusing to say WHY was accepted by the
-- database, which is precisely the row 0362 was written to make impossible. Proved against a real
-- PostgreSQL before this migration existed: the UPDATE returned rowCount 1.
--
-- The fix is to test for the NULL explicitly rather than let a comparison against it decide. Same
-- three-valued-logic trap that makes `x <> ''` quietly useless whenever x may be NULL.
-- ============================================================

-- No row on disk can violate the stricter form: 0362's version already refused every case that
-- evaluated to FALSE, and the NULL case has been reachable only since 0362 shipped in this branch.
-- If one somehow exists, the ALTER fails loudly here rather than leaving a constraint that lies.
alter table public.aura_finance_period_closes
  drop constraint if exists aura_finance_period_close_reopen_complete;
alter table public.aura_finance_period_closes
  add constraint aura_finance_period_close_reopen_complete check (
    (reopened_by is null and reopened_at is null and reopen_reason is null)
    or (
      reopened_by is not null
      and reopened_at is not null
      and reopen_reason is not null
      and btrim(reopen_reason) <> ''
    )
  );

-- @DOWN
alter table public.aura_finance_period_closes
  drop constraint if exists aura_finance_period_close_reopen_complete;

-- ============================================================
-- AURA OS kernel — migration 0013: outbox dead-letter cap
-- ------------------------------------------------------------
-- The OutboxRelay records `processing_error` and retries an event whose handler throws.
-- This adds an `attempts` counter so a permanently-failing (poison) event is dead-lettered
-- after OUTBOX_MAX_ATTEMPTS — stamped processed_at (stop retrying) WITH processing_error
-- kept (inspectable). Dead-lettered = processed_at IS NOT NULL AND processing_error IS NOT NULL.
-- Apply with `pnpm db:migrate`.
-- ============================================================

alter table public.aura_events add column if not exists attempts integer not null default 0;

-- The dead-letters query: processed (gave up) rows that still carry an error.
create index if not exists idx_aura_events_dead
  on public.aura_events (processed_at desc)
  where processing_error is not null and processed_at is not null;

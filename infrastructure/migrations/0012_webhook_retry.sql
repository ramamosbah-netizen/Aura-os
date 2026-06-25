-- ============================================================
-- AURA OS kernel — migration 0012: webhook delivery retry / dead-letter
-- ------------------------------------------------------------
-- Hardens outbound delivery: a failed POST is recorded `pending` with the request body
-- and a `next_attempt_at`; the WebhookRetryWorker re-sends with exponential backoff and
-- `dead`-letters after the max attempts (poison-pill guard). Apply with `pnpm db:migrate`.
-- ============================================================

alter table public.aura_webhook_deliveries add column if not exists attempts        integer not null default 1;
alter table public.aura_webhook_deliveries add column if not exists next_attempt_at  timestamptz;
alter table public.aura_webhook_deliveries add column if not exists body             text;

-- The worker's claim query: pending deliveries whose retry time is due.
create index if not exists idx_aura_webhook_deliveries_pending
  on public.aura_webhook_deliveries (next_attempt_at)
  where status = 'pending';

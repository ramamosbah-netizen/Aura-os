-- ============================================================
-- AURA OS — migration 0254: cost ledger durable idempotency (dedupe_key)
-- ------------------------------------------------------------
-- The event outbox retries at the EVENT level: when one subscriber throws, the relay replays the
-- WHOLE event, re-running every subscriber of that type. The cost ledger's `post` appends
-- unconditionally, so a replay used to double-count committed/actual cost and move the CBS balance
-- twice — which is why those reactors were forced to swallow their failures (bestEffort) instead of
-- being retried. A durable per-post dedupe key lets `post` become idempotent, so its reactors can
-- safely propagate failures to the outbox again. Same pattern as aura_crm_signals (0158). Additive.
-- ============================================================

alter table public.aura_projects_cost_ledger
  add column if not exists dedupe_key text;

-- One transaction per (tenant, dedupe_key); a NULL key opts out (legacy / unkeyed posts unaffected).
create unique index if not exists uq_aura_cost_ledger_dedupe
  on public.aura_projects_cost_ledger (tenant_id, dedupe_key) where dedupe_key is not null;

-- @DOWN
drop index if exists public.uq_aura_cost_ledger_dedupe;
alter table public.aura_projects_cost_ledger drop column if exists dedupe_key;

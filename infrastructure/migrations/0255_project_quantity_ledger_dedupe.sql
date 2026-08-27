-- ============================================================
-- AURA OS — migration 0255: quantity ledger durable idempotency (dedupe_key)
-- ------------------------------------------------------------
-- The physical twin of 0254. The quantity ledger's `post` appends unconditionally, so an outbox
-- event replay double-counted a BOQ item's ordered/received/issued/installed/approved/invoiced
-- position — forcing its reactors to swallow failures. A durable per-post dedupe key makes `post`
-- idempotent so those reactors can propagate failures to the outbox again. Additive.
-- ============================================================

alter table public.aura_projects_quantity_ledger
  add column if not exists dedupe_key text;

-- One transaction per (tenant, dedupe_key); a NULL key opts out (legacy / unkeyed posts unaffected).
create unique index if not exists uq_aura_quantity_ledger_dedupe
  on public.aura_projects_quantity_ledger (tenant_id, dedupe_key) where dedupe_key is not null;

-- @DOWN
drop index if exists public.uq_aura_quantity_ledger_dedupe;
alter table public.aura_projects_quantity_ledger drop column if exists dedupe_key;

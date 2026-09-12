-- ============================================================
-- AURA OS — migration 0306: per-handler event delivery log (TC-GATE-22)
-- ------------------------------------------------------------
-- `EventBus.publish` fans one event out to EVERY subscriber with `Promise.all`, and the outbox relay
-- retries the whole EVENT when that promise rejects. So one handler's failure re-runs every sibling
-- that already SUCCEEDED — including sinks documented in the code as unsafe on replay:
--
--   * inventory.stock.movement_recorded has four subscribers. One is `retryable`; two are
--     `bestEffort` precisely because "journals.post is not idempotent; a retry would double-post the
--     GL entry" and "PR create is not idempotent".
--   * every event also reaches the webhook dispatcher, which POSTs to a customer endpoint.
--
-- This table records that a NAMED handler completed a GIVEN event, so a retry can skip the work that
-- already happened and re-run only what did not. The retry decision stays per handler, which is what
-- the call sites in cross-module-subscriber.ts have always claimed it was.
--
-- APPEND-ONLY: SELECT and INSERT policies only, no UPDATE and no DELETE. A delivery record is
-- evidence that a side effect happened; editing one would be editing history, and the whole point of
-- the row is that it can be trusted on the retry path.
--
-- The unique key is what makes recording safe to repeat: two relays racing the same event both
-- INSERT, one conflicts, neither errors.
-- ============================================================

create table if not exists public.aura_event_handler_deliveries (
  id           text        primary key,
  tenant_id    text        not null,
  event_id     text        not null,
  handler      text        not null,
  delivered_at timestamptz not null default now()
);

-- One record per (tenant, event, handler). `on conflict do nothing` leans on this.
create unique index if not exists uq_aura_event_handler_delivery
  on public.aura_event_handler_deliveries (tenant_id, event_id, handler);

-- The relay's question is "what has already run for this event?", asked once per event.
create index if not exists idx_aura_event_handler_delivery_event
  on public.aura_event_handler_deliveries (tenant_id, event_id);

alter table public.aura_event_handler_deliveries enable row level security;
alter table public.aura_event_handler_deliveries force row level security;

drop policy if exists tenant_isolation_select on public.aura_event_handler_deliveries;
create policy tenant_isolation_select on public.aura_event_handler_deliveries
  for select
  using (tenant_id = public.current_tenant_id() and public.current_tenant_id() is not null);

drop policy if exists tenant_isolation_insert on public.aura_event_handler_deliveries;
create policy tenant_isolation_insert on public.aura_event_handler_deliveries
  for insert
  with check (tenant_id = public.current_tenant_id() and public.current_tenant_id() is not null);

-- @DOWN
drop table if exists public.aura_event_handler_deliveries;

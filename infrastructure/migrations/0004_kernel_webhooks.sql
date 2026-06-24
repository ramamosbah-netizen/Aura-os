-- ============================================================
-- AURA OS kernel — migration 0004: Integration skeleton (outbound webhooks)
-- ------------------------------------------------------------
-- Turns the event stream into something external systems consume. A subscription
-- matches event-type patterns; the WebhookDispatcher (a bus subscriber) POSTs a
-- signed payload and logs every delivery attempt. Namespaced `aura_*` (see 0001).
-- Apply with `pnpm db:migrate`.
-- ============================================================

create table if not exists public.aura_webhook_subscriptions (
  id          uuid        primary key,
  tenant_id   text        not null,
  event_types jsonb       not null default '[]'::jsonb,
  url         text        not null,
  secret      text        not null,
  active      boolean     not null default true,
  created_at  timestamptz not null default now()
);

create table if not exists public.aura_webhook_deliveries (
  id              uuid        primary key,
  subscription_id uuid        not null references public.aura_webhook_subscriptions (id) on delete cascade,
  event_id        uuid        not null,
  event_type      text        not null,
  url             text        not null,
  status          text        not null,
  status_code     integer,
  error           text,
  attempted_at    timestamptz not null default now()
);

create index if not exists idx_aura_webhook_subs_active on public.aura_webhook_subscriptions (tenant_id) where active;
create index if not exists idx_aura_webhook_deliveries  on public.aura_webhook_deliveries (subscription_id, attempted_at desc);

-- Lock down: RLS on, no policies → only the service-role back-end touches these.
alter table public.aura_webhook_subscriptions enable row level security;
alter table public.aura_webhook_deliveries    enable row level security;

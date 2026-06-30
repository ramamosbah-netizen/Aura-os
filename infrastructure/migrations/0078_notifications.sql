-- ============================================================
-- AURA OS — migration 0078: Notifications (notification center)
-- ------------------------------------------------------------
-- Durable record of in-app notifications raised from spine events; the inbox + read state.
-- Channel delivery (email/SMS/slack) is dispatched separately by NotificationService.
-- ============================================================

create table if not exists public.aura_notifications (
  id         uuid        primary key default gen_random_uuid(),
  tenant_id  text        not null,
  user_id    text,
  title      text        not null,
  body       text        not null,
  category   text        not null default 'general',
  ref_type   text,
  ref_id     text,
  read       boolean     not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_aura_notifications_tenant on public.aura_notifications (tenant_id, read, created_at desc);

alter table public.aura_notifications enable row level security;

create policy notifications_rls on public.aura_notifications
  for all using (tenant_id = public.current_tenant_id());

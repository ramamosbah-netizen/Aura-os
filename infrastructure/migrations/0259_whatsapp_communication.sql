-- AURA OS — migration 0259: WhatsApp Business Cloud API channel
-- Credentials never live in these tables; use the Admin/secret environment layer.
create table if not exists public.aura_comms_whatsapp_threads (
  id uuid primary key,
  tenant_id text not null,
  company_id text,
  provider_account_id uuid not null,
  phone_e164 text not null,
  display_name text not null default '',
  external_conversation_id text,
  contact_id uuid,
  account_id uuid,
  owner_user_id text,
  unread_count integer not null default 0 check (unread_count >= 0),
  last_message_at timestamptz,
  last_preview text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, provider_account_id, phone_e164)
);
create index if not exists idx_comms_whatsapp_threads_visible
  on public.aura_comms_whatsapp_threads (tenant_id, company_id, last_message_at desc);
alter table public.aura_comms_whatsapp_threads enable row level security;
alter table public.aura_comms_whatsapp_threads force row level security;
drop policy if exists tenant_isolation on public.aura_comms_whatsapp_threads;
create policy tenant_isolation on public.aura_comms_whatsapp_threads
  using (tenant_id::text = public.current_tenant_id() and public.current_tenant_id() is not null)
  with check (tenant_id::text = public.current_tenant_id() and public.current_tenant_id() is not null);

create table if not exists public.aura_comms_whatsapp_messages (
  id uuid primary key,
  tenant_id text not null,
  company_id text,
  provider_account_id uuid not null,
  thread_id uuid not null references public.aura_comms_whatsapp_threads(id) on delete cascade,
  external_message_id text,
  direction text not null check (direction in ('inbound', 'outbound')),
  status text not null check (status in ('received', 'queued', 'sent', 'delivered', 'read', 'failed')),
  message_type text not null default 'text',
  body text not null default '',
  media_id text,
  failed_reason text,
  sender text not null,
  occurred_at timestamptz not null,
  raw_payload jsonb,
  created_at timestamptz not null default now(),
  unique (tenant_id, provider_account_id, external_message_id)
);
create index if not exists idx_comms_whatsapp_messages_thread
  on public.aura_comms_whatsapp_messages (tenant_id, thread_id, occurred_at);
create index if not exists idx_comms_whatsapp_messages_external
  on public.aura_comms_whatsapp_messages (tenant_id, provider_account_id, external_message_id);
alter table public.aura_comms_whatsapp_messages enable row level security;
alter table public.aura_comms_whatsapp_messages force row level security;
drop policy if exists tenant_isolation on public.aura_comms_whatsapp_messages;
create policy tenant_isolation on public.aura_comms_whatsapp_messages
  using (tenant_id::text = public.current_tenant_id() and public.current_tenant_id() is not null)
  with check (tenant_id::text = public.current_tenant_id() and public.current_tenant_id() is not null);

-- Status-only webhook deliveries have no message insert, so retain a cheap replay/idempotency key.
create table if not exists public.aura_comms_whatsapp_webhook_events (
  id uuid primary key,
  tenant_id text not null,
  provider_account_id uuid not null,
  external_event_id text not null,
  payload jsonb not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  error text,
  unique (tenant_id, provider_account_id, external_event_id)
);
alter table public.aura_comms_whatsapp_webhook_events enable row level security;
alter table public.aura_comms_whatsapp_webhook_events force row level security;
drop policy if exists tenant_isolation on public.aura_comms_whatsapp_webhook_events;
create policy tenant_isolation on public.aura_comms_whatsapp_webhook_events
  using (tenant_id::text = public.current_tenant_id() and public.current_tenant_id() is not null)
  with check (tenant_id::text = public.current_tenant_id() and public.current_tenant_id() is not null);

-- @DOWN
drop table if exists public.aura_comms_whatsapp_webhook_events;
drop table if exists public.aura_comms_whatsapp_messages;
drop table if exists public.aura_comms_whatsapp_threads;

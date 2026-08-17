-- ============================================================
-- AURA OS — migration 0234: Communication persistence (C1)
-- ------------------------------------------------------------
-- Team chat and internal mail were held in a per-process `Map()` inside CommsService: every
-- channel message, every mail, every read receipt was lost on API restart, and nothing could be
-- audited, searched across sessions, or threaded. This gives Communication a real store.
--
-- Two things are deliberately modelled properly now rather than bolted on later:
--
--   * THREADING. aura_comms_mail carries thread_id + parent_mail_id, so a reply is a real edge to
--     its parent instead of a subject prefixed with "Re:". forwarded_from_mail_id keeps the source
--     of a forward addressable, so the copy can show what it came from.
--   * READ STATE PER RECIPIENT. The old shape was a readBy array on the mail; a recipient row with
--     its own read_at is what lets "unread for me" be a query rather than a scan.
--
-- Attachments carry document_id so a message can reference a canonical DMS document. data_url is
-- retained ONLY because the current chat composer posts one (5 MB dev transport) and C1 must not
-- break it; C4 moves file sharing onto the document store and this column goes away with it.
--
-- Meetings and provider credentials are NOT here — they belong to C5/C6 and would be dead schema
-- until then. All tables are FORCE-RLS tenant-isolated.
-- ============================================================

-- ── Channels + membership ───────────────────────────────────────────────────
create table if not exists public.aura_comms_channels (
  id           uuid        primary key,
  tenant_id    text        not null,
  company_id   text,
  kind         text        not null default 'team',   -- company | department | team | dm | project
  name         text        not null,
  -- Optional canonical reference. A project channel points AT a project; it never owns one.
  project_id   text,
  created_by   text        not null,
  created_at   timestamptz not null default now(),
  constraint aura_comms_channels_kind_check check (kind in ('company', 'department', 'team', 'dm', 'project'))
);

create index if not exists idx_comms_channels_tenant on public.aura_comms_channels (tenant_id, company_id);
create unique index if not exists uq_comms_channels_tenant_name on public.aura_comms_channels (tenant_id, name);

alter table public.aura_comms_channels enable row level security;
alter table public.aura_comms_channels force row level security;
drop policy if exists tenant_isolation on public.aura_comms_channels;
create policy tenant_isolation on public.aura_comms_channels
  using (tenant_id::text = public.current_tenant_id() and public.current_tenant_id() is not null)
  with check (tenant_id::text = public.current_tenant_id() and public.current_tenant_id() is not null);

create table if not exists public.aura_comms_channel_members (
  tenant_id  text        not null,
  channel_id uuid        not null,
  username   text        not null,
  joined_at  timestamptz not null default now(),
  primary key (tenant_id, channel_id, username)
);

create index if not exists idx_comms_members_user on public.aura_comms_channel_members (tenant_id, username);

alter table public.aura_comms_channel_members enable row level security;
alter table public.aura_comms_channel_members force row level security;
drop policy if exists tenant_isolation on public.aura_comms_channel_members;
create policy tenant_isolation on public.aura_comms_channel_members
  using (tenant_id::text = public.current_tenant_id() and public.current_tenant_id() is not null)
  with check (tenant_id::text = public.current_tenant_id() and public.current_tenant_id() is not null);

-- ── Messages ────────────────────────────────────────────────────────────────
create table if not exists public.aura_comms_messages (
  id         uuid        primary key,
  tenant_id  text        not null,
  company_id text,
  channel_id uuid        not null,
  sender     text        not null,
  kind       text        not null default 'text',     -- text | file | voice
  body       text        not null default '',
  sent_at    timestamptz not null default now(),
  constraint aura_comms_messages_kind_check check (kind in ('text', 'file', 'voice'))
);

-- The conversation view reads one channel newest-last; the history register reads a tenant by date.
create index if not exists idx_comms_messages_channel on public.aura_comms_messages (tenant_id, channel_id, sent_at);
create index if not exists idx_comms_messages_tenant_sent on public.aura_comms_messages (tenant_id, sent_at desc);

alter table public.aura_comms_messages enable row level security;
alter table public.aura_comms_messages force row level security;
drop policy if exists tenant_isolation on public.aura_comms_messages;
create policy tenant_isolation on public.aura_comms_messages
  using (tenant_id::text = public.current_tenant_id() and public.current_tenant_id() is not null)
  with check (tenant_id::text = public.current_tenant_id() and public.current_tenant_id() is not null);

-- Per-user, per-channel read watermark — the shape the unread badge actually queries.
create table if not exists public.aura_comms_message_reads (
  tenant_id    text        not null,
  channel_id   uuid        not null,
  username     text        not null,
  last_read_at timestamptz not null default now(),
  primary key (tenant_id, channel_id, username)
);

alter table public.aura_comms_message_reads enable row level security;
alter table public.aura_comms_message_reads force row level security;
drop policy if exists tenant_isolation on public.aura_comms_message_reads;
create policy tenant_isolation on public.aura_comms_message_reads
  using (tenant_id::text = public.current_tenant_id() and public.current_tenant_id() is not null)
  with check (tenant_id::text = public.current_tenant_id() and public.current_tenant_id() is not null);

-- ── Internal mail, with real threading ──────────────────────────────────────
create table if not exists public.aura_comms_mail (
  id                    uuid        primary key,
  tenant_id             text        not null,
  company_id            text,
  from_user             text        not null,
  subject               text        not null default '',
  body                  text        not null default '',
  sent_at               timestamptz not null default now(),
  -- A root mail is its own thread. A reply inherits thread_id and points at its parent, so the
  -- conversation is an edge walk rather than a subject-line guess.
  thread_id             uuid        not null,
  parent_mail_id        uuid,
  forwarded_from_mail_id uuid
);

create index if not exists idx_comms_mail_thread on public.aura_comms_mail (tenant_id, thread_id, sent_at);
create index if not exists idx_comms_mail_from on public.aura_comms_mail (tenant_id, from_user, sent_at desc);

alter table public.aura_comms_mail enable row level security;
alter table public.aura_comms_mail force row level security;
drop policy if exists tenant_isolation on public.aura_comms_mail;
create policy tenant_isolation on public.aura_comms_mail
  using (tenant_id::text = public.current_tenant_id() and public.current_tenant_id() is not null)
  with check (tenant_id::text = public.current_tenant_id() and public.current_tenant_id() is not null);

create table if not exists public.aura_comms_mail_recipients (
  tenant_id text        not null,
  mail_id   uuid        not null,
  username  text        not null,
  kind      text        not null default 'to',        -- to | cc | bcc
  read_at   timestamptz,
  primary key (tenant_id, mail_id, username),
  constraint aura_comms_mail_recipients_kind_check check (kind in ('to', 'cc', 'bcc'))
);

-- "My inbox, unread first" is the hot path.
create index if not exists idx_comms_mail_recipients_user on public.aura_comms_mail_recipients (tenant_id, username, read_at);

alter table public.aura_comms_mail_recipients enable row level security;
alter table public.aura_comms_mail_recipients force row level security;
drop policy if exists tenant_isolation on public.aura_comms_mail_recipients;
create policy tenant_isolation on public.aura_comms_mail_recipients
  using (tenant_id::text = public.current_tenant_id() and public.current_tenant_id() is not null)
  with check (tenant_id::text = public.current_tenant_id() and public.current_tenant_id() is not null);

-- ── Attachments (one shape for both message and mail) ───────────────────────
create table if not exists public.aura_comms_attachments (
  id           uuid        primary key,
  tenant_id    text        not null,
  -- Exactly one of these is set; the check below enforces it.
  message_id   uuid,
  mail_id      uuid,
  name         text        not null,
  mime         text        not null,
  size_bytes   bigint      not null default 0,
  -- Canonical DMS reference. This is the target shape: Communication points at a document, the
  -- document module owns the bytes and their permissions.
  document_id  uuid,
  -- Dev transport retained so the existing chat composer keeps working; removed in C4 when file
  -- sharing moves onto the document store. Never the intended production path for bytes.
  data_url     text,
  created_at   timestamptz not null default now(),
  constraint aura_comms_attachments_owner_check check (
    (message_id is not null and mail_id is null) or (message_id is null and mail_id is not null)
  )
);

create index if not exists idx_comms_attachments_message on public.aura_comms_attachments (tenant_id, message_id);
create index if not exists idx_comms_attachments_mail on public.aura_comms_attachments (tenant_id, mail_id);

alter table public.aura_comms_attachments enable row level security;
alter table public.aura_comms_attachments force row level security;
drop policy if exists tenant_isolation on public.aura_comms_attachments;
create policy tenant_isolation on public.aura_comms_attachments
  using (tenant_id::text = public.current_tenant_id() and public.current_tenant_id() is not null)
  with check (tenant_id::text = public.current_tenant_id() and public.current_tenant_id() is not null);

-- ── Optional context: references to canonical records, never ownership ──────
create table if not exists public.aura_comms_context (
  id           uuid        primary key,
  tenant_id    text        not null,
  subject_type text        not null,                  -- message | mail | meeting
  subject_id   uuid        not null,
  ref_type     text        not null,                  -- project | contact | document | work_item | approval
  ref_id       text        not null,
  created_at   timestamptz not null default now(),
  constraint aura_comms_context_subject_check check (subject_type in ('message', 'mail', 'meeting')),
  constraint aura_comms_context_ref_check check (ref_type in ('project', 'contact', 'document', 'work_item', 'approval'))
);

create index if not exists idx_comms_context_subject on public.aura_comms_context (tenant_id, subject_type, subject_id);
-- "All communication about project X" — the reason this table exists.
create index if not exists idx_comms_context_ref on public.aura_comms_context (tenant_id, ref_type, ref_id);

alter table public.aura_comms_context enable row level security;
alter table public.aura_comms_context force row level security;
drop policy if exists tenant_isolation on public.aura_comms_context;
create policy tenant_isolation on public.aura_comms_context
  using (tenant_id::text = public.current_tenant_id() and public.current_tenant_id() is not null)
  with check (tenant_id::text = public.current_tenant_id() and public.current_tenant_id() is not null);

-- @DOWN
drop table if exists public.aura_comms_context;
drop table if exists public.aura_comms_attachments;
drop table if exists public.aura_comms_mail_recipients;
drop table if exists public.aura_comms_mail;
drop table if exists public.aura_comms_message_reads;
drop table if exists public.aura_comms_messages;
drop table if exists public.aura_comms_channel_members;
drop table if exists public.aura_comms_channels;

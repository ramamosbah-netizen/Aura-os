-- ============================================================
-- AURA OS — migration 0235: Communication foundation (C3.0)
-- ------------------------------------------------------------
-- The common layer every communication channel shares, introduced BEFORE Email, WhatsApp and
-- Meetings exist rather than after. Today only two channels are written (internal chat and
-- internal mail) and aura_comms_context is written by nothing at all, so reshaping the shared
-- pieces costs one migration. After three more channels it would cost a data migration across
-- live conversations, attachments and scheduled sends.
--
-- Zero user-visible behaviour change: nothing here is read or written by the running code yet.
--
-- OWNERSHIP — checked against the existing schema before writing, so this adds no second copy of:
--   * CRM contacts        aura_crm_contacts owns name/job_title/email/phone/account/status/owner.
--                         Participants here carry the ENVELOPE only (the address a message was
--                         actually sent to, plus the name the provider put on it) and a nullable
--                         reference to the canonical contact.
--   * DMS documents       aura_documents + aura_document_versions own the bytes, versions and
--                         permissions. Attachments here reference document_id; they never store a
--                         second copy of a file.
--   * identity            aura_users owns users, aura_companies owns companies. tenant_id and
--                         company_id are used as SCOPE columns exactly as every other table uses
--                         them — no new identity source.
--   * outbox              aura_events is a domain-event relay with no time column; the relay
--                         drains unprocessed rows immediately. Dispatch below is time-based
--                         execution of an already-decided action, which is a different job.
-- ============================================================

-- ── Participants ────────────────────────────────────────────────────────────
-- One shape for "who was on this communication", across mail recipients, WhatsApp counterparties
-- and meeting attendees. An external sender with no CRM record must still be storable, so
-- contact_id is nullable and resolvable later — requiring it would break on the first external
-- email, which is exactly the case this table exists for.
create table if not exists public.aura_comms_participants (
  id           uuid        primary key,
  tenant_id    text        not null,
  subject_type text        not null,               -- mail | whatsapp | meeting | file_share
  subject_id   uuid        not null,
  role         text        not null,               -- from | to | cc | bcc | attendee | organizer
  -- The address as it appeared on the envelope: an email address, an E.164 number, or an AURA
  -- username for internal participants. This is transport data, not a contact record.
  address      text        not null,
  display_name text,                               -- the name the provider supplied, if any
  -- References to canonical records. Nullable on purpose: an unknown external address has neither.
  contact_id   uuid,                               -- → aura_crm_contacts.id
  user_id      text,                               -- → aura_users.user_id
  created_at   timestamptz not null default now(),
  constraint aura_comms_participants_subject_check check (subject_type in ('mail', 'whatsapp', 'meeting', 'file_share')),
  constraint aura_comms_participants_role_check check (role in ('from', 'to', 'cc', 'bcc', 'attendee', 'organizer'))
);

create index if not exists idx_comms_participants_subject on public.aura_comms_participants (tenant_id, subject_type, subject_id);
-- "everything involving this address / this contact" — the contact-centric view and, later, the
-- AI's ability to stitch a client's email to their WhatsApp to their meeting.
create index if not exists idx_comms_participants_address on public.aura_comms_participants (tenant_id, address);
create index if not exists idx_comms_participants_contact on public.aura_comms_participants (tenant_id, contact_id) where contact_id is not null;

alter table public.aura_comms_participants enable row level security;
alter table public.aura_comms_participants force row level security;
drop policy if exists tenant_isolation on public.aura_comms_participants;
create policy tenant_isolation on public.aura_comms_participants
  using (tenant_id::text = public.current_tenant_id() and public.current_tenant_id() is not null)
  with check (tenant_id::text = public.current_tenant_id() and public.current_tenant_id() is not null);

-- ── Provider accounts ───────────────────────────────────────────────────────
-- A reference to a connected account and its current state. Deliberately holds NO OAuth token,
-- refresh token, client secret or webhook secret: credentials belong to the Admin Center
-- integration layer, and Communication only needs to know which account to act through and
-- whether it is currently usable. A leaked row here must not be able to send anything.
create table if not exists public.aura_comms_accounts (
  id                  uuid        primary key,
  tenant_id           text        not null,
  company_id          text,
  channel             text        not null,        -- email | whatsapp | meeting
  provider            text        not null,        -- aura-internal | microsoft365 | gmail | whatsapp-business | teams | zoom | google-meet
  -- The account's identifier AT the provider (mailbox address, WABA phone id, tenant user id).
  external_account_id text,
  display_label       text        not null default '',
  -- What this account may actually do, so the UI can offer send/schedule only where it is real.
  capabilities        jsonb       not null default '[]'::jsonb,  -- ["send","receive","schedule"]
  status              text        not null default 'not_configured',
  -- Which AURA user this account belongs to. Null = shared/tenant-level account.
  owner_user_id       text,
  last_synced_at      timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint aura_comms_accounts_channel_check check (channel in ('email', 'whatsapp', 'meeting')),
  constraint aura_comms_accounts_status_check check (
    status in ('not_configured', 'connecting', 'connected', 'degraded', 'error', 'disabled')
  )
);

create index if not exists idx_comms_accounts_tenant on public.aura_comms_accounts (tenant_id, channel, status);
create index if not exists idx_comms_accounts_owner on public.aura_comms_accounts (tenant_id, owner_user_id) where owner_user_id is not null;

alter table public.aura_comms_accounts enable row level security;
alter table public.aura_comms_accounts force row level security;
drop policy if exists tenant_isolation on public.aura_comms_accounts;
create policy tenant_isolation on public.aura_comms_accounts
  using (tenant_id::text = public.current_tenant_id() and public.current_tenant_id() is not null)
  with check (tenant_id::text = public.current_tenant_id() and public.current_tenant_id() is not null);

-- ── Scheduled dispatch ──────────────────────────────────────────────────────
-- EXECUTION INFRASTRUCTURE, not domain state. A mail's own lifecycle (draft/scheduled/sent) stays
-- on the mail; this table only answers "run this at that time, and what happened when we tried".
-- Keeping the two apart is what stops a retry counter from becoming part of the business record.
--
-- Follows the proven aura_events relay shape: claim with FOR UPDATE SKIP LOCKED, count attempts,
-- dead-letter with the error rather than retrying forever.
create table if not exists public.aura_comms_dispatch (
  id                 uuid        primary key,
  tenant_id          text        not null,
  company_id         text,
  subject_type       text        not null,          -- mail | whatsapp | meeting
  subject_id         uuid        not null,
  account_id         uuid,                          -- → aura_comms_accounts.id
  -- Stored in UTC. scheduled_timezone records what the user actually chose, so "08:00 Dubai" can
  -- be shown back, audited and recomputed — a UTC instant alone loses the user's intent.
  scheduled_at       timestamptz not null,
  scheduled_timezone text        not null default 'UTC',
  state              text        not null default 'pending',
  attempts           integer     not null default 0,
  last_error         text,
  claimed_at         timestamptz,
  processed_at       timestamptz,
  cancelled_at       timestamptz,
  created_by         text,
  created_at         timestamptz not null default now(),
  constraint aura_comms_dispatch_subject_check check (subject_type in ('mail', 'whatsapp', 'meeting')),
  constraint aura_comms_dispatch_state_check check (
    state in ('pending', 'claimed', 'processing', 'done', 'failed', 'cancelled')
  )
);

-- The worker's only query: what is due and still runnable.
create index if not exists idx_comms_dispatch_due on public.aura_comms_dispatch (scheduled_at)
  where state in ('pending', 'claimed');
create index if not exists idx_comms_dispatch_subject on public.aura_comms_dispatch (tenant_id, subject_type, subject_id);

alter table public.aura_comms_dispatch enable row level security;
alter table public.aura_comms_dispatch force row level security;
drop policy if exists tenant_isolation on public.aura_comms_dispatch;
create policy tenant_isolation on public.aura_comms_dispatch
  using (tenant_id::text = public.current_tenant_id() and public.current_tenant_id() is not null)
  with check (tenant_id::text = public.current_tenant_id() and public.current_tenant_id() is not null);

-- ── Timeline index ──────────────────────────────────────────────────────────
-- A NARROW PROJECTION, never a source of truth. One row per communication event, pointing at the
-- record that owns it. `title` and `preview` are derived labels so the Overview timeline can
-- render without joining four domains; anything that must be correct is read from subject_id.
-- Deleting and rebuilding this table must never lose information.
--
-- `visibility` carries the same answer the channel already computed, so the timeline — and later
-- the Communication Copilot — inherits authorization instead of re-deriving it, which is the
-- worst possible place to duplicate a security rule.
create table if not exists public.aura_comms_timeline (
  id            uuid        primary key,
  tenant_id     text        not null,
  company_id    text,
  occurred_at   timestamptz not null,
  channel       text        not null,               -- chat | mail | whatsapp | meeting | file_share
  direction     text        not null,               -- inbound | outbound | internal
  actor         text,                               -- AURA username or external address
  subject_type  text        not null,
  subject_id    uuid        not null,
  title         text        not null default '',    -- derived label
  preview       text,                               -- derived, truncated
  -- Optional canonical links, copied from context so the common queries need no join.
  contact_id    uuid,
  project_id    text,
  -- Who may see this row: the channel's own answer, denormalised for filtering.
  visibility    text        not null default 'participants',  -- participants | channel | tenant
  visibility_key text,                              -- channel id, or the mail/meeting id
  created_at    timestamptz not null default now(),
  constraint aura_comms_timeline_channel_check check (channel in ('chat', 'mail', 'whatsapp', 'meeting', 'file_share')),
  constraint aura_comms_timeline_direction_check check (direction in ('inbound', 'outbound', 'internal')),
  constraint aura_comms_timeline_visibility_check check (visibility in ('participants', 'channel', 'tenant'))
);

-- The Overview query: newest first, optionally filtered by channel.
create index if not exists idx_comms_timeline_recent on public.aura_comms_timeline (tenant_id, occurred_at desc);
create index if not exists idx_comms_timeline_channel on public.aura_comms_timeline (tenant_id, channel, occurred_at desc);
create index if not exists idx_comms_timeline_contact on public.aura_comms_timeline (tenant_id, contact_id, occurred_at desc) where contact_id is not null;
-- One row per event: re-indexing the same activity must not double it.
create unique index if not exists uq_comms_timeline_subject on public.aura_comms_timeline (tenant_id, subject_type, subject_id);

alter table public.aura_comms_timeline enable row level security;
alter table public.aura_comms_timeline force row level security;
drop policy if exists tenant_isolation on public.aura_comms_timeline;
create policy tenant_isolation on public.aura_comms_timeline
  using (tenant_id::text = public.current_tenant_id() and public.current_tenant_id() is not null)
  with check (tenant_id::text = public.current_tenant_id() and public.current_tenant_id() is not null);

-- ── Attachments become polymorphic ──────────────────────────────────────────
-- The 0234 shape pinned exactly two owners (message_id XOR mail_id), so every new channel would
-- have added another nullable column and rewritten the constraint. owner_type/owner_id carries
-- WhatsApp media and meeting files without touching the table again. Existing rows are migrated
-- in place; document_id still points at the canonical DMS record.
alter table public.aura_comms_attachments add column if not exists owner_type text;
alter table public.aura_comms_attachments add column if not exists owner_id   uuid;

update public.aura_comms_attachments
   set owner_type = case when message_id is not null then 'message' else 'mail' end,
       owner_id   = coalesce(message_id, mail_id)
 where owner_type is null;

alter table public.aura_comms_attachments drop constraint if exists aura_comms_attachments_owner_check;
alter table public.aura_comms_attachments
  add constraint aura_comms_attachments_owner_type_check
  check (owner_type is null or owner_type in ('message', 'mail', 'whatsapp', 'meeting'));

create index if not exists idx_comms_attachments_owner on public.aura_comms_attachments (tenant_id, owner_type, owner_id);

-- ── Context widens to the whole workspace ───────────────────────────────────
-- Nothing writes this table yet, so widening it is free. company and opportunity are added
-- because "which client, which deal" is the question the Overview timeline and the future
-- Copilot are actually asked.
alter table public.aura_comms_context drop constraint if exists aura_comms_context_subject_check;
alter table public.aura_comms_context
  add constraint aura_comms_context_subject_check
  check (subject_type in ('message', 'mail', 'meeting', 'whatsapp', 'file_share'));

alter table public.aura_comms_context drop constraint if exists aura_comms_context_ref_check;
alter table public.aura_comms_context
  add constraint aura_comms_context_ref_check
  check (ref_type in ('project', 'contact', 'company', 'opportunity', 'document', 'work_item', 'approval'));

-- @DOWN
alter table public.aura_comms_context drop constraint if exists aura_comms_context_ref_check;
alter table public.aura_comms_context
  add constraint aura_comms_context_ref_check
  check (ref_type in ('project', 'contact', 'document', 'work_item', 'approval'));
alter table public.aura_comms_context drop constraint if exists aura_comms_context_subject_check;
alter table public.aura_comms_context
  add constraint aura_comms_context_subject_check
  check (subject_type in ('message', 'mail', 'meeting'));

drop index if exists public.idx_comms_attachments_owner;
alter table public.aura_comms_attachments drop constraint if exists aura_comms_attachments_owner_type_check;
alter table public.aura_comms_attachments
  add constraint aura_comms_attachments_owner_check
  check ((message_id is not null and mail_id is null) or (message_id is null and mail_id is not null));
alter table public.aura_comms_attachments drop column if exists owner_id;
alter table public.aura_comms_attachments drop column if exists owner_type;

drop table if exists public.aura_comms_timeline;
drop table if exists public.aura_comms_dispatch;
drop table if exists public.aura_comms_accounts;
drop table if exists public.aura_comms_participants;

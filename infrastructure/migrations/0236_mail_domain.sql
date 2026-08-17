-- ============================================================
-- AURA OS — migration 0236: Mail domain (C3.1)
-- ------------------------------------------------------------
-- Turns internal mail into a real, provider-neutral mail model: a message knows which account it
-- came from or goes out through, who it was addressed to by ADDRESS, where it sits in its own
-- lifecycle, which direction it travelled, and how it maps to a provider's identifiers so a Gmail
-- or Microsoft 365 sync can be idempotent later. No provider is connected here.
--
-- STRICTLY ADDITIVE. aura_comms_mail_recipients is NOT dropped: this is a migration from an old
-- model to a canonical one, and a temporary compatibility bridge is worth more than an aggressive
-- cutover that is hard to reverse. The C1 read/write path keeps using it untouched while
-- participants are backfilled alongside; the legacy table is removed only once every /workspace
-- and Communication consumer has moved and been verified.
-- ============================================================

-- ── Participants stay channel-neutral ───────────────────────────────────────
-- An AURA username is NOT an email address. An internal participant may be identified by user_id
-- with no external address at all, and inventing "u-admin" as an address would put a string that
-- can never receive mail into the envelope. So address becomes optional, and the row must carry
-- at least one way to identify the person.
alter table public.aura_comms_participants alter column address drop not null;

alter table public.aura_comms_participants drop constraint if exists aura_comms_participants_identity_check;
alter table public.aura_comms_participants add constraint aura_comms_participants_identity_check
  check (address is not null or user_id is not null);

-- ── Mail-specific read state ────────────────────────────────────────────────
-- Deliberately NOT a column on participants: "has this person opened it" is a mail concept, and
-- pushing it into the shared table would make every future channel carry a field it has no
-- meaning for. Keyed by the participant row, so it inherits the envelope's identity.
create table if not exists public.aura_comms_mail_reads (
  tenant_id      text        not null,
  mail_id        uuid        not null,
  participant_id uuid        not null,
  read_at        timestamptz not null default now(),
  primary key (tenant_id, participant_id)
);

create index if not exists idx_comms_mail_reads_mail on public.aura_comms_mail_reads (tenant_id, mail_id);

alter table public.aura_comms_mail_reads enable row level security;
alter table public.aura_comms_mail_reads force row level security;
drop policy if exists tenant_isolation on public.aura_comms_mail_reads;
create policy tenant_isolation on public.aura_comms_mail_reads
  using (tenant_id::text = public.current_tenant_id() and public.current_tenant_id() is not null)
  with check (tenant_id::text = public.current_tenant_id() and public.current_tenant_id() is not null);

-- ── Mail becomes addressable, staged and provider-aware ─────────────────────
alter table public.aura_comms_mail
  add column if not exists account_id            uuid,
  add column if not exists direction             text not null default 'outbound',
  -- The message's OWN lifecycle. Dispatch (0235) records when to run and what happened when it
  -- tried; this records what the message is. Keeping them apart is why a retry counter never
  -- becomes part of the business record.
  add column if not exists state                 text not null default 'sent',
  add column if not exists provider_message_id   text,
  add column if not exists provider_thread_id    text,
  -- Internet headers are what stitch an AURA thread to the provider's. thread_id is an AURA uuid
  -- and means nothing to Gmail; Message-ID / In-Reply-To / References do.
  add column if not exists internet_message_id   text,
  add column if not exists in_reply_to           text,
  add column if not exists references_header     text,
  add column if not exists body_html             text,
  add column if not exists snippet               text,
  add column if not exists failed_reason         text,
  add column if not exists created_at            timestamptz not null default now(),
  add column if not exists updated_at            timestamptz not null default now();

-- from_user is legacy and optional from here: it records which AURA actor composed a message, and
-- inbound external mail has no such actor. Canonical sender identity is the 'from' participant.
alter table public.aura_comms_mail alter column from_user drop not null;

-- A draft has never been sent, so sent_at must be allowed to be empty, and it must agree with the
-- lifecycle rather than drifting from it.
alter table public.aura_comms_mail alter column sent_at drop not null;
alter table public.aura_comms_mail alter column sent_at drop default;

alter table public.aura_comms_mail drop constraint if exists aura_comms_mail_state_check;
alter table public.aura_comms_mail add constraint aura_comms_mail_state_check
  check (state in ('draft', 'scheduled', 'queued', 'sending', 'sent', 'failed', 'cancelled', 'received'));

alter table public.aura_comms_mail drop constraint if exists aura_comms_mail_direction_check;
alter table public.aura_comms_mail add constraint aura_comms_mail_direction_check
  check (direction in ('inbound', 'outbound'));

-- sent_at is present exactly when the message has actually left or arrived. A "scheduled" row
-- carrying a sent time, or a "sent" row without one, is a lie the database can refuse to store.
alter table public.aura_comms_mail drop constraint if exists aura_comms_mail_sent_at_check;
alter table public.aura_comms_mail add constraint aura_comms_mail_sent_at_check
  check ((state in ('sent', 'received')) = (sent_at is not null));

-- Idempotent sync, scoped to the account. COALESCE because Postgres treats NULLs as distinct in a
-- unique index — without it, two imports of the same provider message on an unassigned account
-- would both be allowed, which is exactly the duplicate this index exists to stop.
create unique index if not exists uq_comms_mail_provider_message
  on public.aura_comms_mail (tenant_id, coalesce(account_id, '00000000-0000-0000-0000-000000000000'::uuid), provider_message_id)
  where provider_message_id is not null;

create index if not exists idx_comms_mail_state on public.aura_comms_mail (tenant_id, state, sent_at desc);
create index if not exists idx_comms_mail_account on public.aura_comms_mail (tenant_id, account_id, sent_at desc);

-- ── Backfill canonical participants (bridge, not cutover) ───────────────────
-- The legacy table stays authoritative for the C1 path. These rows make the same envelope
-- readable through the canonical shape so the new domain can be built and verified against real
-- data before anything is removed.
--
-- Internal recipients get user_id and, only where the users registry actually holds one, a real
-- address. No username is ever written into the address column.
insert into public.aura_comms_participants (id, tenant_id, subject_type, subject_id, role, address, display_name, user_id, created_at)
select gen_random_uuid(), r.tenant_id, 'mail', r.mail_id, r.kind,
       nullif(u.email, ''),
       nullif(u.display_name, ''),
       r.username,
       now()
  from public.aura_comms_mail_recipients r
  left join public.aura_users u on u.tenant_id = r.tenant_id and u.user_id = r.username
 where not exists (
   select 1 from public.aura_comms_participants p
    where p.tenant_id = r.tenant_id and p.subject_type = 'mail' and p.subject_id = r.mail_id
      and p.role = r.kind and p.user_id = r.username
 );

insert into public.aura_comms_participants (id, tenant_id, subject_type, subject_id, role, address, display_name, user_id, created_at)
select gen_random_uuid(), m.tenant_id, 'mail', m.id, 'from',
       nullif(u.email, ''),
       nullif(u.display_name, ''),
       m.from_user,
       now()
  from public.aura_comms_mail m
  left join public.aura_users u on u.tenant_id = m.tenant_id and u.user_id = m.from_user
 where m.from_user is not null
   and not exists (
     select 1 from public.aura_comms_participants p
      where p.tenant_id = m.tenant_id and p.subject_type = 'mail' and p.subject_id = m.id and p.role = 'from'
   );

-- Read receipts follow their participant.
insert into public.aura_comms_mail_reads (tenant_id, mail_id, participant_id, read_at)
select r.tenant_id, r.mail_id, p.id, r.read_at
  from public.aura_comms_mail_recipients r
  join public.aura_comms_participants p
    on p.tenant_id = r.tenant_id and p.subject_type = 'mail'
   and p.subject_id = r.mail_id and p.role = r.kind and p.user_id = r.username
 where r.read_at is not null
on conflict (tenant_id, participant_id) do nothing;

-- @DOWN
drop index if exists public.idx_comms_mail_account;
drop index if exists public.idx_comms_mail_state;
drop index if exists public.uq_comms_mail_provider_message;
alter table public.aura_comms_mail drop constraint if exists aura_comms_mail_sent_at_check;
alter table public.aura_comms_mail drop constraint if exists aura_comms_mail_direction_check;
alter table public.aura_comms_mail drop constraint if exists aura_comms_mail_state_check;
update public.aura_comms_mail set sent_at = coalesce(sent_at, created_at, now());
alter table public.aura_comms_mail alter column sent_at set default now();
alter table public.aura_comms_mail alter column sent_at set not null;
alter table public.aura_comms_mail
  drop column if exists updated_at,
  drop column if exists created_at,
  drop column if exists failed_reason,
  drop column if exists snippet,
  drop column if exists body_html,
  drop column if exists references_header,
  drop column if exists in_reply_to,
  drop column if exists internet_message_id,
  drop column if exists provider_thread_id,
  drop column if exists provider_message_id,
  drop column if exists state,
  drop column if exists direction,
  drop column if exists account_id;

delete from public.aura_comms_participants where subject_type = 'mail';
drop table if exists public.aura_comms_mail_reads;

alter table public.aura_comms_participants drop constraint if exists aura_comms_participants_identity_check;
-- Restoring NOT NULL is only safe because the rows that could violate it are the mail rows the
-- statement above removes.
alter table public.aura_comms_participants alter column address set not null;

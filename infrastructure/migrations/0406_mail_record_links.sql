-- ============================================================
-- AURA OS — migration 0406: a message knows the business records it is about (MAIL-03…MAIL-07).
-- ------------------------------------------------------------
-- Communication could compose, send and thread mail, and none of it could say WHAT it was about. A
-- message to a customer about a tender was findable in somebody's mailbox and nowhere else: the
-- customer's page, the tender's page and the project's page knew nothing of it, and the next person
-- to pick the work up started from a blank.
--
-- A link is a typed reference — the record's kind and id — written when a message is composed FROM
-- that record (or linked to it by its author). It is a reference, not a copy and not a grant:
--   · the record's own page lists the linked messages, but only those its viewer could already
--     read (the author's own drafts; a sent message to its participants) — linking widens nothing;
--   · the record is checked to exist in the tenant, and to be readable by whoever links it, at the
--     service boundary (Communication does not read other modules' tables — ADR-0004, no foreign key).
-- ============================================================

create table if not exists public.aura_comms_mail_links (
  id          uuid        primary key,
  tenant_id   text        not null,
  mail_id     uuid        not null,
  record_type text        not null,
  record_id   text        not null,
  -- What the record was called when the message was linked — a snapshot, so a message lists its
  -- records without reading five other modules, the same discipline as `account_name` elsewhere.
  record_label text,
  linked_by   text        not null,
  linked_at   timestamptz not null default now(),
  constraint chk_aura_comms_mail_link_type check (record_type in (
    'crm.account', 'crm.contact', 'crm.lead', 'crm.opportunity', 'tendering.tender', 'procurement.supplier', 'projects.project'
  )),
  constraint chk_aura_comms_mail_link_record check (length(btrim(coalesce(record_id, ''))) > 0)
);

-- One message names one record once.
create unique index if not exists uq_aura_comms_mail_links
  on public.aura_comms_mail_links (tenant_id, mail_id, record_type, record_id);
-- The read behind a record's correspondence panel.
create index if not exists idx_aura_comms_mail_links_record
  on public.aura_comms_mail_links (tenant_id, record_type, record_id);

alter table public.aura_comms_mail_links enable row level security;
alter table public.aura_comms_mail_links force row level security;
drop policy if exists tenant_isolation on public.aura_comms_mail_links;
create policy tenant_isolation on public.aura_comms_mail_links
  using (tenant_id::text = public.current_tenant_id() and public.current_tenant_id() is not null)
  with check (tenant_id::text = public.current_tenant_id() and public.current_tenant_id() is not null);

-- A link is written and, with its draft, removed — never rewritten to point somewhere else.
do $grant$ begin
  if exists (select 1 from pg_roles where rolname = 'aura_app') then
    grant select, insert, delete on public.aura_comms_mail_links to aura_app;
  end if;
end $grant$;

-- @DOWN
drop table if exists public.aura_comms_mail_links;

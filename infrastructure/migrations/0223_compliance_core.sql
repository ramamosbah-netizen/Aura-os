-- ============================================================
-- AURA OS — migration 0223: Compliance Core (gap register G-20, ADR-0018)
-- ------------------------------------------------------------
-- Authority compliance — SIRA, DCD and whoever comes next — as ONE core with the authority as
-- reference data, not a module per regulator. Adding Trakhees must be rows and rules, never a
-- schema change; that is the acceptance test ADR-0018 sets for this design.
--
-- SIX tables. The pre-migration gate in the discovery justified five; `decisions` is the sixth,
-- added because ADR-0018 §7 makes a decision its own append-only entity rather than a status on
-- the case. The sequence submitted → rejected → resubmitted → approved must keep BOTH decisions:
-- the first refusal and its reason are the record a dispute turns on, and a status column erases
-- them the moment approval arrives.
--
-- Ships with ZERO seeded rules by explicit decision. The core works with an empty rule set;
-- authorities are added by hand until the regulatory requirements are sourced. No obligation, fee
-- or validity period is written here, because an un-sourced regulatory fact looks authoritative
-- and will be relied on by someone deciding whether a system may legally operate.
-- ============================================================

-- ── 1 · Authorities — reference data (ADR-0018 §4) ────────────────────────────────────────────
-- A table rather than an enum so a new regulator is configuration. Deliberately no 'OTHER' row:
-- an unclassifiable bucket is one nobody can account for a year later.
create table if not exists public.aura_compliance_authorities (
  id            uuid        primary key,
  tenant_id     text        not null,
  code          text        not null,
  name          text        not null,
  -- ISO 3166-2 where one exists: AE-DU (Dubai), AE-AZ (Abu Dhabi).
  jurisdiction  text        not null,
  portal_url    text,
  active        boolean     not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint unq_aura_compliance_authority_code unique (tenant_id, code)
);

-- ── 2 · Cases — the unit of work ──────────────────────────────────────────────────────────────
create table if not exists public.aura_compliance_cases (
  id               uuid        primary key,
  tenant_id        text        not null,
  company_id       text,

  authority_code   text        not null,
  obligation_code  text        not null,

  -- scope + subject_type + subject_id, never three nullable foreign keys (ADR-0018 §6). Three
  -- nullables permit a row where all are null and no constraint catches it; the service resolves
  -- subject_id against the type its scope names.
  scope            text        not null,
  subject_type     text        not null,
  subject_id       text        not null,

  -- Set for PROJECT-scoped cases: which ELV system on which project.
  project_id       uuid,
  system           text,
  -- ALL_SYSTEM_DEVICES | SELECTED_DEVICES (ADR-0018 §10)
  coverage         text        not null default 'ALL_SYSTEM_DEVICES',
  device_ids       jsonb       not null default '[]'::jsonb,

  reference        text,
  -- draft | submitted | under_review | inspection | approved | certified | rejected | expired | withdrawn
  status           text        not null default 'draft',
  notes            text,

  created_by       text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  constraint chk_aura_compliance_case_scope check (scope in ('PROJECT', 'COMPANY', 'PERSON')),
  constraint chk_aura_compliance_case_coverage check (coverage in ('ALL_SYSTEM_DEVICES', 'SELECTED_DEVICES')),
  -- The scope↔subject_type pairing, enforced in the database as well as the service: it is the
  -- invariant that replaces the polymorphic foreign key, so it should not rest on one layer.
  constraint chk_aura_compliance_case_subject check (
    (scope = 'PROJECT' and subject_type = 'project')
    or (scope = 'COMPANY' and subject_type = 'company')
    or (scope = 'PERSON' and subject_type = 'person')
  ),
  -- A project-scoped case without a project is not answerable.
  constraint chk_aura_compliance_case_project check (scope <> 'PROJECT' or project_id is not null)
);

-- ── 3 · Submissions — attempt history (append-only) ───────────────────────────────────────────
create table if not exists public.aura_compliance_submissions (
  id            uuid        primary key,
  tenant_id     text        not null,
  case_id       uuid        not null references public.aura_compliance_cases (id) on delete cascade,
  -- 1-based. A resubmission is attempt 2, never an edit of attempt 1.
  attempt       integer     not null,
  submitted_at  date        not null,
  submitted_by  text,
  reference     text,
  fee           numeric(14, 2),
  currency      text,
  notes         text,
  created_at    timestamptz not null default now(),
  constraint unq_aura_compliance_submission_attempt unique (case_id, attempt),
  constraint chk_aura_compliance_submission_attempt check (attempt >= 1),
  constraint chk_aura_compliance_submission_fee check (fee is null or fee >= 0)
);

-- ── 4 · Inspections — OPTIONAL (ADR-0018 §8) ──────────────────────────────────────────────────
-- A regulator inspecting us. Distinct from quality's inspection request, which is us inspecting
-- our own workmanship: different actor, different outcome vocabulary, legal consequence.
create table if not exists public.aura_compliance_inspections (
  id                     uuid        primary key,
  tenant_id              text        not null,
  case_id                uuid        not null references public.aura_compliance_cases (id) on delete cascade,
  requested_at           date,
  scheduled_at           date,
  conducted_at           date,
  inspector_reference    text,
  inspection_reference   text,
  -- pass | conditional | fail
  outcome                text,
  notes                  text,
  reinspection_required  boolean     not null default false,
  reinspection_date      date,
  created_at             timestamptz not null default now(),
  constraint chk_aura_compliance_inspection_outcome
    check (outcome is null or outcome in ('pass', 'conditional', 'fail'))
);

-- ── 5 · Decisions — append-only (ADR-0018 §7) ─────────────────────────────────────────────────
create table if not exists public.aura_compliance_decisions (
  id             uuid        primary key,
  tenant_id      text        not null,
  case_id        uuid        not null references public.aura_compliance_cases (id) on delete cascade,
  submission_id  uuid        references public.aura_compliance_submissions (id) on delete set null,
  -- approved | approved_with_conditions | rejected
  outcome        text        not null,
  decision_date  date        not null,
  decision_by    text,
  reference      text,
  conditions     text,
  reason         text,
  created_at     timestamptz not null default now(),
  constraint chk_aura_compliance_decision_outcome
    check (outcome in ('approved', 'approved_with_conditions', 'rejected')),
  -- A refusal you cannot act on is not a decision; a conditional approval with no conditions is
  -- not one either. Enforced here as well as in the domain.
  constraint chk_aura_compliance_decision_reason
    check (outcome <> 'rejected' or (reason is not null and length(btrim(reason)) > 0)),
  constraint chk_aura_compliance_decision_conditions
    check (outcome <> 'approved_with_conditions' or (conditions is not null and length(btrim(conditions)) > 0))
);

-- ── 6 · Certificates — append-only series (ADR-0018 §9) ───────────────────────────────────────
-- Renewal is a NEW ROW pointing the old one forward. Never an edit of expires_at: "what was valid
-- on 14 March" is a legal question and mutating the row destroys the only answer.
create table if not exists public.aura_compliance_certificates (
  id                          uuid        primary key,
  tenant_id                   text        not null,
  case_id                     uuid        not null references public.aura_compliance_cases (id) on delete cascade,
  number                      text        not null,
  issued_at                   date        not null,
  -- Null means perpetual. Some approvals genuinely do not lapse, and that must not read as expired.
  expires_at                  date,
  superseded_by_certificate_id uuid       references public.aura_compliance_certificates (id) on delete set null,
  notes                       text,
  created_at                  timestamptz not null default now(),
  constraint chk_aura_compliance_certificate_dates check (expires_at is null or expires_at >= issued_at)
);

-- ── Indexes — the register's read paths ───────────────────────────────────────────────────────
create index if not exists idx_aura_compliance_cases_tenant
  on public.aura_compliance_cases (tenant_id, created_at desc);
create index if not exists idx_aura_compliance_cases_subject
  on public.aura_compliance_cases (tenant_id, subject_type, subject_id);
create index if not exists idx_aura_compliance_cases_project
  on public.aura_compliance_cases (tenant_id, project_id);
create index if not exists idx_aura_compliance_cases_status
  on public.aura_compliance_cases (tenant_id, status);
create index if not exists idx_aura_compliance_submissions_case
  on public.aura_compliance_submissions (tenant_id, case_id);
create index if not exists idx_aura_compliance_inspections_case
  on public.aura_compliance_inspections (tenant_id, case_id);
create index if not exists idx_aura_compliance_decisions_case
  on public.aura_compliance_decisions (tenant_id, case_id);
create index if not exists idx_aura_compliance_certificates_case
  on public.aura_compliance_certificates (tenant_id, case_id);
-- The renewal watch-list: live certificates by expiry.
create index if not exists idx_aura_compliance_certificates_expiry
  on public.aura_compliance_certificates (tenant_id, expires_at)
  where superseded_by_certificate_id is null;

-- ── Tenant isolation (0163/0164) — enabled, FORCED and policied on all six ───────────────────
alter table public.aura_compliance_authorities  enable row level security;
alter table public.aura_compliance_authorities  force  row level security;
alter table public.aura_compliance_cases        enable row level security;
alter table public.aura_compliance_cases        force  row level security;
alter table public.aura_compliance_submissions  enable row level security;
alter table public.aura_compliance_submissions  force  row level security;
alter table public.aura_compliance_inspections  enable row level security;
alter table public.aura_compliance_inspections  force  row level security;
alter table public.aura_compliance_decisions    enable row level security;
alter table public.aura_compliance_decisions    force  row level security;
alter table public.aura_compliance_certificates enable row level security;
alter table public.aura_compliance_certificates force  row level security;

drop policy if exists tenant_isolation on public.aura_compliance_authorities;
create policy tenant_isolation on public.aura_compliance_authorities
  using (tenant_id::text = public.current_tenant_id() and public.current_tenant_id() is not null)
  with check (tenant_id::text = public.current_tenant_id() and public.current_tenant_id() is not null);

drop policy if exists tenant_isolation on public.aura_compliance_cases;
create policy tenant_isolation on public.aura_compliance_cases
  using (tenant_id::text = public.current_tenant_id() and public.current_tenant_id() is not null)
  with check (tenant_id::text = public.current_tenant_id() and public.current_tenant_id() is not null);

drop policy if exists tenant_isolation on public.aura_compliance_submissions;
create policy tenant_isolation on public.aura_compliance_submissions
  using (tenant_id::text = public.current_tenant_id() and public.current_tenant_id() is not null)
  with check (tenant_id::text = public.current_tenant_id() and public.current_tenant_id() is not null);

drop policy if exists tenant_isolation on public.aura_compliance_inspections;
create policy tenant_isolation on public.aura_compliance_inspections
  using (tenant_id::text = public.current_tenant_id() and public.current_tenant_id() is not null)
  with check (tenant_id::text = public.current_tenant_id() and public.current_tenant_id() is not null);

drop policy if exists tenant_isolation on public.aura_compliance_decisions;
create policy tenant_isolation on public.aura_compliance_decisions
  using (tenant_id::text = public.current_tenant_id() and public.current_tenant_id() is not null)
  with check (tenant_id::text = public.current_tenant_id() and public.current_tenant_id() is not null);

drop policy if exists tenant_isolation on public.aura_compliance_certificates;
create policy tenant_isolation on public.aura_compliance_certificates
  using (tenant_id::text = public.current_tenant_id() and public.current_tenant_id() is not null)
  with check (tenant_id::text = public.current_tenant_id() and public.current_tenant_id() is not null);

-- @DOWN
drop table if exists public.aura_compliance_certificates;
drop table if exists public.aura_compliance_decisions;
drop table if exists public.aura_compliance_inspections;
drop table if exists public.aura_compliance_submissions;
drop table if exists public.aura_compliance_cases;
drop table if exists public.aura_compliance_authorities;

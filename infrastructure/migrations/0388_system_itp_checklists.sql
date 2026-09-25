-- ============================================================
-- 0388 — THE APPROVED CHECKLIST (TC-08 / TC-09), enforced by the database.
--
-- The programme owner's contract: Quality owns the ITP and its acceptance criteria; T&C executes
-- them. Measured before this migration, a commissioning engineer typed one test point and its own
-- acceptance criterion ("Works" / "It works"), passed it and commissioned a CCTV system — no ITP,
-- no blocker. This migration holds the rules where no service can route around them:
--
--   1. a tenant library of system templates — published versions frozen;
--   2. a SYSTEM ITP is a governed revision of the existing ITP: bound to a canonical system,
--      approved by somebody other than who prepared it, frozen once approved;
--      a system-less ITP is today's installation-inspection plan and keeps exactly its behaviour;
--   3. a commissioning record is BOUND to the current approved revision of ITS project and ITS
--      system — pinned for good once bound;
--   4. on a bound record, test points come from the revision: a hand-typed point is refused and an
--      approved point's activity, criterion and mandatory flag cannot be edited;
--   5. a system is commissioned only when bound, with every mandatory point of its revision passed,
--      no point failing and no defect open. Already-commissioned rows are never touched.
-- ============================================================

-- ── 1. The tenant library ───────────────────────────────────────────────────────────────────
create table if not exists public.aura_quality_itp_templates (
  id            uuid        primary key,
  tenant_id     text        not null,
  company_id    text,
  -- a canonical ELV_SYSTEMS id; `other` names no system, so no template can be for it
  system        text        not null,
  version       integer     not null,
  title         text        not null,
  status        text        not null default 'draft',
  points        jsonb       not null default '[]'::jsonb,
  created_by    text,
  published_by  text,
  published_at  timestamptz,
  retired_by    text,
  retired_at    timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint aura_itp_template_status check (status in ('draft', 'published', 'retired')),
  constraint aura_itp_template_system check (system <> '' and system <> 'other'),
  constraint aura_itp_template_version check (version >= 1),
  constraint aura_itp_template_published_complete check (
    status = 'draft' or (published_by is not null and published_at is not null)
  )
);

create unique index if not exists uq_aura_itp_template_version
  on public.aura_quality_itp_templates (tenant_id, system, version);

alter table public.aura_quality_itp_templates enable row level security;
alter table public.aura_quality_itp_templates force row level security;
drop policy if exists tenant_isolation on public.aura_quality_itp_templates;
create policy tenant_isolation on public.aura_quality_itp_templates
  using (tenant_id::text = public.current_tenant_id() and public.current_tenant_id() is not null)
  with check (tenant_id::text = public.current_tenant_id() and public.current_tenant_id() is not null);

create or replace function public.aura_itp_template_guard() returns trigger
language plpgsql as $fn$
begin
  if tg_op = 'DELETE' then
    if old.status <> 'draft' then
      raise exception using errcode = '23514', message =
        'a published ITP template is immutable — retire it and publish a new version instead';
    end if;
    return old;
  end if;
  if old.status <> 'draft' then
    if new.system is distinct from old.system or new.version is distinct from old.version
       or new.points is distinct from old.points or new.title is distinct from old.title
       or new.published_by is distinct from old.published_by or new.published_at is distinct from old.published_at then
      raise exception using errcode = '23514', message =
        'a published ITP template is immutable — a change is the next version, and projects that adopted this one keep it';
    end if;
    if new.status is distinct from old.status and not (old.status = 'published' and new.status = 'retired') then
      raise exception using errcode = '23514', message =
        'a published ITP template can only be retired';
    end if;
  end if;
  return new;
end
$fn$;

drop trigger if exists aura_itp_template_guard on public.aura_quality_itp_templates;
create trigger aura_itp_template_guard
  before update or delete on public.aura_quality_itp_templates
  for each row execute function public.aura_itp_template_guard();

-- ── 2. The system ITP: a governed revision of the existing ITP ──────────────────────────────
alter table public.aura_quality_itps
  add column if not exists kind                    text not null default 'installation_inspection',
  add column if not exists system                  text,
  add column if not exists revision                integer,
  add column if not exists parent_itp_id           uuid,
  add column if not exists source_template_id      uuid,
  add column if not exists source_template_version integer,
  add column if not exists submitted_by            text,
  add column if not exists submitted_at            timestamptz,
  add column if not exists approved_by             text,
  add column if not exists approved_at             timestamptz,
  add column if not exists superseded_by           uuid,
  add column if not exists superseded_at           timestamptz,
  add column if not exists returned_reason         text;

alter table public.aura_quality_itps
  drop constraint if exists aura_quality_itps_status_check,
  add constraint aura_quality_itps_status_check
    check (status in ('draft', 'active', 'closed', 'submitted', 'approved', 'superseded'));

alter table public.aura_quality_itps
  drop constraint if exists aura_itp_kind,
  add constraint aura_itp_kind check (kind in ('installation_inspection', 'system_commissioning')),
  -- The two kinds never share a behaviour: an installation-inspection plan has no system and keeps
  -- draft → active → closed (and the WBS gate that reads it); a system plan names its system and
  -- moves draft → submitted → approved → superseded.
  drop constraint if exists aura_itp_kind_shape,
  add constraint aura_itp_kind_shape check (
    (kind = 'installation_inspection' and system is null and revision is null
      and status in ('draft', 'active', 'closed'))
    or
    (kind = 'system_commissioning' and system is not null and system <> 'other' and revision >= 1
      and status in ('draft', 'submitted', 'approved', 'superseded'))
  ),
  -- Independent approval, held here as well as in the service: the approver is neither the person
  -- who prepared the revision nor the person who sent it for approval.
  drop constraint if exists aura_itp_independent_approval,
  add constraint aura_itp_independent_approval check (
    kind <> 'system_commissioning' or approved_by is null
    or (approved_by is distinct from created_by and approved_by is distinct from submitted_by)
  ),
  drop constraint if exists aura_itp_approved_complete,
  add constraint aura_itp_approved_complete check (
    kind <> 'system_commissioning' or status not in ('approved', 'superseded')
    or (approved_by is not null and approved_at is not null)
  );

create unique index if not exists uq_aura_itp_system_revision
  on public.aura_quality_itps (tenant_id, project_id, system, revision)
  where kind = 'system_commissioning';
-- One CURRENT approved revision per project and system, and one revision in preparation.
create unique index if not exists uq_aura_itp_system_current
  on public.aura_quality_itps (tenant_id, project_id, system)
  where kind = 'system_commissioning' and status = 'approved';
create unique index if not exists uq_aura_itp_system_open
  on public.aura_quality_itps (tenant_id, project_id, system)
  where kind = 'system_commissioning' and status in ('draft', 'submitted');

create or replace function public.aura_system_itp_guard() returns trigger
language plpgsql as $fn$
begin
  if tg_op = 'DELETE' then
    if old.kind = 'system_commissioning' and old.status in ('submitted', 'approved', 'superseded') then
      raise exception using errcode = '23514', message =
        'an approved ITP revision is immutable — it cannot be deleted, and commissioning records may be bound to it';
    end if;
    return old;
  end if;
  if new.kind is distinct from old.kind then
    raise exception using errcode = '23514', message =
      'an ITP''s kind is immutable — an installation-inspection plan never becomes a system checklist, nor the reverse';
  end if;
  if old.kind <> 'system_commissioning' then
    return new;
  end if;
  -- Under review, the content is what the approver is deciding on.
  if old.status = 'submitted' and new.status = 'submitted' and (
       new.points is distinct from old.points or new.system is distinct from old.system
    or new.title is distinct from old.title) then
    raise exception using errcode = '23514', message =
      'a submitted ITP revision is immutable while it is under review — it is returned to draft to change it';
  end if;
  if old.status in ('approved', 'superseded') then
    if new.system is distinct from old.system or new.points is distinct from old.points
       or new.revision is distinct from old.revision or new.project_id is distinct from old.project_id
       or new.title is distinct from old.title or new.reference is distinct from old.reference
       or new.parent_itp_id is distinct from old.parent_itp_id
       or new.source_template_id is distinct from old.source_template_id
       or new.source_template_version is distinct from old.source_template_version
       or new.approved_by is distinct from old.approved_by or new.approved_at is distinct from old.approved_at
       or new.created_by is distinct from old.created_by or new.submitted_by is distinct from old.submitted_by then
      raise exception using errcode = '23514', message =
        'an approved ITP revision is immutable — its system, points, acceptance criteria and mandatory flags are fixed; a change is the next revision';
    end if;
    if old.status = 'superseded' and (new.status <> 'superseded'
       or new.superseded_by is distinct from old.superseded_by or new.superseded_at is distinct from old.superseded_at) then
      raise exception using errcode = '23514', message =
        'a superseded ITP revision is immutable';
    end if;
    if old.status = 'approved' and new.status not in ('approved', 'superseded') then
      raise exception using errcode = '23514', message =
        'an approved ITP revision can only be superseded by the next approved revision';
    end if;
    if old.status = 'approved' and new.status = 'approved'
       and (new.superseded_by is distinct from old.superseded_by or new.superseded_at is distinct from old.superseded_at) then
      raise exception using errcode = '23514', message =
        'an approved ITP revision is immutable';
    end if;
  end if;
  return new;
end
$fn$;

drop trigger if exists aura_system_itp_guard on public.aura_quality_itps;
create trigger aura_system_itp_guard
  before update or delete on public.aura_quality_itps
  for each row execute function public.aura_system_itp_guard();

-- ── 3. Binding a commissioning record to the approved revision ──────────────────────────────
-- Where a test point came from — declared first, because the lookups below read it.
alter table public.aura_commissioning_test_items
  add column if not exists origin          text    not null default 'manual',
  add column if not exists itp_id          uuid,
  add column if not exists itp_point_code  text,
  add column if not exists mandatory       boolean not null default false;

alter table public.aura_commissioning_test_items
  drop constraint if exists aura_commissioning_test_item_origin,
  add constraint aura_commissioning_test_item_origin check (
    (origin = 'manual' and itp_id is null and itp_point_code is null)
    or (origin = 'itp' and itp_id is not null and itp_point_code is not null)
  );

create unique index if not exists uq_aura_commissioning_itp_point
  on public.aura_commissioning_test_items (commissioning_id, itp_point_code)
  where origin = 'itp';

alter table public.aura_commissioning_records
  add column if not exists itp_id       uuid,
  add column if not exists itp_revision integer,
  add column if not exists itp_bound_by text,
  add column if not exists itp_bound_at timestamptz;

alter table public.aura_commissioning_records
  drop constraint if exists aura_commissioning_binding_complete,
  add constraint aura_commissioning_binding_complete check (
    (itp_id is null and itp_revision is null and itp_bound_by is null and itp_bound_at is null)
    or (itp_id is not null and itp_revision is not null and itp_bound_by is not null and itp_bound_at is not null)
  );

-- Fail-closed lookups: row-level security must never make a real revision look absent.
create or replace function public.aura_itp_binding_refusal(p_itp_id uuid, p_tenant text, p_project uuid, p_system text, p_revision integer)
returns text
language sql stable security definer set search_path = pg_catalog, public as $fn$
  select case
    when i.id is null then 'the ITP revision to bind was not found'
    when i.tenant_id <> p_tenant then 'the ITP revision belongs to a different tenant'
    when i.kind <> 'system_commissioning' then
      'an installation-inspection ITP is not allowed for a commissioning record — bind the approved system ITP revision'
    when i.project_id <> p_project then 'the ITP revision belongs to a different project than this commissioning record'
    when i.system <> p_system then
      'the ITP revision belongs to a different system than this commissioning record — systems are matched by their canonical id, never by name'
    when i.status <> 'approved' then 'only the current approved ITP revision can be bound — this one is ' || i.status
    when i.revision <> p_revision then 'the bound revision number does not match the ITP revision'
    else null
  end
  from (select 1) as one
  left join public.aura_quality_itps i on i.id = p_itp_id
$fn$;

create or replace function public.aura_commissioning_bound_itp(p_record_id uuid) returns uuid
language sql stable security definer set search_path = pg_catalog, public as $fn$
  select r.itp_id from public.aura_commissioning_records r where r.id = p_record_id
$fn$;

-- What stands between a bound record and PASS, in words — null when nothing does.
create or replace function public.aura_commissioning_pass_gap(p_record_id uuid) returns text
language sql stable security definer set search_path = pg_catalog, public as $fn$
  select case
    when exists (select 1 from public.aura_commissioning_test_items t
                  where t.commissioning_id = p_record_id and t.result = 'fail')
      then 'a test point is failing'
    when exists (select 1 from public.aura_commissioning_test_items t
                  where t.commissioning_id = p_record_id and t.origin = 'itp' and t.mandatory and t.result <> 'pass')
      then 'a mandatory point of its approved revision has not passed'
    when exists (select 1 from public.aura_commissioning_punch_items p
                  where p.commissioning_id = p_record_id and p.status = 'open')
      then 'a defect is still open'
    else null
  end
$fn$;

revoke all on function public.aura_itp_binding_refusal(uuid, text, uuid, text, integer) from public;
revoke all on function public.aura_commissioning_bound_itp(uuid) from public;
revoke all on function public.aura_commissioning_pass_gap(uuid) from public;
do $grant$ begin
  if exists (select 1 from pg_roles where rolname = 'aura_app') then
    grant execute on function public.aura_itp_binding_refusal(uuid, text, uuid, text, integer) to aura_app;
    grant execute on function public.aura_commissioning_bound_itp(uuid) to aura_app;
    grant execute on function public.aura_commissioning_pass_gap(uuid) to aura_app;
  end if;
end $grant$;

-- AN UPSERT IS NOT A NEW ROW. The stores save with INSERT … ON CONFLICT (id) DO UPDATE, and
-- PostgreSQL fires BEFORE INSERT row triggers for the proposed row BEFORE it detects the conflict —
-- then fires BEFORE UPDATE for the row it actually changes. Judged as an insert, every save of an
-- existing record would be a fresh binding (so a record pinned to a revision since superseded could
-- never be saved again) and every sign-off would be "written commissioned". So the INSERT branch
-- steps aside for a row that already exists, and the UPDATE branch that follows judges it. A row
-- RLS hides reads as absent, which applies the STRICTER insert rules — fail-closed.
create or replace function public.aura_commissioning_checklist_guard() returns trigger
language plpgsql as $fn$
declare
  v_reason text;
begin
  if tg_op = 'INSERT' and exists (select 1 from public.aura_commissioning_records r where r.id = new.id) then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.itp_id is not null then
    if new.itp_id is distinct from old.itp_id or new.itp_revision is distinct from old.itp_revision
       or new.itp_bound_by is distinct from old.itp_bound_by or new.itp_bound_at is distinct from old.itp_bound_at then
      raise exception using errcode = '23514', message =
        'a commissioning record''s ITP revision is immutable once bound — moving it to a newer revision is a separate governed act';
    end if;
    if new.system is distinct from old.system or new.project_id is distinct from old.project_id then
      raise exception using errcode = '23514', message =
        'a bound commissioning record''s system and project are immutable — they are what its approved checklist was chosen for';
    end if;
  end if;
  if new.itp_id is not null and (tg_op = 'INSERT' or old.itp_id is null) then
    v_reason := public.aura_itp_binding_refusal(new.itp_id, new.tenant_id, new.project_id, new.system, new.itp_revision);
    if v_reason is not null then
      raise exception using errcode = '23514', message = v_reason;
    end if;
  end if;
  -- The PASS rule. Already-commissioned rows are never re-judged.
  if new.status = 'commissioned' and (tg_op = 'INSERT' or old.status is distinct from 'commissioned') then
    if tg_op = 'INSERT' then
      raise exception using errcode = '23514', message =
        'a system can only be commissioned from its executed test points — it cannot be written commissioned';
    end if;
    if new.itp_id is null then
      raise exception using errcode = '23514', message =
        'only a system bound to an approved ITP revision can be commissioned — bind it to the approved revision for its system first';
    end if;
    v_reason := public.aura_commissioning_pass_gap(new.id);
    if v_reason is not null then
      raise exception using errcode = '23514', message =
        'only a system whose every mandatory point has passed, with no failing point and no open defect, can be commissioned — ' || v_reason;
    end if;
  end if;
  return new;
end
$fn$;

drop trigger if exists aura_commissioning_checklist_guard on public.aura_commissioning_records;
create trigger aura_commissioning_checklist_guard
  before insert or update on public.aura_commissioning_records
  for each row execute function public.aura_commissioning_checklist_guard();

-- ── 4. A bound record's points come from its revision ──────────────────────────────────────
create or replace function public.aura_commissioning_test_item_guard() returns trigger
language plpgsql as $fn$
declare
  v_bound uuid;
begin
  -- An upsert of an existing point (a result, a retest) is judged by the UPDATE branch — see above.
  if tg_op = 'INSERT' and exists (select 1 from public.aura_commissioning_test_items t where t.id = new.id) then
    return new;
  end if;
  if tg_op = 'INSERT' then
    v_bound := public.aura_commissioning_bound_itp(new.commissioning_id);
    if new.origin = 'manual' and v_bound is not null then
      raise exception using errcode = '23514', message =
        'a hand-typed test point is not allowed for a commissioning record bound to an approved ITP revision — its points come from that revision, and a missing point is Quality''s to add in the next one';
    end if;
    if new.origin = 'itp' and (v_bound is null or new.itp_id is distinct from v_bound) then
      raise exception using errcode = '23514', message =
        'the ITP test point belongs to a different revision than the one this record is bound to';
    end if;
    return new;
  end if;
  if new.origin is distinct from old.origin or new.itp_id is distinct from old.itp_id
     or new.itp_point_code is distinct from old.itp_point_code then
    raise exception using errcode = '23514', message =
      'a test point''s origin is immutable';
  end if;
  if old.origin = 'itp' and (
       new.point_no is distinct from old.point_no or new.description is distinct from old.description
    or new.expected is distinct from old.expected or new.mandatory is distinct from old.mandatory) then
    raise exception using errcode = '23514', message =
      'an approved test point is immutable — its activity, acceptance criterion and whether it is mandatory are fixed by the approved revision';
  end if;
  return new;
end
$fn$;

drop trigger if exists aura_commissioning_test_item_guard on public.aura_commissioning_test_items;
create trigger aura_commissioning_test_item_guard
  before insert or update on public.aura_commissioning_test_items
  for each row execute function public.aura_commissioning_test_item_guard();

-- @DOWN
drop trigger if exists aura_commissioning_test_item_guard on public.aura_commissioning_test_items;
drop function if exists public.aura_commissioning_test_item_guard();
drop index if exists public.uq_aura_commissioning_itp_point;
alter table public.aura_commissioning_test_items
  drop constraint if exists aura_commissioning_test_item_origin,
  drop column if exists mandatory,
  drop column if exists itp_point_code,
  drop column if exists itp_id,
  drop column if exists origin;
drop trigger if exists aura_commissioning_checklist_guard on public.aura_commissioning_records;
drop function if exists public.aura_commissioning_checklist_guard();
drop function if exists public.aura_commissioning_pass_gap(uuid);
drop function if exists public.aura_commissioning_bound_itp(uuid);
drop function if exists public.aura_itp_binding_refusal(uuid, text, uuid, text, integer);
alter table public.aura_commissioning_records
  drop constraint if exists aura_commissioning_binding_complete,
  drop column if exists itp_bound_at,
  drop column if exists itp_bound_by,
  drop column if exists itp_revision,
  drop column if exists itp_id;
drop trigger if exists aura_system_itp_guard on public.aura_quality_itps;
drop function if exists public.aura_system_itp_guard();
drop index if exists public.uq_aura_itp_system_open;
drop index if exists public.uq_aura_itp_system_current;
drop index if exists public.uq_aura_itp_system_revision;
-- A system checklist has no meaning under the old shape; it is removed before the shape is restored.
delete from public.aura_quality_itps where kind = 'system_commissioning';
alter table public.aura_quality_itps
  drop constraint if exists aura_itp_approved_complete,
  drop constraint if exists aura_itp_independent_approval,
  drop constraint if exists aura_itp_kind_shape,
  drop constraint if exists aura_itp_kind,
  drop constraint if exists aura_quality_itps_status_check,
  add constraint aura_quality_itps_status_check check (status in ('draft', 'active', 'closed')),
  drop column if exists returned_reason,
  drop column if exists superseded_at,
  drop column if exists superseded_by,
  drop column if exists approved_at,
  drop column if exists approved_by,
  drop column if exists submitted_at,
  drop column if exists submitted_by,
  drop column if exists source_template_version,
  drop column if exists source_template_id,
  drop column if exists parent_itp_id,
  drop column if exists revision,
  drop column if exists system,
  drop column if exists kind;
drop trigger if exists aura_itp_template_guard on public.aura_quality_itp_templates;
drop function if exists public.aura_itp_template_guard();
drop table if exists public.aura_quality_itp_templates;

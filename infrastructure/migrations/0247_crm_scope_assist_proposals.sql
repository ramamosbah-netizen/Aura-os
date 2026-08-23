-- ============================================================
-- AURA OS — migration 0247: Scope Assist proposals (Slice 5)
-- ------------------------------------------------------------
-- AURA Scope Assist is a GROUNDED, read-only assistant: it reads a deal's own evidence (requirements +
-- scopes) and proposes a scope the human then accepts, edits, and approves. Each generation is ONE
-- immutable proposal row holding evidence-backed items (each carrying provenance to a real in-scope
-- source), plus assumptions and gaps/questions — nothing here changes any other lifecycle state.
--
-- Immutability is content-level: items / assumptions / gaps / evidence_fingerprint / version / generator
-- are frozen at insert. The ONLY mutation allowed is the human ACCEPT stamp (status → accepted, plus
-- accepted_by / accepted_at / accepted_basis_revision_id) and the SUPERSEDE stamp (status → superseded)
-- when a newer version is generated. A BEFORE UPDATE trigger enforces this; DELETE is rejected. So a
-- historical accepted/approved proposal is never rewritten when evidence later changes — the app DERIVES
-- staleness by re-fingerprinting the evidence and offers Regenerate as a NEW version.
--
-- The opportunity FK is ON DELETE RESTRICT, matching the rest of pre-award (0245). It must NOT be
-- CASCADE: a cascade delete still fires the append-only BEFORE DELETE trigger below, so it could never
-- actually cascade — it would only turn "delete an opportunity" into a confusing append-only error.
--
-- Ships with RLS enabled + FORCED + the canonical tenant policy. Additive.
-- ============================================================

create table if not exists public.aura_crm_scope_assist_proposals (
  id                          uuid primary key,
  tenant_id                   text not null,
  company_id                  text,
  opportunity_id              uuid not null references public.aura_crm_opportunities(id) on delete restrict,
  version                     integer not null,
  status                      text not null default 'suggested',
  evidence_fingerprint        text not null,
  generator                   text not null default 'heuristic',
  items                       jsonb not null default '[]'::jsonb,
  assumptions                 jsonb not null default '[]'::jsonb,
  gaps                        jsonb not null default '[]'::jsonb,
  generated_by                text,
  generated_at                timestamptz not null default now(),
  accepted_by                 text,
  accepted_at                 timestamptz,
  accepted_basis_revision_id  uuid references public.aura_crm_estimation_basis_revisions(id) on delete set null,
  created_at                  timestamptz not null default now(),
  constraint uq_scope_assist_version unique (opportunity_id, version),
  constraint ck_scope_assist_status check (status in ('suggested','accepted','superseded'))
);

create index if not exists idx_scope_assist_opp on public.aura_crm_scope_assist_proposals (tenant_id, opportunity_id, version desc);

alter table public.aura_crm_scope_assist_proposals enable row level security;
alter table public.aura_crm_scope_assist_proposals force row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'aura_crm_scope_assist_proposals' and policyname = 'tenant_isolation_policy'
  ) then
    create policy tenant_isolation_policy on public.aura_crm_scope_assist_proposals
      for all
      using (tenant_id = public.current_tenant_id() and public.current_tenant_id() is not null)
      with check (tenant_id = public.current_tenant_id() and public.current_tenant_id() is not null);
  end if;
end $$;

-- Content is immutable; only the accept / supersede status stamp may change.
create or replace function public.aura_crm_scope_assist_content_immutable() returns trigger
  language plpgsql as $$
begin
  if new.id is distinct from old.id
     or new.tenant_id is distinct from old.tenant_id
     or new.opportunity_id is distinct from old.opportunity_id
     or new.version is distinct from old.version
     or new.evidence_fingerprint is distinct from old.evidence_fingerprint
     or new.generator is distinct from old.generator
     or new.items is distinct from old.items
     or new.assumptions is distinct from old.assumptions
     or new.gaps is distinct from old.gaps
     or new.generated_by is distinct from old.generated_by
     or new.generated_at is distinct from old.generated_at
  then
    raise exception 'aura_crm_scope_assist_proposals content is immutable: only the accept/supersede status stamp may change'
      using errcode = 'restrict_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_scope_assist_content_immutable on public.aura_crm_scope_assist_proposals;
create trigger trg_scope_assist_content_immutable
  before update on public.aura_crm_scope_assist_proposals
  for each row execute function public.aura_crm_scope_assist_content_immutable();

create or replace function public.aura_crm_scope_assist_no_delete() returns trigger
  language plpgsql as $$
begin
  raise exception 'aura_crm_scope_assist_proposals is append-only: DELETE is not permitted'
    using errcode = 'restrict_violation';
end;
$$;

drop trigger if exists trg_scope_assist_no_delete on public.aura_crm_scope_assist_proposals;
create trigger trg_scope_assist_no_delete
  before delete on public.aura_crm_scope_assist_proposals
  for each row execute function public.aura_crm_scope_assist_no_delete();

-- @DOWN
drop trigger if exists trg_scope_assist_no_delete on public.aura_crm_scope_assist_proposals;
drop trigger if exists trg_scope_assist_content_immutable on public.aura_crm_scope_assist_proposals;
drop function if exists public.aura_crm_scope_assist_no_delete();
drop function if exists public.aura_crm_scope_assist_content_immutable();
drop table if exists public.aura_crm_scope_assist_proposals;

-- ============================================================
-- AURA OS — migration 0173: account party type + relationship graph (G6)
-- ------------------------------------------------------------
-- `status` on an account is the relationship LIFECYCLE (prospect → strategic). It never said what
-- the party IS. ELV work is won through a web of parties — the consultant who specifies, the main
-- contractor who buys, the developer who owns — and without a party type the graph cannot even be
-- typed, let alone answer "which consultants influence the developers we chase?".
--
--   party_type — what the account IS: end_client / consultant / main_contractor / developer /
--                supplier / partner / subcontractor / government / other. Nullable on purpose:
--                every pre-G6 account honestly reads "not classified yet", never a guessed value.
--
--   aura_crm_account_relationships — the typed, DIRECTED edges between accounts:
--                "Alpha Consultants —influences→ Emaar", "BuildCo —main_contractor_for→ Emaar".
--                Directed because the meaning flips with the arrow; one row per edge, both
--                directions derived on read. UNIQUE stops the same edge being recorded twice;
--                FKs cascade so deleting an account cannot strand half an edge.
-- ============================================================

alter table public.aura_crm_accounts
  add column if not exists party_type text;

create table if not exists public.aura_crm_account_relationships (
  id                uuid        primary key,
  tenant_id         text        not null,
  company_id        text,
  from_account_id   uuid        not null references public.aura_crm_accounts(id) on delete cascade,
  to_account_id     uuid        not null references public.aura_crm_accounts(id) on delete cascade,
  relationship_type text        not null,
  notes             text,
  created_by        text,
  created_at        timestamptz not null default now(),
  unique (tenant_id, from_account_id, to_account_id, relationship_type)
);

-- The graph is read from a single account outward — both directions, tenant-scoped.
create index if not exists idx_crm_acct_rel_from on public.aura_crm_account_relationships (tenant_id, from_account_id);
create index if not exists idx_crm_acct_rel_to   on public.aura_crm_account_relationships (tenant_id, to_account_id);

alter table public.aura_crm_account_relationships enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'aura_crm_account_relationships' and policyname = 'tenant_isolation_policy'
  ) then
    create policy tenant_isolation_policy on public.aura_crm_account_relationships
      using (tenant_id = public.current_tenant_id());
  end if;
end $$;

-- @DOWN
drop table if exists public.aura_crm_account_relationships;
alter table public.aura_crm_accounts drop column if exists party_type;

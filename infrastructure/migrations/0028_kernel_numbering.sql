-- ============================================================
-- AURA OS kernel — migration 0028: document sequence numbering
-- ------------------------------------------------------------
-- Enforces gapless, tenant-scoped, and fiscal-year-scoped numbering
-- sequences across modules and entities.
-- ============================================================

create table if not exists public.aura_number_sequences (
  id           uuid        primary key default gen_random_uuid(),
  tenant_id    text        not null,
  company_id   text,
  module       text        not null,
  entity       text        not null,
  prefix       text        not null,
  fiscal_year  integer,
  current_seq  bigint      not null default 0,
  pad_width    integer     not null default 6,
  created_at   timestamptz not null default now(),
  constraint uq_aura_number_sequences unique (tenant_id, company_id, module, entity, fiscal_year)
);

alter table public.aura_number_sequences enable row level security;

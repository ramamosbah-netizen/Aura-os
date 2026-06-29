-- ============================================================
-- AURA OS — migration 0014: Finance GL & Payments (operate-side module)
-- ------------------------------------------------------------
-- The Finance module OWNS these tables.
-- Namespaced `aura_finance_*`. Apply with `pnpm db:migrate`.
-- ============================================================

-- ── 1. Chart of Accounts Table ─────────────────────────────
create table if not exists public.aura_finance_accounts (
  id          uuid        primary key,
  tenant_id   text        not null,
  code        text        not null,
  name        text        not null,
  type        text        not null,
  parent_id   uuid,
  created_at  timestamptz not null default now(),
  constraint uq_aura_finance_accounts_code unique (tenant_id, code)
);

create index if not exists idx_aura_finance_accounts_tenant on public.aura_finance_accounts (tenant_id);
create index if not exists idx_aura_finance_accounts_type on public.aura_finance_accounts (type);

-- ── 2. Journals Table ───────────────────────────────────────
create table if not exists public.aura_finance_journals (
  id          uuid        primary key,
  tenant_id   text        not null,
  reference   text,
  description text        not null,
  created_by  text,
  posted_at   timestamptz not null default now()
);

create index if not exists idx_aura_finance_journals_tenant on public.aura_finance_journals (tenant_id, posted_at desc);
create index if not exists idx_aura_finance_journals_ref on public.aura_finance_journals (reference);

-- ── 3. Journal Lines Table ──────────────────────────────────
create table if not exists public.aura_finance_journal_lines (
  id            uuid        primary key,
  journal_id    uuid        not null references public.aura_finance_journals(id) on delete cascade,
  account_id    uuid        not null references public.aura_finance_accounts(id),
  account_code  text        not null,
  account_name  text        not null,
  debit         numeric     not null default 0,
  credit        numeric     not null default 0
);

create index if not exists idx_aura_finance_journal_lines_journal on public.aura_finance_journal_lines (journal_id);
create index if not exists idx_aura_finance_journal_lines_account on public.aura_finance_journal_lines (account_id);

-- ── 4. Payments Table ───────────────────────────────────────
create table if not exists public.aura_finance_payments (
  id              uuid        primary key,
  tenant_id       text        not null,
  invoice_id      uuid        not null references public.aura_finance_invoices(id),
  bank_account_id uuid        not null references public.aura_finance_accounts(id),
  amount          numeric     not null default 0,
  reference       text,
  created_by      text,
  paid_at         timestamptz not null default now()
);

create index if not exists idx_aura_finance_payments_tenant on public.aura_finance_payments (tenant_id, paid_at desc);
create index if not exists idx_aura_finance_payments_invoice on public.aura_finance_payments (invoice_id);

-- Enable RLS (Row Level Security) on all new tables
alter table public.aura_finance_accounts enable row level security;
alter table public.aura_finance_journals enable row level security;
alter table public.aura_finance_journal_lines enable row level security;
alter table public.aura_finance_payments enable row level security;

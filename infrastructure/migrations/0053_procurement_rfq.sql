-- ============================================================
-- AURA OS — migration 0053: Procurement RFQ (Request for Quotation)
-- ------------------------------------------------------------
-- The sourcing step between a Purchase Request and a Purchase
-- Order: float a requirement to vendors, collect quotes, compare,
-- and award. RFQ owns its quotes (one aggregate).
-- ============================================================

create table if not exists public.aura_procurement_rfqs (
  id          uuid        primary key,
  tenant_id   text        not null,
  company_id  text,
  reference   text,
  title       text        not null,
  pr_id       text,
  pr_title    text,
  status      text        not null default 'draft',
  due_date    text,
  owner_id    text,
  created_by  text,
  created_at  timestamptz not null default now()
);
create index if not exists idx_aura_rfqs_tenant on public.aura_procurement_rfqs (tenant_id, status);

create table if not exists public.aura_procurement_rfq_quotes (
  id             uuid          primary key,
  rfq_id         uuid          not null references public.aura_procurement_rfqs(id) on delete cascade,
  tenant_id      text          not null,
  supplier_name  text          not null,
  amount         numeric(15,4) not null,
  lead_time_days integer,
  notes          text,
  status         text          not null default 'received',
  created_at     timestamptz   not null default now()
);
create index if not exists idx_aura_rfq_quotes_rfq on public.aura_procurement_rfq_quotes (rfq_id);

-- Tenant isolation (matches the house pattern, e.g. 0032/0052).
alter table public.aura_procurement_rfqs enable row level security;
drop policy if exists tenant_isolation_policy on public.aura_procurement_rfqs;
create policy tenant_isolation_policy on public.aura_procurement_rfqs
  for all using (tenant_id = public.current_tenant_id());

alter table public.aura_procurement_rfq_quotes enable row level security;
drop policy if exists tenant_isolation_policy on public.aura_procurement_rfq_quotes;
create policy tenant_isolation_policy on public.aura_procurement_rfq_quotes
  for all using (tenant_id = public.current_tenant_id());

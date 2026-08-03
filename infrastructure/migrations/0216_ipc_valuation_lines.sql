-- ============================================================
-- AURA OS — migration 0216: IPC valuation lines (the INVOICED quantity strand)
-- ------------------------------------------------------------
-- A remeasurement Interim Payment Certificate (IPC) certifies work per BOQ (measured) item —
-- quantity × rate. Each valuation line carries the BOQ item + certified quantity; on certification
-- (contracts.ipc.certified) the Quantity Ledger accrues that quantity as the item's INVOICED
-- position — the last link in the delivery chain (Approved − Invoiced = billable-but-uncertified).
-- Value stays on the certificate header; the line's amount is the gross measure for the drill-down.
-- Owned by contracts.
-- ============================================================

create table if not exists public.aura_contracts_ipc_lines (
  id             uuid primary key,
  tenant_id      text not null,
  company_id     text,
  certificate_id text not null,
  project_id     text not null,
  boq_item_id    text not null,
  description    text not null,
  quantity       numeric(14,2) not null default 0,
  unit           text not null default 'nr',
  rate           numeric(14,2) not null default 0,
  amount         numeric(16,2) not null default 0,
  created_at     timestamptz not null default now()
);

create index if not exists idx_ipc_lines_cert on public.aura_contracts_ipc_lines (tenant_id, certificate_id);
create index if not exists idx_ipc_lines_boq  on public.aura_contracts_ipc_lines (tenant_id, boq_item_id);

alter table public.aura_contracts_ipc_lines enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'aura_contracts_ipc_lines' and policyname = 'tenant_isolation_policy'
  ) then
    create policy tenant_isolation_policy on public.aura_contracts_ipc_lines
      using (tenant_id = public.current_tenant_id());
  end if;
end $$;

-- @DOWN
drop table if exists public.aura_contracts_ipc_lines;

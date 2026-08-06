-- ============================================================
-- AURA OS — migration 0223: AR credit notes
-- ------------------------------------------------------------
-- A credit note reduces a customer's receivable after the invoice has been
-- issued (over-billing, a return, a price adjustment, or crediting an invoice
-- that is already part-paid and so cannot simply be cancelled). It carries the
-- same line/VAT shape as the invoice it credits; issuing it posts the mirror of
-- an invoice to the GL (Dr Revenue + Dr VAT Output / Cr Accounts Receivable) and
-- reduces what the customer owes on the target invoice.
--
-- `credited_total` on the customer invoice tracks how much has been credited so
-- the receivable (balance sheet AND aging) nets it out alongside receipts.
-- ============================================================

create table if not exists public.aura_finance_credit_notes (
  id                  uuid primary key,
  tenant_id           text not null,
  company_id          text,
  credit_note_number  text not null,
  customer_invoice_id uuid not null,
  invoice_number      text,
  customer_name       text not null,
  reason              text,
  issue_date          date not null,
  lines               jsonb not null default '[]'::jsonb,
  subtotal            numeric(14,2) not null default 0,
  vat_total           numeric(14,2) not null default 0,
  total               numeric(14,2) not null default 0,
  currency            text not null default 'AED',
  exchange_rate       numeric(18,6) not null default 1,
  base_total          numeric(14,2) not null default 0,
  status              text not null default 'draft' check (status in ('draft','issued','cancelled')),
  created_by          text,
  created_at          timestamptz not null default now()
);

create index if not exists idx_credit_notes_tenant on public.aura_finance_credit_notes (tenant_id);
create index if not exists idx_credit_notes_invoice on public.aura_finance_credit_notes (customer_invoice_id);
create unique index if not exists uq_credit_notes_number on public.aura_finance_credit_notes (tenant_id, credit_note_number);

alter table public.aura_finance_credit_notes enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'aura_finance_credit_notes' and policyname = 'tenant_isolation_policy'
  ) then
    create policy tenant_isolation_policy on public.aura_finance_credit_notes
      using (tenant_id = public.current_tenant_id());
  end if;
end $$;

alter table public.aura_finance_customer_invoices
  add column if not exists credited_total numeric(14,2) not null default 0 check (credited_total >= 0);

-- @DOWN
alter table public.aura_finance_customer_invoices drop column if exists credited_total;
drop table if exists public.aura_finance_credit_notes;

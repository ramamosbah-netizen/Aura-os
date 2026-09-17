-- ============================================================
-- FX-01 impact audit — REHEARSAL FIXTURE
-- ------------------------------------------------------------
-- A throwaway database shaped like the one the audit actually has to run against: the invoice
-- tables as they stood BEFORE migration 0348, with no exchange_rate_source, no exchange_rate_id
-- and no invoice_date.
--
-- This exists because the pre-migration branch of the audit is the branch that will execute against
-- a real database, and it is the one branch that cannot be exercised on a developer machine where
-- 0348 has already been applied. Running the audit here proves that path end to end instead of
-- assuming it.
--
--   docker exec aura-dev-postgres psql -U aura -d postgres \
--     -c "DROP DATABASE IF EXISTS fx01_premigration;" -c "CREATE DATABASE fx01_premigration;"
--   docker exec -i aura-dev-postgres psql -U aura -d fx01_premigration < apps/api/scripts/fx-01-audit-rehearsal.sql
--   MIGRATION_DATABASE_URL="postgres://aura:aura@localhost:55432/fx01_premigration?sslmode=disable" \
--     node apps/api/scripts/fx-01-impact-audit.mjs --detail
--
-- The rows are bookings as the old `getRate()` would have produced them, across two tenants, and
-- they cover all four verdicts. Every rate below is the one the fallback would have returned:
-- 3.6725 is the USD peg, and 4.003025 / 4.664075 are the hardcoded EUR and GBP crosses.
-- ============================================================

CREATE TABLE public.aura_finance_invoices (
  id uuid PRIMARY KEY, tenant_id text NOT NULL, reference text, title text,
  status text, value numeric, currency text DEFAULT 'AED',
  exchange_rate numeric DEFAULT 1, base_value numeric, created_at timestamptz DEFAULT now()
);
CREATE TABLE public.aura_finance_customer_invoices (
  id uuid PRIMARY KEY, tenant_id text NOT NULL, invoice_number text, customer_name text,
  issue_date date, total numeric, currency text DEFAULT 'AED',
  exchange_rate numeric DEFAULT 1, base_total numeric, status text
);
CREATE TABLE public.aura_exchange_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id text, from_currency text,
  to_currency text, rate numeric, effective_date date
);

INSERT INTO public.aura_finance_invoices (id,tenant_id,reference,title,status,value,currency,exchange_rate,base_value,created_at) VALUES
  -- UNGOVERNABLE_CURRENCY: the defect itself. ~AED 24,000 of yen booked as AED 3.67m.
  (gen_random_uuid(),'t-alpha','AP-001','Tokyo camera order','approved',1000000,'JPY',3.6725,3672500,'2026-07-05'),
  -- RATE_DISAGREES: a governed EUR rate exists and is not the hardcoded cross that was used.
  (gen_random_uuid(),'t-alpha','AP-002','Munich controllers','approved',250000,'EUR',4.003025,1000756.25,'2026-07-06'),
  -- NO_GOVERNED_RATE: GBP floats, and the constant 1.27 crossed into AED governs nothing.
  (gen_random_uuid(),'t-alpha','AP-003','London consultancy','approved',40000,'GBP',4.664075,186563,'2026-07-07'),
  -- MATCHES_GOVERNED: SAR is genuinely pegged, so the fallback happened to be right.
  (gen_random_uuid(),'t-alpha','AP-004','Riyadh cabling','approved',300000,'SAR',0.979333,293799.9,'2026-07-08'),
  (gen_random_uuid(),'t-beta','AP-101','US servers','approved',80000,'USD',3.6725,293800,'2026-07-09'),
  -- UNGOVERNABLE_CURRENCY again, and the worst of them: ~AED 13,500 booked as AED 18.3m.
  (gen_random_uuid(),'t-beta','AP-102','Seoul NVRs','approved',5000000,'KRW',3.6725,18362500,'2026-07-10');

INSERT INTO public.aura_finance_customer_invoices (id,tenant_id,invoice_number,customer_name,issue_date,total,currency,exchange_rate,base_total,status) VALUES
  (gen_random_uuid(),'t-alpha','AR-001','EU Client',DATE '2026-07-05',120000,'EUR',4.003025,480363,'issued'),
  (gen_random_uuid(),'t-beta','AR-101','US Client',DATE '2026-07-06',60000,'USD',3.6725,220350,'issued');

-- A register that covers only SOME of the exposure, which is the realistic state.
INSERT INTO public.aura_exchange_rates (tenant_id,from_currency,to_currency,rate,effective_date) VALUES
  ('t-alpha','EUR','AED',4.31,'2026-07-01'),
  ('t-alpha','SAR','AED',0.979333,'2026-07-01'),
  ('t-beta','USD','AED',3.6725,'2026-07-01');

-- ============================================================
-- AURA OS — migration 0091: reporting views for hot read paths (TIER-2 #52)
-- ------------------------------------------------------------
-- Set-based views the API/BI can read instead of app-side aggregation.
-- ============================================================

-- GL trial balance: per-account debit/credit totals from posted journal lines.
create or replace view public.aura_v_trial_balance as
select j.tenant_id,
       l.account_id,
       l.account_code,
       max(l.account_name) as account_name,
       sum(l.debit)  as total_debit,
       sum(l.credit) as total_credit,
       sum(l.debit) - sum(l.credit) as net
from public.aura_finance_journal_lines l
join public.aura_finance_journals j on j.id = l.journal_id
group by j.tenant_id, l.account_id, l.account_code;

-- Open customer (AR) invoices: unpaid balance per invoice.
create or replace view public.aura_v_open_customer_invoices as
select tenant_id, id, invoice_number, customer_name, project_id, issue_date, due_date,
       total, amount_paid, (total - amount_paid) as balance, status
from public.aura_finance_customer_invoices
where status <> 'cancelled' and (total - amount_paid) > 0;

-- ============================================================
-- AURA OS — migration 0150: created_by → text everywhere
-- ------------------------------------------------------------
-- Platform actor ids are TEXT ("u-admin", "sa:<id>"), but 16 tables still
-- typed created_by as uuid — every AUTHORED insert on them failed on
-- Postgres with "invalid input syntax for type uuid" (the same defect
-- 0142 fixed for quotations; surfaced again by the project-closeout
-- smoke). Aligns all of them with the spine convention.
-- ============================================================

alter table public.aura_finance_petty_cash_funds     alter column created_by type text using created_by::text;
alter table public.aura_finance_customer_invoices    alter column created_by type text using created_by::text;
alter table public.aura_finance_bank_guarantees      alter column created_by type text using created_by::text;
alter table public.aura_procurement_suppliers        alter column created_by type text using created_by::text;
alter table public.aura_hse_toolbox_talks            alter column created_by type text using created_by::text;
alter table public.aura_site_instructions            alter column created_by type text using created_by::text;
alter table public.aura_doccontrol_submittals        alter column created_by type text using created_by::text;
alter table public.aura_quality_itps                 alter column created_by type text using created_by::text;
alter table public.aura_finance_post_dated_cheques   alter column created_by type text using created_by::text;
alter table public.aura_hr_attendance                alter column created_by type text using created_by::text;
alter table public.aura_quality_material_approvals   alter column created_by type text using created_by::text;
alter table public.aura_projects_closeouts           alter column created_by type text using created_by::text;
alter table public.aura_finance_cost_centers         alter column created_by type text using created_by::text;
alter table public.aura_finance_profit_centers       alter column created_by type text using created_by::text;
alter table public.aura_projects_cashflow_forecasts  alter column created_by type text using created_by::text;
alter table public.aura_projects_schedules           alter column created_by type text using created_by::text;

-- @DOWN
-- Reverting to uuid would fail on non-uuid actor ids; cast valid uuids, null the rest.
do $$
declare t text;
begin
  foreach t in array array[
    'aura_finance_petty_cash_funds','aura_finance_customer_invoices','aura_finance_bank_guarantees',
    'aura_procurement_suppliers','aura_hse_toolbox_talks','aura_site_instructions',
    'aura_doccontrol_submittals','aura_quality_itps','aura_finance_post_dated_cheques',
    'aura_hr_attendance','aura_quality_material_approvals','aura_projects_closeouts',
    'aura_finance_cost_centers','aura_finance_profit_centers','aura_projects_cashflow_forecasts',
    'aura_projects_schedules'
  ] loop
    execute format(
      'alter table public.%I alter column created_by type uuid using (case when created_by ~ ''^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'' then created_by::uuid else null end)',
      t
    );
  end loop;
end $$;

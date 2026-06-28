-- ============================================================
-- AURA OS kernel — migration 0032: row level security policies
-- ------------------------------------------------------------
-- Creates global RLS helpers (tenant / company claims) and
-- attaches strict isolation policies to all tables.
-- ============================================================

-- Helper functions to extract claims from JWT or active transaction session settings
create or replace function public.current_tenant_id() returns text as $$
  select coalesce(
    nullif(current_setting('app.current_tenant_id', true), ''),
    nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'tenant_id', '')
  );
$$ language sql stable;

create or replace function public.current_company_id() returns text as $$
  select coalesce(
    nullif(current_setting('app.current_company_id', true), ''),
    nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'company_id', '')
  );
$$ language sql stable;

-- Define a helper procedure to generate standard RLS policies for a list of tables.
-- Standard policy: tenant_id must match AND company_id must match (or be null, or session company is null).
do $$
declare
  t_name text;
  tables_list text[] := array[
    'aura_crm_accounts',
    'aura_tendering_tenders',
    'aura_contracts_contracts',
    'aura_projects_projects',
    'aura_procurement_purchase_orders',
    'aura_inventory_grns',
    'aura_finance_invoices',
    'aura_finance_accounts',
    'aura_finance_journals',
    'aura_finance_journal_lines',
    'aura_finance_payments',
    'aura_procurement_purchase_requests',
    'aura_projects_wbs_nodes',
    'aura_subcontracts',
    'aura_subcontracts_claims',
    'aura_document_templates',
    'aura_engineering_drawings',
    'aura_engineering_rfis',
    'aura_engineering_submittals',
    'aura_doccontrol_transmittals',
    'aura_doccontrol_correspondence',
    'aura_site_daily_reports',
    'aura_site_delay_logs',
    'aura_site_material_consumption',
    'aura_hse_incidents',
    'aura_hse_ptws',
    'aura_hse_capas',
    'aura_quality_ncrs',
    'aura_quality_irs',
    'aura_quality_snags',
    'aura_hr_employees',
    'aura_hr_leaves',
    'aura_hr_payroll_runs',
    'aura_fleet_vehicles',
    'aura_fleet_fuel_logs',
    'aura_fleet_maintenance',
    'aura_assets',
    'aura_asset_maintenance',
    'aura_asset_inspections',
    'aura_number_sequences',
    'aura_audit_log',
    'aura_working_calendars',
    'aura_calendar_holidays',
    'aura_calendar_adjustments',
    'aura_exchange_rates'
  ];
begin
  foreach t_name in array tables_list
  loop
    -- Check if table exists before applying policy
    if exists (select from information_schema.tables where table_schema = 'public' and table_name = t_name) then
      -- Drop if exists first
      execute format('drop policy if exists tenant_isolation_policy on public.%I', t_name);
      
      -- Enable RLS on the table
      execute format('alter table public.%I enable row level security', t_name);

      -- Check if tenant_id column exists on this table
      if exists (
        select 1 from information_schema.columns 
        where table_schema = 'public' 
          and table_name = t_name 
          and column_name = 'tenant_id'
      ) then
        -- Check if company_id column exists on this table
        if exists (
          select 1 from information_schema.columns 
          where table_schema = 'public' 
            and table_name = t_name 
            and column_name = 'company_id'
        ) then
          -- Create isolation policy checking both tenant_id and company_id
          execute format('
            create policy tenant_isolation_policy on public.%I
            for all
            using (
              tenant_id = public.current_tenant_id()
              and (
                company_id is null 
                or public.current_company_id() is null 
                or company_id = public.current_company_id()
              )
            )
          ', t_name);
        else
          -- Create isolation policy checking tenant_id only
          execute format('
            create policy tenant_isolation_policy on public.%I
            for all
            using (
              tenant_id = public.current_tenant_id()
            )
          ', t_name);
        end if;
      elsif exists (
        select 1 from information_schema.columns 
        where table_schema = 'public' 
          and table_name = t_name 
          and column_name = 'journal_id'
      ) then
        -- Create isolation policy joining parent journal
        execute format('
          create policy tenant_isolation_policy on public.%I
          for all
          using (
            exists (
              select 1 from public.aura_finance_journals parent
              where parent.id = journal_id 
                and parent.tenant_id = public.current_tenant_id()
            )
          )
        ', t_name);
      elsif exists (
        select 1 from information_schema.columns 
        where table_schema = 'public' 
          and table_name = t_name 
          and column_name = 'calendar_id'
      ) then
        -- Create isolation policy joining parent calendar
        execute format('
          create policy tenant_isolation_policy on public.%I
          for all
          using (
            exists (
              select 1 from public.aura_working_calendars parent
              where parent.id = calendar_id 
                and parent.tenant_id = public.current_tenant_id()
            )
          )
        ', t_name);
      end if;
    end if;
  end loop;
end;
$$;

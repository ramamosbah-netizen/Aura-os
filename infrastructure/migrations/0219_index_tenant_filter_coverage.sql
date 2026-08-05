-- ============================================================
-- AURA OS — migration 0219: tenant-filter index coverage (P2-7 scale)
-- ------------------------------------------------------------
-- Every list/dashboard query filters by tenant_id (RLS + explicit predicate), and most then
-- narrow by a parent id or status. An index audit found 23 tenant-scoped tables with NO index
-- referencing tenant_id at all — so those lists fall back to a sequential scan that only gets
-- slower as rows accumulate. This adds a composite index per table, leading with tenant_id and
-- carrying the column the table is actually filtered/joined by (its parent FK, else status/date),
-- so the common "rows for parent X in tenant T" access path is index-served at scale.
--
-- Indexes only; no data or schema-shape change. `if not exists` keeps it idempotent. The larger
-- search redesign (replace the in-memory cross-module fan-out with a denormalised search
-- projection) is deliberately NOT in scope here.
-- ============================================================

-- AI / agent platform (per-parent lookups; traces & ledgers grow fastest)
create index if not exists idx_agent_exec_agent      on public.aura_agent_executions        (tenant_id, agent_id);
create index if not exists idx_agent_feedback_prop    on public.aura_agent_feedback           (tenant_id, proposal_id);
create index if not exists idx_agent_traces_step      on public.aura_agent_traces             (tenant_id, step_id);
create index if not exists idx_ai_credit_created      on public.aura_ai_credit_ledger         (tenant_id, created_at);
create index if not exists idx_collab_msg_wf          on public.aura_collaboration_messages   (tenant_id, workflow_instance_id);
create index if not exists idx_saga_steps_saga        on public.aura_kernel_saga_steps        (tenant_id, saga_id);
create index if not exists idx_bg_jobs_status         on public.aura_background_jobs           (tenant_id, status);
create index if not exists idx_integration_conn_tenant on public.aura_integration_connectors  (tenant_id);

-- AMC / Service (cockpit lists by status; contracts drive tickets & work orders)
create index if not exists idx_amc_contracts_status   on public.aura_amc_service_contracts    (tenant_id, status);
create index if not exists idx_amc_tickets_status     on public.aura_amc_tickets              (tenant_id, status);
create index if not exists idx_amc_wo_status          on public.aura_amc_work_orders          (tenant_id, status);

-- Assets (inspections & maintenance are listed per asset)
create index if not exists idx_asset_insp_asset       on public.aura_asset_inspections        (tenant_id, asset_id);
create index if not exists idx_asset_maint_asset      on public.aura_asset_maintenance        (tenant_id, asset_id);

-- Finance (tax lines per invoice; petty cash per fund)
create index if not exists idx_tax_lines_invoice      on public.aura_finance_tax_lines        (tenant_id, invoice_id);
create index if not exists idx_petty_cash_fund        on public.aura_finance_petty_cash_transactions (tenant_id, fund_id);

-- CRM (negotiation entries per quotation)
create index if not exists idx_crm_negotiation_quote  on public.aura_crm_negotiation_entries  (tenant_id, quotation_id);

-- Inventory (stock movement ledger is queried per item — grows fastest of these)
create index if not exists idx_stock_moves_item       on public.aura_inventory_stock_movements (tenant_id, stock_item_id);

-- Procurement (RFQ quotes per RFQ)
create index if not exists idx_rfq_quotes_rfq         on public.aura_procurement_rfq_quotes    (tenant_id, rfq_id);

-- Projects (CBS / delay / EOT are all listed per project)
create index if not exists idx_cbs_nodes_project      on public.aura_projects_cbs_nodes        (tenant_id, project_id);
create index if not exists idx_delay_events_project   on public.aura_projects_delay_events     (tenant_id, project_id);
create index if not exists idx_eot_claims_project     on public.aura_projects_eot_claims       (tenant_id, project_id);

-- Tendering (BOQ items per BOQ — a priced tender can carry thousands of lines)
create index if not exists idx_boq_items_boq          on public.aura_tendering_boq_items       (tenant_id, boq_id);

-- Working calendars (config, per tenant)
create index if not exists idx_working_cal_tenant     on public.aura_working_calendars         (tenant_id);

-- @DOWN
drop index if exists public.idx_agent_exec_agent;
drop index if exists public.idx_agent_feedback_prop;
drop index if exists public.idx_agent_traces_step;
drop index if exists public.idx_ai_credit_created;
drop index if exists public.idx_collab_msg_wf;
drop index if exists public.idx_saga_steps_saga;
drop index if exists public.idx_bg_jobs_status;
drop index if exists public.idx_integration_conn_tenant;
drop index if exists public.idx_amc_contracts_status;
drop index if exists public.idx_amc_tickets_status;
drop index if exists public.idx_amc_wo_status;
drop index if exists public.idx_asset_insp_asset;
drop index if exists public.idx_asset_maint_asset;
drop index if exists public.idx_tax_lines_invoice;
drop index if exists public.idx_petty_cash_fund;
drop index if exists public.idx_crm_negotiation_quote;
drop index if exists public.idx_stock_moves_item;
drop index if exists public.idx_rfq_quotes_rfq;
drop index if exists public.idx_cbs_nodes_project;
drop index if exists public.idx_delay_events_project;
drop index if exists public.idx_eot_claims_project;
drop index if exists public.idx_boq_items_boq;
drop index if exists public.idx_working_cal_tenant;

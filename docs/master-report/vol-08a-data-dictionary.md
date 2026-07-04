# Volume 8A — Data Dictionary

[← Volume 8](vol-08-database.md) · [← Master index](README.md)

Generated from `infrastructure/migrations/0001–0126` on 2026-07-03 (regenerate: `node docs/master-report/tools/gen-dictionary.mjs <repo-root>`) — **146 tables · 1788 columns**. Columns marked ➕ were added by a later migration; *italic* rows are table-level constraints. RLS = row-level security enabled at creation.


## ai (4 tables)

### `aura_ai_agents`

Created in `0040` · 0 index(es) · RLS ✅

| Column | Definition | Migration |
|---|---|---|
| `id` | uuid        primary key default gen_random_uuid() | 0040 |
| `tenant_id` | text        not null | 0040 |
| `agent_key` | text        not null | 0040 |
| `label` | text        not null | 0040 |
| `description` | text        not null | 0040 |
| `prompt_key` | text        not null,    -- References aura_ai_prompts.prompt_key | 0040 |
| `tool_keys` | text[]      not null default '{}' | 0040 |
| `model` | text        not null default 'gemini-2.0-flash' | 0040 |
| `max_iterations` | integer    not null default 5 | 0040 |
| `enabled` | boolean     not null default true | 0040 |
| `created_at` | timestamptz not null default now() | 0040 |
| *unique* | (tenant_id, agent_key) | 0040 |

### `aura_ai_guardrails`

Created in `0040` · 0 index(es) · RLS ✅

| Column | Definition | Migration |
|---|---|---|
| `id` | uuid        primary key default gen_random_uuid() | 0040 |
| `tenant_id` | text        not null | 0040 |
| `rule_key` | text        not null | 0040 |
| `label` | text        not null | 0040 |
| `rule_type` | text        not null,   -- 'blocked_keywords' \| 'max_tokens' \| 'topic_filter' \| 'pii_mask' | 0040 |
| `config` | jsonb       not null default '{}'::jsonb | 0040 |
| `enabled` | boolean     not null default true | 0040 |
| `created_at` | timestamptz not null default now() | 0040 |
| *unique* | (tenant_id, rule_key) | 0040 |

### `aura_ai_prompts`

Created in `0040` · 0 index(es) · RLS ✅

| Column | Definition | Migration |
|---|---|---|
| `id` | uuid        primary key default gen_random_uuid() | 0040 |
| `tenant_id` | text        not null | 0040 |
| `prompt_key` | text        not null | 0040 |
| `label` | text        not null | 0040 |
| `system_prompt` | text        not null | 0040 |
| `user_template` | text        not null,  -- Handlebars/Mustache template with {{variables}} | 0040 |
| `model_hint` | text        not null default 'gemini-2.0-flash' | 0040 |
| `version` | integer     not null default 1 | 0040 |
| `tags` | text[]      not null default '{}' | 0040 |
| `created_at` | timestamptz not null default now() | 0040 |
| *unique* | (tenant_id, prompt_key, version) | 0040 |

### `aura_ai_tools`

Created in `0040` · 0 index(es) · RLS ✅

| Column | Definition | Migration |
|---|---|---|
| `id` | uuid        primary key default gen_random_uuid() | 0040 |
| `tenant_id` | text        not null | 0040 |
| `tool_key` | text        not null | 0040 |
| `label` | text        not null | 0040 |
| `description` | text        not null | 0040 |
| `input_schema` | jsonb       not null default '{}'::jsonb,   -- JSON Schema for parameters | 0040 |
| `output_schema` | jsonb       not null default '{}'::jsonb | 0040 |
| `endpoint` | text,                                       -- HTTP endpoint or 'internal' | 0040 |
| `created_at` | timestamptz not null default now() | 0040 |
| *unique* | (tenant_id, tool_key) | 0040 |

## amc (4 tables)

### `aura_amc_ppm_schedules`

Created in `0078` · 2 index(es) · RLS ✅

| Column | Definition | Migration |
|---|---|---|
| `id` | uuid        primary key default gen_random_uuid() | 0078 |
| `tenant_id` | text        not null | 0078 |
| `company_id` | text | 0078 |
| `contract_id` | uuid        not null references public.aura_amc_service_contracts(id) | 0078 |
| `asset_id` | uuid | 0078 |
| `task_description` | text        not null | 0078 |
| `frequency` | text        not null,                 -- 'monthly' \| 'quarterly' \| 'semi_annual' \| 'annual' | 0078 |
| `start_date` | date        not null | 0078 |
| `next_due_date` | date        not null | 0078 |
| `active` | boolean     not null default true | 0078 |
| `visits_generated` | integer     not null default 0 | 0078 |
| `created_at` | timestamptz not null default now() | 0078 |
| `updated_at` | timestamptz not null default now() | 0078 |

### `aura_amc_service_contracts`

Created in `0038` · 0 index(es) · RLS ✅

| Column | Definition | Migration |
|---|---|---|
| `id` | uuid        primary key default gen_random_uuid() | 0038 |
| `tenant_id` | text        not null | 0038 |
| `company_id` | text | 0038 |
| `contract_number` | text       not null | 0038 |
| `client_name` | text        not null | 0038 |
| `asset_id` | uuid,                -- Optional reference to an asset | 0038 |
| `service_scope` | text        not null, -- e.g. 'HVAC Maintenance', 'Elevator Servicing' | 0038 |
| `start_date` | date        not null | 0038 |
| `end_date` | date        not null | 0038 |
| `value` | numeric(18,2) not null default 0 | 0038 |
| `currency` | text        not null default 'AED' | 0038 |
| `status` | text        not null default 'active',   -- 'active' \| 'expired' \| 'terminated' | 0038 |
| `sla_response_hours` | integer not null default 4 | 0038 |
| `sla_resolution_hours` | integer not null default 24 | 0038 |
| `created_at` | timestamptz not null default now() | 0038 |
| `updated_at` | timestamptz not null default now() | 0038 |

### `aura_amc_tickets`

Created in `0038` · 0 index(es) · RLS ✅

| Column | Definition | Migration |
|---|---|---|
| `id` | uuid        primary key default gen_random_uuid() | 0038 |
| `tenant_id` | text        not null | 0038 |
| `company_id` | text | 0038 |
| `contract_id` | uuid        references public.aura_amc_service_contracts(id) | 0038 |
| `ticket_number` | text        not null | 0038 |
| `title` | text        not null | 0038 |
| `description` | text        not null | 0038 |
| `category` | text        not null default 'general' | 0038 |
| `priority` | text        not null default 'medium' | 0038 |
| `status` | text        not null default 'open',   -- 'open' \| 'in_progress' \| 'resolved' \| 'closed' | 0038 |
| `reported_by` | text        not null | 0038 |
| `assigned_to` | text | 0038 |
| `sla_due_at` | timestamptz | 0038 |
| `resolved_at` | timestamptz | 0038 |
| `created_at` | timestamptz not null default now() | 0038 |
| `updated_at` | timestamptz not null default now() | 0038 |
| `sla_response_hours` ➕ | integer not null default 4,
  add column if not exists sla_resolution_hours integer not null default 24 | 0078 |
| `escalation_level` ➕ | integer not null default 0 | 0118 |

### `aura_amc_work_orders`

Created in `0038` · 0 index(es) · RLS ✅

| Column | Definition | Migration |
|---|---|---|
| `id` | uuid        primary key default gen_random_uuid() | 0038 |
| `tenant_id` | text        not null | 0038 |
| `company_id` | text | 0038 |
| `contract_id` | uuid        references public.aura_amc_service_contracts(id) | 0038 |
| `order_number` | text        not null | 0038 |
| `asset_id` | uuid | 0038 |
| `description` | text        not null | 0038 |
| `priority` | text        not null default 'medium', -- 'low' \| 'medium' \| 'high' \| 'critical' | 0038 |
| `type` | text        not null default 'corrective', -- 'preventive' \| 'corrective' \| 'inspection' | 0038 |
| `status` | text        not null default 'open',   -- 'open' \| 'assigned' \| 'in_progress' \| 'completed' \| 'cancelled' | 0038 |
| `assigned_to` | text,                -- technician user ID | 0038 |
| `scheduled_date` | date | 0038 |
| `completed_date` | date | 0038 |
| `location_lat` | numeric(9,6),        -- GIS coordinates | 0038 |
| `location_lng` | numeric(9,6) | 0038 |
| `location_label` | text | 0038 |
| `created_at` | timestamptz not null default now() | 0038 |
| `updated_at` | timestamptz not null default now() | 0038 |
| `cost` ➕ | numeric(15,2) | 0083 |

## approval (2 tables)

### `aura_approval_matrices`

Created in `0085` · 0 index(es) · RLS ✅

| Column | Definition | Migration |
|---|---|---|
| `tenant_id` | text        not null | 0085 |
| `entity_type` | text        not null | 0085 |
| `rules` | jsonb       not null default '[]'::jsonb | 0085 |
| `updated_at` | timestamptz not null default now() | 0085 |
| *primary* | key (tenant_id, entity_type) | 0085 |

### `aura_approval_matrix`

Created in `0039` · 0 index(es) · RLS ✅

| Column | Definition | Migration |
|---|---|---|
| `id` | uuid        primary key default gen_random_uuid() | 0039 |
| `tenant_id` | text        not null | 0039 |
| `entity_type` | text        not null,   -- e.g. 'purchase_order', 'invoice' | 0039 |
| `rules` | jsonb       not null default '[]'::jsonb | 0039 |
| `created_at` | timestamptz not null default now() | 0039 |
| `updated_at` | timestamptz not null default now() | 0039 |
| *unique* | (tenant_id, entity_type) | 0039 |

## asset (3 tables)

### `aura_asset_disposals`

Created in `0100` · 2 index(es) · RLS ✅

| Column | Definition | Migration |
|---|---|---|
| `id` | uuid primary key | 0100 |
| `tenant_id` | text not null | 0100 |
| `company_id` | text | 0100 |
| `asset_id` | text not null | 0100 |
| `asset_name` | text | 0100 |
| `disposal_date` | date not null | 0100 |
| `method` | text not null | 0100 |
| `proceeds` | numeric(18,2) not null default 0 | 0100 |
| `book_value` | numeric(18,2) not null default 0 | 0100 |
| `gain_loss` | numeric(18,2) not null default 0 | 0100 |
| `notes` | text | 0100 |
| `created_by` | text | 0100 |
| `created_at` | timestamptz not null default now() | 0100 |

### `aura_asset_inspections`

Created in `0027` · 0 index(es) · RLS ✅

| Column | Definition | Migration |
|---|---|---|
| `id` | UUID PRIMARY KEY | 0027 |
| `tenant_id` | TEXT NOT NULL | 0027 |
| `company_id` | TEXT | 0027 |
| `asset_id` | UUID NOT NULL REFERENCES public.aura_assets(id) ON DELETE CASCADE | 0027 |
| `date` | DATE NOT NULL | 0027 |
| `inspector` | TEXT NOT NULL | 0027 |
| `result` | TEXT NOT NULL DEFAULT 'pass', -- pass, fail | 0027 |
| `notes` | TEXT | 0027 |
| `created_at` | TIMESTAMPTZ NOT NULL DEFAULT now() | 0027 |
| `updated_at` | TIMESTAMPTZ NOT NULL DEFAULT now() | 0027 |

### `aura_asset_maintenance`

Created in `0027` · 0 index(es) · RLS ✅

| Column | Definition | Migration |
|---|---|---|
| `id` | UUID PRIMARY KEY | 0027 |
| `tenant_id` | TEXT NOT NULL | 0027 |
| `company_id` | TEXT | 0027 |
| `asset_id` | UUID NOT NULL REFERENCES public.aura_assets(id) ON DELETE CASCADE | 0027 |
| `date` | DATE NOT NULL | 0027 |
| `description` | TEXT NOT NULL | 0027 |
| `cost` | NUMERIC(15,2) NOT NULL DEFAULT 0.00 | 0027 |
| `status` | TEXT NOT NULL DEFAULT 'scheduled', -- scheduled, completed | 0027 |
| `created_at` | TIMESTAMPTZ NOT NULL DEFAULT now() | 0027 |
| `updated_at` | TIMESTAMPTZ NOT NULL DEFAULT now() | 0027 |

## assets (1 tables)

### `aura_assets`

Created in `0027` · 1 index(es) · RLS ✅

| Column | Definition | Migration |
|---|---|---|
| `id` | UUID PRIMARY KEY | 0027 |
| `tenant_id` | TEXT NOT NULL | 0027 |
| `company_id` | TEXT | 0027 |
| `name` | TEXT NOT NULL | 0027 |
| `serial_number` | TEXT NOT NULL UNIQUE | 0027 |
| `category` | TEXT NOT NULL | 0027 |
| `purchase_date` | DATE NOT NULL | 0027 |
| `purchase_cost` | NUMERIC(15,2) NOT NULL DEFAULT 0.00 | 0027 |
| `status` | TEXT NOT NULL DEFAULT 'active', -- active, maintenance, inactive, disposed | 0027 |
| `warranty_expiry` | DATE | 0027 |
| `next_calibration_date` | DATE | 0027 |
| `next_inspection_date` | DATE | 0027 |
| `created_at` | TIMESTAMPTZ NOT NULL DEFAULT now() | 0027 |
| `updated_at` | TIMESTAMPTZ NOT NULL DEFAULT now() | 0027 |
| `deleted_at` ➕ | timestamptz | 0125 |

## autonomy (1 tables)

### `aura_autonomy_proposals`

Created in `0019` · 1 index(es) · RLS —

| Column | Definition | Migration |
|---|---|---|
| `id` | UUID PRIMARY KEY DEFAULT gen_random_uuid() | 0019 |
| `tenant_id` | TEXT NOT NULL | 0019 |
| `title` | TEXT NOT NULL | 0019 |
| `description` | TEXT | 0019 |
| `category` | TEXT NOT NULL DEFAULT 'general',       -- pricing \| cost \| approval \| risk | 0019 |
| `severity` | TEXT NOT NULL DEFAULT 'info',          -- info \| warning \| critical | 0019 |
| `mode` | TEXT NOT NULL DEFAULT 'suggest',       -- observe \| suggest \| assist \| operate | 0019 |
| `target_module` | TEXT,                                  -- e.g. finance, procurement, projects | 0019 |
| `target_action` | TEXT,                                  -- e.g. approve_invoice, adjust_price | 0019 |
| `target_id` | TEXT,                                  -- aggregate id to act on | 0019 |
| `payload` | JSONB NOT NULL DEFAULT '{}'::jsonb | 0019 |
| `value_amount` | NUMERIC(14,2),                         -- monetary value for safety threshold | 0019 |
| `status` | TEXT NOT NULL DEFAULT 'pending',       -- pending \| approved \| rejected \| executed | 0019 |
| `decided_by` | TEXT | 0019 |
| `decided_at` | TIMESTAMPTZ | 0019 |
| `created_at` | TIMESTAMPTZ NOT NULL DEFAULT now() | 0019 |

## builder (2 tables)

### `aura_builder_entities`

Created in `0039` · 0 index(es) · RLS ✅

| Column | Definition | Migration |
|---|---|---|
| `id` | uuid        primary key default gen_random_uuid() | 0039 |
| `tenant_id` | text        not null | 0039 |
| `entity_key` | text        not null,   -- e.g. 'invoice', 'project', 'work_order' | 0039 |
| `label` | text        not null | 0039 |
| `module` | text        not null,   -- e.g. 'finance', 'projects', 'amc' | 0039 |
| `schema` | jsonb       not null default '{}'::jsonb | 0039 |
| `created_at` | timestamptz not null default now() | 0039 |
| *unique* | (tenant_id, entity_key) | 0039 |

### `aura_builder_forms`

Created in `0039` · 0 index(es) · RLS ✅

| Column | Definition | Migration |
|---|---|---|
| `id` | uuid        primary key default gen_random_uuid() | 0039 |
| `tenant_id` | text        not null | 0039 |
| `form_key` | text        not null | 0039 |
| `label` | text        not null | 0039 |
| `entity_type` | text        not null,   -- e.g. 'invoice', 'purchase_order' | 0039 |
| `fields` | jsonb       not null default '[]'::jsonb | 0039 |
| `version` | integer     not null default 1 | 0039 |
| `is_active` | boolean     not null default true | 0039 |
| `created_at` | timestamptz not null default now() | 0039 |
| `updated_at` | timestamptz not null default now() | 0039 |
| *unique* | (tenant_id, form_key, version) | 0039 |

## calendar (2 tables)

### `aura_calendar_adjustments`

Created in `0030` · 0 index(es) · RLS ✅

| Column | Definition | Migration |
|---|---|---|
| `id` | uuid        primary key default gen_random_uuid() | 0030 |
| `calendar_id` | uuid        not null references public.aura_working_calendars(id) on delete cascade | 0030 |
| `start_date` | date        not null | 0030 |
| `end_date` | date        not null | 0030 |
| `working_hours_per_day` | numeric(4,2) not null, -- e.g. 6.00 for Ramadan | 0030 |
| `description` | text | 0030 |
| `created_at` | timestamptz not null default now() | 0030 |

### `aura_calendar_holidays`

Created in `0030` · 0 index(es) · RLS ✅

| Column | Definition | Migration |
|---|---|---|
| `id` | uuid        primary key default gen_random_uuid() | 0030 |
| `calendar_id` | uuid        not null references public.aura_working_calendars(id) on delete cascade | 0030 |
| `holiday_date` | date        not null | 0030 |
| `description` | text | 0030 |
| `created_at` | timestamptz not null default now() | 0030 |
| *constraint* | uq_aura_calendar_holidays unique (calendar_id, holiday_date) | 0030 |

## contracts (4 tables)

### `aura_contracts_clauses`

Created in `0109` · 2 index(es) · RLS ✅

| Column | Definition | Migration |
|---|---|---|
| `id` | uuid primary key | 0109 |
| `tenant_id` | text not null | 0109 |
| `company_id` | text | 0109 |
| `code` | text not null | 0109 |
| `title` | text not null | 0109 |
| `category` | text not null default 'general' | 0109 |
| `body` | text not null | 0109 |
| `tags` | jsonb not null default '[]'::jsonb | 0109 |
| `revision` | integer not null default 1 | 0109 |
| `active` | boolean not null default true | 0109 |
| `created_by` | text | 0109 |
| `created_at` | timestamptz not null default now() | 0109 |
| `updated_at` | timestamptz not null default now() | 0109 |

### `aura_contracts_contracts`

Created in `0007` · 4 index(es) · RLS ✅

| Column | Definition | Migration |
|---|---|---|
| `id` | uuid        primary key | 0007 |
| `tenant_id` | text        not null | 0007 |
| `company_id` | text | 0007 |
| `title` | text        not null | 0007 |
| `reference` | text | 0007 |
| `tender_id` | text | 0007 |
| `tender_title` | text | 0007 |
| `account_id` | text | 0007 |
| `account_name` | text | 0007 |
| `status` | text        not null default 'draft' | 0007 |
| `value` | numeric     not null default 0 | 0007 |
| `owner_id` | text | 0007 |
| `created_by` | text | 0007 |
| `created_at` | timestamptz not null default now() | 0007 |

### `aura_contracts_obligations`

Created in `0110` · 3 index(es) · RLS ✅

| Column | Definition | Migration |
|---|---|---|
| `id` | uuid primary key | 0110 |
| `tenant_id` | text not null | 0110 |
| `company_id` | text | 0110 |
| `contract_id` | text not null | 0110 |
| `contract_title` | text | 0110 |
| `title` | text not null | 0110 |
| `description` | text | 0110 |
| `obligation_type` | text not null default 'deliverable' | 0110 |
| `responsible_party` | text not null default 'us' | 0110 |
| `due_date` | date not null | 0110 |
| `status` | text not null default 'open' | 0110 |
| `completed_date` | date | 0110 |
| `notes` | text | 0110 |
| `created_by` | text | 0110 |
| `created_at` | timestamptz not null default now() | 0110 |
| `updated_at` | timestamptz not null default now() | 0110 |

### `aura_contracts_payment_certificates`

Created in `0070` · 2 index(es) · RLS ✅

| Column | Definition | Migration |
|---|---|---|
| `id` | uuid          primary key | 0070 |
| `tenant_id` | text          not null | 0070 |
| `company_id` | text | 0070 |
| `contract_id` | text          not null | 0070 |
| `contract_title` | text | 0070 |
| `contract_value` | numeric(18,2) not null default 0 | 0070 |
| `account_id` | text | 0070 |
| `account_name` | text | 0070 |
| `sequence` | integer       not null,                 -- IPC number within the contract | 0070 |
| `reference` | text,                                   -- e.g. IPC-001 | 0070 |
| `period_start` | date | 0070 |
| `period_end` | date | 0070 |
| `cumulative_work_done` | numeric(18,2) not null default 0,       -- gross work executed to date | 0070 |
| `materials_on_site` | numeric(18,2) not null default 0 | 0070 |
| `retention_percent` | numeric(6,3)  not null default 0 | 0070 |
| `retention_cap_percent` | numeric(6,3)  not null default 0,       -- 0 = uncapped | 0070 |
| `advance_recovered_to_date` | numeric(18,2) not null default 0 | 0070 |
| `previous_certified_net` | numeric(18,2) not null default 0 | 0070 |
| `gross_to_date` | numeric(18,2) not null default 0 | 0070 |
| `retention_to_date` | numeric(18,2) not null default 0 | 0070 |
| `net_certified_to_date` | numeric(18,2) not null default 0 | 0070 |
| `net_this_certificate` | numeric(18,2) not null default 0 | 0070 |
| `status` | text          not null default 'draft', -- draft\|submitted\|certified\|paid\|rejected | 0070 |
| `created_by` | text | 0070 |
| `certified_by` | text | 0070 |
| `certified_at` | timestamptz | 0070 |
| `created_at` | timestamptz   not null default now() | 0070 |

## crm (6 tables)

### `aura_crm_accounts`

Created in `0005` · 2 index(es) · RLS ✅

| Column | Definition | Migration |
|---|---|---|
| `id` | uuid        primary key | 0005 |
| `tenant_id` | text        not null | 0005 |
| `company_id` | text | 0005 |
| `name` | text        not null | 0005 |
| `status` | text        not null default 'lead' | 0005 |
| `industry` | text | 0005 |
| `website` | text | 0005 |
| `owner_id` | text | 0005 |
| `created_by` | text | 0005 |
| `created_at` | timestamptz not null default now() | 0005 |

### `aura_crm_activities`

Created in `0098` · 3 index(es) · RLS ✅

| Column | Definition | Migration |
|---|---|---|
| `id` | uuid primary key | 0098 |
| `tenant_id` | text not null | 0098 |
| `company_id` | text | 0098 |
| `type` | text not null | 0098 |
| `subject` | text not null | 0098 |
| `notes` | text | 0098 |
| `related_type` | text | 0098 |
| `related_id` | text | 0098 |
| `due_date` | text | 0098 |
| `status` | text not null default 'open' | 0098 |
| `completed_at` | timestamptz | 0098 |
| `assignee_id` | text | 0098 |
| `created_by` | text | 0098 |
| `created_at` | timestamptz not null default now() | 0098 |

### `aura_crm_contacts`

Created in `0097` · 2 index(es) · RLS ✅

| Column | Definition | Migration |
|---|---|---|
| `id` | uuid primary key | 0097 |
| `tenant_id` | text not null | 0097 |
| `company_id` | text | 0097 |
| `account_id` | text | 0097 |
| `account_name` | text | 0097 |
| `name` | text not null | 0097 |
| `job_title` | text | 0097 |
| `email` | text | 0097 |
| `phone` | text | 0097 |
| `is_primary` | boolean not null default false | 0097 |
| `status` | text not null default 'active' | 0097 |
| `owner_id` | text | 0097 |
| `created_by` | text | 0097 |
| `created_at` | timestamptz not null default now() | 0097 |

### `aura_crm_leads`

Created in `0044` · 1 index(es) · RLS ✅

| Column | Definition | Migration |
|---|---|---|
| `id` | UUID        PRIMARY KEY DEFAULT gen_random_uuid() | 0044 |
| `tenant_id` | TEXT        NOT NULL | 0044 |
| `company_id` | TEXT | 0044 |
| `name` | TEXT        NOT NULL | 0044 |
| `company_name` | TEXT | 0044 |
| `email` | TEXT | 0044 |
| `phone` | TEXT | 0044 |
| `status` | TEXT        NOT NULL DEFAULT 'new', -- new, contacted, qualified, nurturing, disqualified | 0044 |
| `source` | TEXT,                               -- website, referral, campaign, cold_call | 0044 |
| `created_at` | TIMESTAMPTZ NOT NULL DEFAULT now() | 0044 |
| `updated_at` | TIMESTAMPTZ NOT NULL DEFAULT now() | 0044 |

### `aura_crm_opportunities`

Created in `0044` · 3 index(es) · RLS ✅

| Column | Definition | Migration |
|---|---|---|
| `id` | UUID           PRIMARY KEY DEFAULT gen_random_uuid() | 0044 |
| `tenant_id` | TEXT           NOT NULL | 0044 |
| `company_id` | TEXT | 0044 |
| `lead_id` | UUID           REFERENCES public.aura_crm_leads(id) ON DELETE SET NULL | 0044 |
| `title` | TEXT           NOT NULL | 0044 |
| `value` | NUMERIC(15, 4) NOT NULL DEFAULT 0 | 0044 |
| `stage` | TEXT           NOT NULL DEFAULT 'qualification', -- qualification, proposal, negotiation, won, lost | 0044 |
| `win_probability` | NUMERIC(5, 2)  NOT NULL DEFAULT 20.0,            -- 0 to 100 | 0044 |
| `close_date` | TIMESTAMPTZ | 0044 |
| `created_at` | TIMESTAMPTZ    NOT NULL DEFAULT now() | 0044 |
| `updated_at` | TIMESTAMPTZ    NOT NULL DEFAULT now() | 0044 |
| `account_id` ➕ | TEXT,
  ADD COLUMN IF NOT EXISTS account_name TEXT | 0080 |

### `aura_crm_quotations`

Created in `0065` · 3 index(es) · RLS —

| Column | Definition | Migration |
|---|---|---|
| `id` | uuid PRIMARY KEY DEFAULT gen_random_uuid() | 0065 |
| `tenant_id` | text NOT NULL | 0065 |
| `company_id` | text | 0065 |
| `quote_number` | text NOT NULL | 0065 |
| `customer_name` | text NOT NULL | 0065 |
| `account_id` | uuid | 0065 |
| `contact_name` | text | 0065 |
| `issue_date` | date NOT NULL | 0065 |
| `valid_until` | date | 0065 |
| `lines` | jsonb NOT NULL DEFAULT '[]'::jsonb | 0065 |
| `subtotal` | numeric(14,2) NOT NULL DEFAULT 0 | 0065 |
| `vat_total` | numeric(14,2) NOT NULL DEFAULT 0 | 0065 |
| `total` | numeric(14,2) NOT NULL DEFAULT 0 | 0065 |
| `status` | text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','sent','accepted','rejected','expired')) | 0065 |
| `created_by` | uuid | 0065 |
| `created_at` | timestamptz NOT NULL DEFAULT now() | 0065 |

## doccontrol (5 tables)

### `aura_doccontrol_correspondence`

Created in `0021` · 1 index(es) · RLS ✅

| Column | Definition | Migration |
|---|---|---|
| `id` | uuid        primary key | 0021 |
| `tenant_id` | text        not null | 0021 |
| `company_id` | text | 0021 |
| `code` | text        not null | 0021 |
| `subject` | text        not null | 0021 |
| `project_id` | uuid        not null | 0021 |
| `project_name` | text | 0021 |
| `direction` | text        not null,                -- inbound \| outbound | 0021 |
| `sender` | text | 0021 |
| `recipient` | text | 0021 |
| `status` | text        not null default 'logged', -- logged \| pending_review \| closed | 0021 |
| `owner_id` | text | 0021 |
| `created_by` | text | 0021 |
| `created_at` | timestamptz not null default now() | 0021 |
| `updated_at` | timestamptz not null default now() | 0021 |
| *unique* | (tenant_id, project_id, code) | 0021 |

### `aura_doccontrol_drawing_register`

Created in `0103` · 2 index(es) · RLS ✅

| Column | Definition | Migration |
|---|---|---|
| `id` | uuid primary key | 0103 |
| `tenant_id` | text not null | 0103 |
| `company_id` | text | 0103 |
| `project_id` | text not null | 0103 |
| `project_name` | text | 0103 |
| `document_number` | text not null | 0103 |
| `title` | text not null | 0103 |
| `discipline` | text not null default 'other' | 0103 |
| `doc_type` | text not null default 'drawing' | 0103 |
| `current_revision` | text not null default 'A' | 0103 |
| `status` | text not null default 'draft' | 0103 |
| `custodian` | text | 0103 |
| `distribution` | jsonb not null default '[]'::jsonb | 0103 |
| `revision_date` | date | 0103 |
| `created_by` | text | 0103 |
| `created_at` | timestamptz not null default now() | 0103 |
| `updated_at` | timestamptz not null default now() | 0103 |

### `aura_doccontrol_submittals`

Created in `0067` · 3 index(es) · RLS —

| Column | Definition | Migration |
|---|---|---|
| `id` | uuid PRIMARY KEY DEFAULT gen_random_uuid() | 0067 |
| `tenant_id` | text NOT NULL | 0067 |
| `company_id` | text | 0067 |
| `project_id` | uuid NOT NULL | 0067 |
| `project_name` | text | 0067 |
| `reference` | text NOT NULL | 0067 |
| `title` | text NOT NULL | 0067 |
| `discipline` | text NOT NULL DEFAULT 'other' CHECK (discipline IN ('architectural','structural','mep','elv','civil','other')) | 0067 |
| `revision` | integer NOT NULL DEFAULT 0 CHECK (revision >= 0) | 0067 |
| `status` | text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','submitted','returned')) | 0067 |
| `review_code` | text CHECK (review_code IN ('A','B','C','D')) | 0067 |
| `review_comments` | text NOT NULL DEFAULT '' | 0067 |
| `submitted_at` | timestamptz | 0067 |
| `returned_at` | timestamptz | 0067 |
| `created_by` | uuid | 0067 |
| `created_at` | timestamptz NOT NULL DEFAULT now() | 0067 |
| `updated_at` | timestamptz NOT NULL DEFAULT now() | 0067 |

### `aura_doccontrol_transmittal_items`

Created in `0123` · 3 index(es) · RLS ✅

| Column | Definition | Migration |
|---|---|---|
| `id` | uuid primary key | 0123 |
| `tenant_id` | text not null | 0123 |
| `company_id` | text | 0123 |
| `transmittal_id` | uuid not null | 0123 |
| `register_entry_id` | uuid not null | 0123 |
| `document_number` | text not null | 0123 |
| `title` | text not null | 0123 |
| `revision` | text not null | 0123 |
| `purpose` | text not null default 'for_information' | 0123 |
| `created_at` | timestamptz not null default now() | 0123 |

### `aura_doccontrol_transmittals`

Created in `0021` · 1 index(es) · RLS ✅

| Column | Definition | Migration |
|---|---|---|
| `id` | uuid        primary key | 0021 |
| `tenant_id` | text        not null | 0021 |
| `company_id` | text | 0021 |
| `code` | text        not null | 0021 |
| `title` | text        not null | 0021 |
| `project_id` | uuid        not null | 0021 |
| `project_name` | text | 0021 |
| `sender` | text | 0021 |
| `recipient` | text | 0021 |
| `status` | text        not null default 'draft', -- draft \| sent \| received \| acknowledged | 0021 |
| `owner_id` | text | 0021 |
| `created_by` | text | 0021 |
| `created_at` | timestamptz not null default now() | 0021 |
| `updated_at` | timestamptz not null default now() | 0021 |
| *unique* | (tenant_id, project_id, code) | 0021 |

## document (2 tables)

### `aura_document_templates`

Created in `0018` · 1 index(es) · RLS ✅

| Column | Definition | Migration |
|---|---|---|
| `id` | uuid        primary key | 0018 |
| `tenant_id` | text        not null | 0018 |
| `name` | text        not null | 0018 |
| `category` | text        not null | 0018 |
| `elements` | jsonb       not null default '[]'::jsonb | 0018 |
| `status` | text        not null default 'draft' | 0018 |
| `created_at` | timestamptz not null default now() | 0018 |
| `updated_at` | timestamptz not null default now() | 0018 |

### `aura_document_versions`

Created in `0002` · 1 index(es) · RLS ✅

| Column | Definition | Migration |
|---|---|---|
| `id` | uuid        primary key | 0002 |
| `document_id` | uuid        not null references public.aura_documents (id) on delete cascade | 0002 |
| `version` | integer     not null | 0002 |
| `file_name` | text        not null | 0002 |
| `content_type` | text        not null | 0002 |
| `size_bytes` | bigint      not null default 0 | 0002 |
| `storage_key` | text        not null | 0002 |
| `checksum` | text | 0002 |
| `note` | text | 0002 |
| `uploaded_by` | text | 0002 |
| `uploaded_at` | timestamptz not null default now() | 0002 |
| *unique* | (document_id, version) | 0002 |

## documents (1 tables)

### `aura_documents`

Created in `0002` · 3 index(es) · RLS ✅

| Column | Definition | Migration |
|---|---|---|
| `id` | uuid        primary key | 0002 |
| `tenant_id` | text        not null | 0002 |
| `company_id` | text | 0002 |
| `kind` | text        not null | 0002 |
| `title` | text        not null | 0002 |
| `aggregate_type` | text        not null | 0002 |
| `aggregate_id` | text        not null | 0002 |
| `status` | text        not null default 'active' | 0002 |
| `current_version` | integer     not null default 1 | 0002 |
| `created_by` | text | 0002 |
| `created_at` | timestamptz not null default now() | 0002 |

## engineering (5 tables)

### `aura_engineering_bim_models`

Created in `0111` · 2 index(es) · RLS ✅

| Column | Definition | Migration |
|---|---|---|
| `id` | uuid primary key | 0111 |
| `tenant_id` | text not null | 0111 |
| `company_id` | text | 0111 |
| `project_id` | text not null | 0111 |
| `project_name` | text | 0111 |
| `code` | text not null | 0111 |
| `name` | text not null | 0111 |
| `discipline` | text not null default 'other' | 0111 |
| `format` | text not null default 'ifc' | 0111 |
| `storage_key` | text | 0111 |
| `file_url` | text | 0111 |
| `version` | integer not null default 1 | 0111 |
| `revision` | text not null default 'A' | 0111 |
| `status` | text not null default 'wip' | 0111 |
| `file_size_bytes` | bigint | 0111 |
| `federation_group` | text | 0111 |
| `notes` | text | 0111 |
| `uploaded_by` | text | 0111 |
| `created_at` | timestamptz not null default now() | 0111 |
| `updated_at` | timestamptz not null default now() | 0111 |

### `aura_engineering_drawings`

Created in `0020` · 1 index(es) · RLS ✅

| Column | Definition | Migration |
|---|---|---|
| `id` | uuid        primary key | 0020 |
| `tenant_id` | text        not null | 0020 |
| `company_id` | text | 0020 |
| `code` | text        not null | 0020 |
| `title` | text        not null | 0020 |
| `revision` | text        not null default '0' | 0020 |
| `status` | text        not null default 'draft', -- draft \| pending_approval \| approved \| rejected | 0020 |
| `project_id` | uuid        not null | 0020 |
| `project_name` | text | 0020 |
| `owner_id` | text | 0020 |
| `created_by` | text | 0020 |
| `created_at` | timestamptz not null default now() | 0020 |
| `updated_at` | timestamptz not null default now() | 0020 |
| *unique* | (tenant_id, project_id, code, revision) | 0020 |

### `aura_engineering_rfis`

Created in `0020` · 1 index(es) · RLS ✅

| Column | Definition | Migration |
|---|---|---|
| `id` | uuid        primary key | 0020 |
| `tenant_id` | text        not null | 0020 |
| `company_id` | text | 0020 |
| `code` | text        not null | 0020 |
| `title` | text        not null | 0020 |
| `question` | text        not null | 0020 |
| `answer` | text | 0020 |
| `status` | text        not null default 'open', -- open \| answered \| closed | 0020 |
| `project_id` | uuid        not null | 0020 |
| `project_name` | text | 0020 |
| `assigned_to` | text | 0020 |
| `owner_id` | text | 0020 |
| `created_by` | text | 0020 |
| `created_at` | timestamptz not null default now() | 0020 |
| `updated_at` | timestamptz not null default now() | 0020 |
| *unique* | (tenant_id, project_id, code) | 0020 |

### `aura_engineering_submittals`

Created in `0020` · 1 index(es) · RLS ✅

| Column | Definition | Migration |
|---|---|---|
| `id` | uuid        primary key | 0020 |
| `tenant_id` | text        not null | 0020 |
| `company_id` | text | 0020 |
| `code` | text        not null | 0020 |
| `title` | text        not null | 0020 |
| `submittal_type` | text      not null,                -- material \| technical \| sample \| drawing | 0020 |
| `status` | text        not null default 'draft', -- draft \| submitted \| approved \| rejected | 0020 |
| `project_id` | uuid        not null | 0020 |
| `project_name` | text | 0020 |
| `owner_id` | text | 0020 |
| `created_by` | text | 0020 |
| `created_at` | timestamptz not null default now() | 0020 |
| `updated_at` | timestamptz not null default now() | 0020 |
| *unique* | (tenant_id, project_id, code) | 0020 |

### `aura_engineering_technical_queries`

Created in `0105` · 2 index(es) · RLS ✅

| Column | Definition | Migration |
|---|---|---|
| `id` | uuid primary key | 0105 |
| `tenant_id` | text not null | 0105 |
| `company_id` | text | 0105 |
| `code` | text not null | 0105 |
| `title` | text not null | 0105 |
| `query` | text not null | 0105 |
| `response` | text | 0105 |
| `status` | text not null default 'open' | 0105 |
| `priority` | text not null default 'medium' | 0105 |
| `discipline` | text not null default 'other' | 0105 |
| `drawing_reference` | text | 0105 |
| `cost_impact` | boolean not null default false | 0105 |
| `time_impact` | boolean not null default false | 0105 |
| `project_id` | text not null | 0105 |
| `project_name` | text | 0105 |
| `assigned_to` | text | 0105 |
| `responded_at` | timestamptz | 0105 |
| `created_by` | text | 0105 |
| `created_at` | timestamptz not null default now() | 0105 |
| `updated_at` | timestamptz not null default now() | 0105 |

## finance (19 tables)

### `aura_finance_accounts`

Created in `0014` · 2 index(es) · RLS ✅

| Column | Definition | Migration |
|---|---|---|
| `id` | uuid        primary key | 0014 |
| `tenant_id` | text        not null | 0014 |
| `code` | text        not null | 0014 |
| `name` | text        not null | 0014 |
| `type` | text        not null | 0014 |
| `parent_id` | uuid | 0014 |
| `created_at` | timestamptz not null default now() | 0014 |
| *constraint* | uq_aura_finance_accounts_code unique (tenant_id, code) | 0014 |

### `aura_finance_bank_guarantees`

Created in `0061` · 3 index(es) · RLS —

| Column | Definition | Migration |
|---|---|---|
| `id` | uuid PRIMARY KEY DEFAULT gen_random_uuid() | 0061 |
| `tenant_id` | text NOT NULL | 0061 |
| `company_id` | text | 0061 |
| `reference` | text NOT NULL | 0061 |
| `type` | text NOT NULL CHECK (type IN ('tender','performance','advance_payment','retention','other')) | 0061 |
| `beneficiary` | text NOT NULL | 0061 |
| `bank_name` | text NOT NULL | 0061 |
| `project_id` | uuid | 0061 |
| `project_name` | text | 0061 |
| `amount` | numeric(16,2) NOT NULL CHECK (amount > 0) | 0061 |
| `currency` | text NOT NULL DEFAULT 'AED' | 0061 |
| `issue_date` | date NOT NULL | 0061 |
| `expiry_date` | date NOT NULL | 0061 |
| `status` | text NOT NULL DEFAULT 'active' CHECK (status IN ('active','released','claimed','expired')) | 0061 |
| `notes` | text NOT NULL DEFAULT '' | 0061 |
| `created_by` | uuid | 0061 |
| `created_at` | timestamptz NOT NULL DEFAULT now() | 0061 |

### `aura_finance_bank_transactions`

Created in `0046` · 2 index(es) · RLS ✅

| Column | Definition | Migration |
|---|---|---|
| `id` | uuid        primary key | 0046 |
| `tenant_id` | text        not null | 0046 |
| `bank_account_id` | uuid        not null | 0046 |
| `transaction_date` | timestamptz not null | 0046 |
| `amount` | numeric     not null | 0046 |
| `description` | text        not null | 0046 |
| `reference` | text | 0046 |
| `reconciled_payment_id` | uuid | 0046 |
| `status` | text        not null default 'unreconciled' | 0046 |
| `created_at` | timestamptz not null default now() | 0046 |

### `aura_finance_budgets`

Created in `0082` · 2 index(es) · RLS ✅

| Column | Definition | Migration |
|---|---|---|
| `id` | uuid        primary key default gen_random_uuid() | 0082 |
| `tenant_id` | text        not null | 0082 |
| `name` | text        not null | 0082 |
| `from_date` | date        not null | 0082 |
| `to_date` | date        not null | 0082 |
| `lines` | jsonb       not null default '[]'::jsonb,   -- [{accountId, accountCode, accountName, amount}] | 0082 |
| `created_at` | timestamptz not null default now() | 0082 |
| `created_by` | text | 0082 |
| `deleted_at` ➕ | timestamptz | 0125 |

### `aura_finance_cost_centers`

Created in `0088` · 1 index(es) · RLS ✅

| Column | Definition | Migration |
|---|---|---|
| `id` | uuid        primary key default gen_random_uuid() | 0088 |
| `tenant_id` | text        not null | 0088 |
| `company_id` | text | 0088 |
| `code` | text        not null | 0088 |
| `name` | text        not null | 0088 |
| `active` | boolean     not null default true | 0088 |
| `created_by` | uuid | 0088 |
| `created_at` | timestamptz not null default now() | 0088 |
| *unique* | (tenant_id, code) | 0088 |

### `aura_finance_customer_invoices`

Created in `0060` · 4 index(es) · RLS —

| Column | Definition | Migration |
|---|---|---|
| `id` | uuid PRIMARY KEY DEFAULT gen_random_uuid() | 0060 |
| `tenant_id` | text NOT NULL | 0060 |
| `company_id` | text | 0060 |
| `invoice_number` | text NOT NULL | 0060 |
| `customer_name` | text NOT NULL | 0060 |
| `project_id` | uuid | 0060 |
| `project_name` | text | 0060 |
| `contract_ref` | text | 0060 |
| `issue_date` | date NOT NULL | 0060 |
| `due_date` | date | 0060 |
| `lines` | jsonb NOT NULL DEFAULT '[]'::jsonb | 0060 |
| `subtotal` | numeric(14,2) NOT NULL DEFAULT 0 | 0060 |
| `vat_total` | numeric(14,2) NOT NULL DEFAULT 0 | 0060 |
| `total` | numeric(14,2) NOT NULL DEFAULT 0 | 0060 |
| `amount_paid` | numeric(14,2) NOT NULL DEFAULT 0 CHECK (amount_paid >= 0) | 0060 |
| `status` | text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','issued','partially_paid','paid','cancelled')) | 0060 |
| `created_by` | uuid | 0060 |
| `created_at` | timestamptz NOT NULL DEFAULT now() | 0060 |
| `currency` ➕ | text          not null default 'AED',
  add column if not exists exchange_rate numeric(18,6) not null default 1,
  add column if not exists base_total    numeric(18,2) | 0089 |
| `deleted_at` ➕ | timestamptz | 0116 |

### `aura_finance_invoices`

Created in `0011` · 4 index(es) · RLS ✅

| Column | Definition | Migration |
|---|---|---|
| `id` | uuid        primary key | 0011 |
| `tenant_id` | text        not null | 0011 |
| `company_id` | text | 0011 |
| `reference` | text | 0011 |
| `title` | text        not null | 0011 |
| `po_id` | text | 0011 |
| `po_title` | text | 0011 |
| `supplier_name` | text | 0011 |
| `project_id` | text | 0011 |
| `project_name` | text | 0011 |
| `status` | text        not null default 'draft' | 0011 |
| `value` | numeric     not null default 0 | 0011 |
| `owner_id` | text | 0011 |
| `created_by` | text | 0011 |
| `created_at` | timestamptz not null default now() | 0011 |
| `wbs_node_id` ➕ | text | 0041 |
| `currency` ➕ | text          not null default 'AED',
  add column if not exists exchange_rate numeric(18,6) not null default 1,
  add column if not exists base_value    numeric(18,2) | 0096 |

### `aura_finance_journal_lines`

Created in `0014` · 2 index(es) · RLS ✅

| Column | Definition | Migration |
|---|---|---|
| `id` | uuid        primary key | 0014 |
| `journal_id` | uuid        not null references public.aura_finance_journals(id) on delete cascade | 0014 |
| `account_id` | uuid        not null references public.aura_finance_accounts(id) | 0014 |
| `account_code` | text        not null | 0014 |
| `account_name` | text        not null | 0014 |
| `debit` | numeric     not null default 0 | 0014 |
| `credit` | numeric     not null default 0 | 0014 |
| `cost_center_id` ➕ | uuid | 0088 |
| `profit_center_id` ➕ | uuid | 0090 |

### `aura_finance_journals`

Created in `0014` · 4 index(es) · RLS ✅

| Column | Definition | Migration |
|---|---|---|
| `id` | uuid        primary key | 0014 |
| `tenant_id` | text        not null | 0014 |
| `reference` | text | 0014 |
| `description` | text        not null | 0014 |
| `created_by` | text | 0014 |
| `posted_at` | timestamptz not null default now() | 0014 |
| `company_id` ➕ | text | 0093 |
| `company_id` ➕ | text | 0095 |
| `counterparty_company_id` ➕ | text | 0117 |

### `aura_finance_payments`

Created in `0014` · 2 index(es) · RLS ✅

| Column | Definition | Migration |
|---|---|---|
| `id` | uuid        primary key | 0014 |
| `tenant_id` | text        not null | 0014 |
| `invoice_id` | uuid        not null references public.aura_finance_invoices(id) | 0014 |
| `bank_account_id` | uuid        not null references public.aura_finance_accounts(id) | 0014 |
| `amount` | numeric     not null default 0 | 0014 |
| `reference` | text | 0014 |
| `created_by` | text | 0014 |
| `paid_at` | timestamptz not null default now() | 0014 |

### `aura_finance_period_closes`

Created in `0081` · 1 index(es) · RLS ✅

| Column | Definition | Migration |
|---|---|---|
| `id` | uuid        primary key default gen_random_uuid() | 0081 |
| `tenant_id` | text        not null | 0081 |
| `period` | text        not null,                 -- 'YYYY-MM' | 0081 |
| `closed_at` | timestamptz not null default now() | 0081 |
| `closed_by` | text | 0081 |
| `note` | text | 0081 |
| *unique* | (tenant_id, period) | 0081 |

### `aura_finance_petty_cash_funds`

Created in `0059` · 1 index(es) · RLS —

| Column | Definition | Migration |
|---|---|---|
| `id` | uuid PRIMARY KEY DEFAULT gen_random_uuid() | 0059 |
| `tenant_id` | text NOT NULL | 0059 |
| `company_id` | text | 0059 |
| `name` | text NOT NULL | 0059 |
| `custodian_employee_id` | uuid | 0059 |
| `balance` | numeric(14,2) NOT NULL DEFAULT 0 CHECK (balance >= 0) | 0059 |
| `status` | text NOT NULL DEFAULT 'active' CHECK (status IN ('active','closed')) | 0059 |
| `created_by` | uuid | 0059 |
| `created_at` | timestamptz NOT NULL DEFAULT now() | 0059 |

### `aura_finance_petty_cash_transactions`

Created in `0059` · 1 index(es) · RLS —

| Column | Definition | Migration |
|---|---|---|
| `id` | uuid PRIMARY KEY DEFAULT gen_random_uuid() | 0059 |
| `tenant_id` | text NOT NULL | 0059 |
| `fund_id` | uuid NOT NULL REFERENCES public.aura_finance_petty_cash_funds(id) | 0059 |
| `type` | text NOT NULL CHECK (type IN ('topup','expense')) | 0059 |
| `category` | text NOT NULL DEFAULT 'other' CHECK (category IN ('office','travel','fuel','materials','refreshments','other')) | 0059 |
| `amount` | numeric(14,2) NOT NULL CHECK (amount > 0) | 0059 |
| `description` | text NOT NULL DEFAULT '' | 0059 |
| `balance_after` | numeric(14,2) NOT NULL | 0059 |
| `transaction_date` | date NOT NULL | 0059 |
| `created_at` | timestamptz NOT NULL DEFAULT now() | 0059 |

### `aura_finance_pl_projection`

Created in `0035` · 0 index(es) · RLS ✅

| Column | Definition | Migration |
|---|---|---|
| `tenant_id` | text        not null | 0035 |
| `company_id` | text | 0035 |
| `period_month` | text        not null, -- e.g. "2026-06" | 0035 |
| `revenue` | numeric(15,2) not null default 0.00 | 0035 |
| `expense` | numeric(15,2) not null default 0.00 | 0035 |
| `updated_at` | timestamptz not null default now() | 0035 |
| *constraint* | pk_aura_finance_pl_projection primary key (tenant_id, period_month) | 0035 |

### `aura_finance_post_dated_cheques`

Created in `0072` · 3 index(es) · RLS ✅

| Column | Definition | Migration |
|---|---|---|
| `id` | uuid PRIMARY KEY DEFAULT gen_random_uuid() | 0072 |
| `tenant_id` | text NOT NULL | 0072 |
| `company_id` | text | 0072 |
| `cheque_number` | text NOT NULL | 0072 |
| `direction` | text NOT NULL CHECK (direction IN ('received','issued')) | 0072 |
| `party_name` | text NOT NULL | 0072 |
| `bank_name` | text NOT NULL | 0072 |
| `amount` | numeric(16,2) NOT NULL CHECK (amount > 0) | 0072 |
| `currency` | text NOT NULL DEFAULT 'AED' | 0072 |
| `issue_date` | date NOT NULL | 0072 |
| `maturity_date` | date NOT NULL | 0072 |
| `status` | text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','deposited','cleared','bounced','cancelled')) | 0072 |
| `reference` | text | 0072 |
| `bounce_count` | integer NOT NULL DEFAULT 0 | 0072 |
| `notes` | text NOT NULL DEFAULT '' | 0072 |
| `created_by` | uuid | 0072 |
| `created_at` | timestamptz NOT NULL DEFAULT now() | 0072 |

### `aura_finance_profit_centers`

Created in `0090` · 1 index(es) · RLS ✅

| Column | Definition | Migration |
|---|---|---|
| `id` | uuid        primary key default gen_random_uuid() | 0090 |
| `tenant_id` | text        not null | 0090 |
| `company_id` | text | 0090 |
| `code` | text        not null | 0090 |
| `name` | text        not null | 0090 |
| `active` | boolean     not null default true | 0090 |
| `created_by` | uuid | 0090 |
| `created_at` | timestamptz not null default now() | 0090 |
| *unique* | (tenant_id, code) | 0090 |

### `aura_finance_tax_codes`

Created in `0048` · 0 index(es) · RLS ✅

| Column | Definition | Migration |
|---|---|---|
| `id` | uuid PRIMARY KEY DEFAULT gen_random_uuid() | 0048 |
| `tenant_id` | text NOT NULL | 0048 |
| `code` | text NOT NULL,             -- e.g. 'VAT-5', 'VAT-0', 'EXEMPT', 'RC' | 0048 |
| `description` | text NOT NULL,      -- e.g. '5% Standard Rate VAT' | 0048 |
| `rate` | numeric NOT NULL DEFAULT 0, -- e.g. 5.00 = 5% | 0048 |
| `tax_type` | text NOT NULL DEFAULT 'output', -- 'output' \| 'input' \| 'reverse_charge' | 0048 |
| `is_active` | boolean NOT NULL DEFAULT true | 0048 |
| `effective_from` | date NOT NULL DEFAULT CURRENT_DATE | 0048 |
| `effective_to` | date | 0048 |
| `created_at` | timestamptz NOT NULL DEFAULT now() | 0048 |
| *unique* | (tenant_id, code) | 0048 |

### `aura_finance_tax_lines`

Created in `0048` · 0 index(es) · RLS ✅

| Column | Definition | Migration |
|---|---|---|
| `id` | uuid PRIMARY KEY DEFAULT gen_random_uuid() | 0048 |
| `tenant_id` | text NOT NULL | 0048 |
| `invoice_id` | uuid NOT NULL REFERENCES public.aura_finance_invoices(id) | 0048 |
| `tax_code_id` | uuid NOT NULL REFERENCES public.aura_finance_tax_codes(id) | 0048 |
| `taxable_amount` | numeric NOT NULL DEFAULT 0 | 0048 |
| `tax_rate` | numeric NOT NULL DEFAULT 0 | 0048 |
| `tax_amount` | numeric NOT NULL DEFAULT 0 | 0048 |
| `is_inclusive` | boolean NOT NULL DEFAULT false, -- tax-inclusive pricing | 0048 |
| `created_at` | timestamptz NOT NULL DEFAULT now() | 0048 |

### `aura_finance_tax_returns`

Created in `0048` · 0 index(es) · RLS ✅

| Column | Definition | Migration |
|---|---|---|
| `id` | uuid PRIMARY KEY DEFAULT gen_random_uuid() | 0048 |
| `tenant_id` | text NOT NULL | 0048 |
| `period_start` | date NOT NULL | 0048 |
| `period_end` | date NOT NULL | 0048 |
| `total_output_tax` | numeric NOT NULL DEFAULT 0 | 0048 |
| `total_input_tax` | numeric NOT NULL DEFAULT 0 | 0048 |
| `net_tax_payable` | numeric GENERATED ALWAYS AS (total_output_tax - total_input_tax) STORED | 0048 |
| `status` | text NOT NULL DEFAULT 'draft', -- 'draft' \| 'filed' \| 'paid' | 0048 |
| `filed_at` | timestamptz | 0048 |
| `filed_by` | text | 0048 |
| `created_at` | timestamptz NOT NULL DEFAULT now() | 0048 |

## fleet (6 tables)

### `aura_fleet_fuel_logs`

Created in `0026` · 1 index(es) · RLS ✅

| Column | Definition | Migration |
|---|---|---|
| `id` | uuid        primary key | 0026 |
| `tenant_id` | text        not null | 0026 |
| `company_id` | text | 0026 |
| `vehicle_id` | uuid        not null references public.aura_fleet_vehicles(id) on delete cascade | 0026 |
| `date` | date        not null | 0026 |
| `liters` | numeric(10,2) not null | 0026 |
| `cost` | numeric(10,2) not null | 0026 |
| `odometer` | integer     not null | 0026 |
| `created_at` | timestamptz not null default now() | 0026 |
| `updated_at` | timestamptz not null default now() | 0026 |

### `aura_fleet_maintenance`

Created in `0026` · 1 index(es) · RLS ✅

| Column | Definition | Migration |
|---|---|---|
| `id` | uuid        primary key | 0026 |
| `tenant_id` | text        not null | 0026 |
| `company_id` | text | 0026 |
| `vehicle_id` | uuid        not null references public.aura_fleet_vehicles(id) on delete cascade | 0026 |
| `date` | date        not null | 0026 |
| `description` | text        not null | 0026 |
| `cost` | numeric(10,2) not null default 0.00 | 0026 |
| `status` | text        not null default 'scheduled', -- scheduled \| completed | 0026 |
| `created_at` | timestamptz not null default now() | 0026 |
| `updated_at` | timestamptz not null default now() | 0026 |

### `aura_fleet_salik_charges`

Created in `0077` · 3 index(es) · RLS ✅

| Column | Definition | Migration |
|---|---|---|
| `id` | uuid PRIMARY KEY DEFAULT gen_random_uuid() | 0077 |
| `tenant_id` | text NOT NULL | 0077 |
| `company_id` | text | 0077 |
| `vehicle_id` | uuid NOT NULL | 0077 |
| `plate_number` | text NOT NULL DEFAULT '' | 0077 |
| `gate` | text NOT NULL | 0077 |
| `charge_date` | date NOT NULL | 0077 |
| `charge_time` | text NOT NULL DEFAULT '' | 0077 |
| `amount` | numeric(12,2) NOT NULL CHECK (amount > 0) | 0077 |
| `status` | text NOT NULL DEFAULT 'recorded' CHECK (status IN ('recorded','allocated','disputed')) | 0077 |
| `allocated_to` | text NOT NULL DEFAULT '' | 0077 |
| `notes` | text NOT NULL DEFAULT '' | 0077 |
| `created_at` | timestamptz NOT NULL DEFAULT now() | 0077 |
| `updated_at` | timestamptz NOT NULL DEFAULT now() | 0077 |

### `aura_fleet_telemetry_logs`

Created in `0107` · 1 index(es) · RLS ✅

| Column | Definition | Migration |
|---|---|---|
| `id` | uuid        primary key | 0107 |
| `tenant_id` | text        not null | 0107 |
| `vehicle_id` | uuid        not null references public.aura_fleet_vehicles(id) on delete cascade | 0107 |
| `latitude` | numeric(9,6) not null | 0107 |
| `longitude` | numeric(9,6) not null | 0107 |
| `speed` | numeric(5,2) not null | 0107 |
| `odometer` | integer | 0107 |
| `recorded_at` | timestamptz not null default now() | 0107 |

### `aura_fleet_traffic_fines`

Created in `0057` · 3 index(es) · RLS —

| Column | Definition | Migration |
|---|---|---|
| `id` | uuid PRIMARY KEY DEFAULT gen_random_uuid() | 0057 |
| `tenant_id` | text NOT NULL | 0057 |
| `company_id` | text | 0057 |
| `vehicle_id` | uuid NOT NULL | 0057 |
| `driver_employee_id` | uuid | 0057 |
| `fine_number` | text NOT NULL | 0057 |
| `violation` | text NOT NULL | 0057 |
| `location` | text NOT NULL DEFAULT '' | 0057 |
| `amount` | numeric(12,2) NOT NULL CHECK (amount > 0) | 0057 |
| `black_points` | integer NOT NULL DEFAULT 0 CHECK (black_points >= 0 AND black_points <= 24) | 0057 |
| `fine_date` | date NOT NULL | 0057 |
| `status` | text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','assigned','disputed','paid')) | 0057 |
| `paid_date` | date | 0057 |
| `created_at` | timestamptz NOT NULL DEFAULT now() | 0057 |
| `updated_at` | timestamptz NOT NULL DEFAULT now() | 0057 |

### `aura_fleet_vehicles`

Created in `0026` · 2 index(es) · RLS ✅

| Column | Definition | Migration |
|---|---|---|
| `id` | uuid        primary key | 0026 |
| `tenant_id` | text        not null | 0026 |
| `company_id` | text | 0026 |
| `make` | text        not null | 0026 |
| `model` | text        not null | 0026 |
| `year` | integer     not null | 0026 |
| `plate_number` | text        not null | 0026 |
| `registration_expiry` | date | 0026 |
| `status` | text        not null default 'active', -- active \| maintenance \| retired | 0026 |
| `driver_employee_id` | uuid,       -- driver link | 0026 |
| `created_at` | timestamptz not null default now() | 0026 |
| `updated_at` | timestamptz not null default now() | 0026 |
| `last_latitude` ➕ | numeric(9,6) | 0107 |
| `last_longitude` ➕ | numeric(9,6) | 0107 |
| `last_speed` ➕ | numeric(5,2) | 0107 |
| `last_odometer` ➕ | integer | 0107 |
| `last_telemetry_at` ➕ | timestamptz | 0107 |
| `deleted_at` ➕ | timestamptz | 0125 |

## hr (8 tables)

### `aura_hr_appraisals`

Created in `0120` · 2 index(es) · RLS ✅

| Column | Definition | Migration |
|---|---|---|
| `id` | uuid primary key | 0120 |
| `tenant_id` | text not null | 0120 |
| `company_id` | text | 0120 |
| `employee_id` | text not null | 0120 |
| `employee_name` | text | 0120 |
| `period` | text not null | 0120 |
| `reviewer_id` | text | 0120 |
| `criteria` | jsonb not null default '[]'::jsonb | 0120 |
| `overall_score` | numeric(6,2) not null default 0 | 0120 |
| `status` | text not null default 'draft' | 0120 |
| `strengths` | text | 0120 |
| `improvements` | text | 0120 |
| `comments` | text | 0120 |
| `submitted_at` | timestamptz | 0120 |
| `acknowledged_at` | timestamptz | 0120 |
| `created_by` | text | 0120 |
| `created_at` | timestamptz not null default now() | 0120 |
| `updated_at` | timestamptz not null default now() | 0120 |

### `aura_hr_attendance`

Created in `0075` · 3 index(es) · RLS ✅

| Column | Definition | Migration |
|---|---|---|
| `id` | uuid PRIMARY KEY DEFAULT gen_random_uuid() | 0075 |
| `tenant_id` | text NOT NULL | 0075 |
| `company_id` | text | 0075 |
| `employee_id` | uuid NOT NULL | 0075 |
| `employee_name` | text NOT NULL DEFAULT 'Employee' | 0075 |
| `date` | date NOT NULL | 0075 |
| `check_in` | text | 0075 |
| `check_out` | text | 0075 |
| `status` | text NOT NULL DEFAULT 'present' CHECK (status IN ('present','absent','late','half_day','leave','holiday')) | 0075 |
| `worked_hours` | numeric(5,2) NOT NULL DEFAULT 0 CHECK (worked_hours >= 0) | 0075 |
| `notes` | text NOT NULL DEFAULT '' | 0075 |
| `created_at` | timestamptz NOT NULL DEFAULT now() | 0075 |
| `created_by` | uuid | 0075 |

### `aura_hr_employees`

Created in `0025` · 3 index(es) · RLS ✅

| Column | Definition | Migration |
|---|---|---|
| `id` | uuid        primary key | 0025 |
| `tenant_id` | text        not null | 0025 |
| `company_id` | text | 0025 |
| `first_name` | text        not null | 0025 |
| `last_name` | text        not null | 0025 |
| `email` | text | 0025 |
| `phone` | text | 0025 |
| `role` | text        not null | 0025 |
| `department` | text        not null | 0025 |
| `status` | text        not null default 'active', -- active \| suspended \| terminated | 0025 |
| `joined_date` | date        not null | 0025 |
| `visa_expiry` | date | 0025 |
| `permit_expiry` | date | 0025 |
| `labor_camp` | text | 0025 |
| `created_at` | timestamptz not null default now() | 0025 |
| `updated_at` | timestamptz not null default now() | 0025 |
| `iban` ➕ | text,
  add column if not exists mol_employee_id   text,
  add column if not exists bank_routing_code text | 0086 |
| `manager_id` ➕ | text | 0119 |
| `deleted_at` ➕ | timestamptz | 0125 |

### `aura_hr_expense_claims`

Created in `0058` · 3 index(es) · RLS —

| Column | Definition | Migration |
|---|---|---|
| `id` | uuid PRIMARY KEY DEFAULT gen_random_uuid() | 0058 |
| `tenant_id` | text NOT NULL | 0058 |
| `employee_id` | uuid NOT NULL | 0058 |
| `project_id` | uuid | 0058 |
| `category` | text NOT NULL CHECK (category IN ('travel','accommodation','meals','fuel','materials','other')) | 0058 |
| `amount` | numeric(12,2) NOT NULL CHECK (amount > 0) | 0058 |
| `expense_date` | date NOT NULL | 0058 |
| `description` | text NOT NULL DEFAULT '' | 0058 |
| `status` | text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','submitted','approved','rejected','reimbursed')) | 0058 |
| `approved_by` | uuid | 0058 |
| `reimbursed_date` | date | 0058 |
| `created_at` | timestamptz NOT NULL DEFAULT now() | 0058 |

### `aura_hr_leaves`

Created in `0025` · 1 index(es) · RLS ✅

| Column | Definition | Migration |
|---|---|---|
| `id` | uuid        primary key | 0025 |
| `tenant_id` | text        not null | 0025 |
| `company_id` | text | 0025 |
| `employee_id` | uuid        not null references public.aura_hr_employees(id) on delete cascade | 0025 |
| `leave_type` | text        not null, -- annual \| sick \| unpaid | 0025 |
| `start_date` | date        not null | 0025 |
| `end_date` | date        not null | 0025 |
| `status` | text        not null default 'pending', -- pending \| approved \| rejected | 0025 |
| `reason` | text | 0025 |
| `created_at` | timestamptz not null default now() | 0025 |
| `updated_at` | timestamptz not null default now() | 0025 |

### `aura_hr_payroll_runs`

Created in `0025` · 1 index(es) · RLS ✅

| Column | Definition | Migration |
|---|---|---|
| `id` | uuid        primary key | 0025 |
| `tenant_id` | text        not null | 0025 |
| `company_id` | text | 0025 |
| `employee_id` | uuid        not null references public.aura_hr_employees(id) on delete cascade | 0025 |
| `period_start` | date        not null | 0025 |
| `period_end` | date        not null | 0025 |
| `basic_salary` | numeric(15,2) not null default 0.00 | 0025 |
| `allowances` | numeric(15,2) not null default 0.00 | 0025 |
| `deductions` | numeric(15,2) not null default 0.00 | 0025 |
| `net_salary` | numeric(15,2) not null default 0.00 | 0025 |
| `status` | text        not null default 'draft', -- draft \| approved \| paid | 0025 |
| `processed_at` | timestamptz | 0025 |
| `created_at` | timestamptz not null default now() | 0025 |
| `updated_at` | timestamptz not null default now() | 0025 |

### `aura_hr_staff_advances`

Created in `0063` · 3 index(es) · RLS —

| Column | Definition | Migration |
|---|---|---|
| `id` | uuid PRIMARY KEY DEFAULT gen_random_uuid() | 0063 |
| `tenant_id` | text NOT NULL | 0063 |
| `employee_id` | uuid NOT NULL | 0063 |
| `amount` | numeric(12,2) NOT NULL CHECK (amount > 0) | 0063 |
| `reason` | text NOT NULL DEFAULT '' | 0063 |
| `installments` | integer NOT NULL DEFAULT 1 CHECK (installments >= 1 AND installments <= 60) | 0063 |
| `amount_repaid` | numeric(12,2) NOT NULL DEFAULT 0 CHECK (amount_repaid >= 0) | 0063 |
| `status` | text NOT NULL DEFAULT 'requested' CHECK (status IN ('requested','approved','rejected','disbursed','settled')) | 0063 |
| `request_date` | date NOT NULL | 0063 |
| `approved_by` | uuid | 0063 |
| `disbursed_date` | date | 0063 |
| `created_at` | timestamptz NOT NULL DEFAULT now() | 0063 |

### `aura_hr_timesheets`

Created in `0056` · 3 index(es) · RLS —

| Column | Definition | Migration |
|---|---|---|
| `id` | uuid PRIMARY KEY DEFAULT gen_random_uuid() | 0056 |
| `tenant_id` | text NOT NULL | 0056 |
| `employee_id` | uuid NOT NULL | 0056 |
| `project_id` | uuid | 0056 |
| `wbs_node_id` | uuid | 0056 |
| `date` | date NOT NULL | 0056 |
| `hours` | numeric(5,2) NOT NULL CHECK (hours >= 0 AND hours <= 24) | 0056 |
| `overtime` | numeric(5,2) NOT NULL DEFAULT 0 CHECK (overtime >= 0) | 0056 |
| `description` | text NOT NULL DEFAULT '' | 0056 |
| `status` | text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','submitted','approved','rejected')) | 0056 |
| `created_at` | timestamptz NOT NULL DEFAULT now() | 0056 |
| `approved_by` | uuid | 0056 |

## hse (6 tables)

### `aura_hse_capas`

Created in `0023` · 1 index(es) · RLS ✅

| Column | Definition | Migration |
|---|---|---|
| `id` | uuid        primary key | 0023 |
| `tenant_id` | text        not null | 0023 |
| `company_id` | text | 0023 |
| `project_id` | uuid        not null | 0023 |
| `project_name` | text | 0023 |
| `source_type` | text        not null, -- incident \| audit \| inspection | 0023 |
| `source_id` | uuid | 0023 |
| `action_required` | text        not null | 0023 |
| `assigned_to` | text | 0023 |
| `due_date` | date        not null | 0023 |
| `status` | text        not null default 'pending', -- pending \| in_progress \| completed | 0023 |
| `completed_at` | timestamptz | 0023 |
| `created_by` | text | 0023 |
| `created_at` | timestamptz not null default now() | 0023 |
| `updated_at` | timestamptz not null default now() | 0023 |

### `aura_hse_incidents`

Created in `0023` · 1 index(es) · RLS ✅

| Column | Definition | Migration |
|---|---|---|
| `id` | uuid        primary key | 0023 |
| `tenant_id` | text        not null | 0023 |
| `company_id` | text | 0023 |
| `project_id` | uuid        not null | 0023 |
| `project_name` | text | 0023 |
| `date` | date        not null | 0023 |
| `severity` | text        not null, -- near_miss \| minor \| major \| fatal | 0023 |
| `description` | text        not null | 0023 |
| `location_detail` | text        not null | 0023 |
| `status` | text        not null default 'reported', -- reported \| investigating \| closed | 0023 |
| `created_by` | text | 0023 |
| `created_at` | timestamptz not null default now() | 0023 |
| `updated_at` | timestamptz not null default now() | 0023 |

### `aura_hse_ptws`

Created in `0023` · 1 index(es) · RLS ✅

| Column | Definition | Migration |
|---|---|---|
| `id` | uuid        primary key | 0023 |
| `tenant_id` | text        not null | 0023 |
| `company_id` | text | 0023 |
| `project_id` | uuid        not null | 0023 |
| `project_name` | text | 0023 |
| `permit_type` | text        not null, -- hot_work \| confined_space \| height_work \| electrical \| excavation | 0023 |
| `valid_from` | timestamptz not null | 0023 |
| `valid_to` | timestamptz not null | 0023 |
| `description` | text        not null | 0023 |
| `status` | text        not null default 'requested', -- draft \| requested \| approved \| expired \| closed | 0023 |
| `approved_by` | text | 0023 |
| `approved_at` | timestamptz | 0023 |
| `created_by` | text | 0023 |
| `created_at` | timestamptz not null default now() | 0023 |
| `updated_at` | timestamptz not null default now() | 0023 |

### `aura_hse_risk_assessments`

Created in `0104` · 2 index(es) · RLS ✅

| Column | Definition | Migration |
|---|---|---|
| `id` | uuid primary key | 0104 |
| `tenant_id` | text not null | 0104 |
| `company_id` | text | 0104 |
| `project_id` | text not null | 0104 |
| `project_name` | text | 0104 |
| `reference` | text not null | 0104 |
| `activity` | text not null | 0104 |
| `assessor` | text | 0104 |
| `hazards` | jsonb not null default '[]'::jsonb | 0104 |
| `initial_score` | integer not null default 0 | 0104 |
| `residual_score` | integer not null default 0 | 0104 |
| `residual_band` | text not null default 'low' | 0104 |
| `status` | text not null default 'draft' | 0104 |
| `review_date` | date | 0104 |
| `created_by` | text | 0104 |
| `created_at` | timestamptz not null default now() | 0104 |
| `updated_at` | timestamptz not null default now() | 0104 |

### `aura_hse_safety_training`

Created in `0106` · 1 index(es) · RLS ✅

| Column | Definition | Migration |
|---|---|---|
| `id` | uuid        primary key | 0106 |
| `tenant_id` | text        not null | 0106 |
| `company_id` | text | 0106 |
| `worker_name` | text        not null | 0106 |
| `worker_id` | text        not null | 0106 |
| `induction_date` | date        not null | 0106 |
| `card_number` | text | 0106 |
| `card_expiry` | date | 0106 |
| `certifications` | jsonb       not null default '[]'::jsonb | 0106 |
| `status` | text        not null default 'valid', -- valid \| expired | 0106 |
| `created_by` | text | 0106 |
| `created_at` | timestamptz not null default now() | 0106 |
| `updated_at` | timestamptz not null default now() | 0106 |
| *unique* | (tenant_id, worker_id) | 0106 |

### `aura_hse_toolbox_talks`

Created in `0064` · 3 index(es) · RLS —

| Column | Definition | Migration |
|---|---|---|
| `id` | uuid PRIMARY KEY DEFAULT gen_random_uuid() | 0064 |
| `tenant_id` | text NOT NULL | 0064 |
| `company_id` | text | 0064 |
| `project_id` | uuid NOT NULL | 0064 |
| `project_name` | text | 0064 |
| `topic` | text NOT NULL | 0064 |
| `conducted_by` | text NOT NULL | 0064 |
| `talk_date` | date NOT NULL | 0064 |
| `attendee_count` | integer NOT NULL CHECK (attendee_count >= 1) | 0064 |
| `notes` | text NOT NULL DEFAULT '' | 0064 |
| `created_by` | uuid | 0064 |
| `created_at` | timestamptz NOT NULL DEFAULT now() | 0064 |

## inventory (4 tables)

### `aura_inventory_grns`

Created in `0010` · 4 index(es) · RLS ✅

| Column | Definition | Migration |
|---|---|---|
| `id` | uuid        primary key | 0010 |
| `tenant_id` | text        not null | 0010 |
| `company_id` | text | 0010 |
| `reference` | text | 0010 |
| `title` | text        not null | 0010 |
| `po_id` | text | 0010 |
| `po_title` | text | 0010 |
| `supplier_name` | text | 0010 |
| `project_id` | text | 0010 |
| `project_name` | text | 0010 |
| `status` | text        not null default 'received' | 0010 |
| `value` | numeric     not null default 0 | 0010 |
| `owner_id` | text | 0010 |
| `created_by` | text | 0010 |
| `created_at` | timestamptz not null default now() | 0010 |

### `aura_inventory_stock_items`

Created in `0054` · 2 index(es) · RLS ✅

| Column | Definition | Migration |
|---|---|---|
| `id` | uuid          primary key | 0054 |
| `tenant_id` | text          not null | 0054 |
| `company_id` | text | 0054 |
| `code` | text          not null | 0054 |
| `name` | text          not null | 0054 |
| `unit` | text          not null default 'pcs' | 0054 |
| `warehouse` | text          not null default 'Main' | 0054 |
| `quantity_on_hand` | numeric(15,4) not null default 0 | 0054 |
| `created_by` | text | 0054 |
| `created_at` | timestamptz   not null default now() | 0054 |
| *unique* | (tenant_id, code) | 0054 |
| `avg_cost` ➕ | numeric(15,4) not null default 0 | 0073 |
| `reorder_level` ➕ | numeric(15,4) not null default 0,
  add column if not exists reorder_qty   numeric(15,4) not null default 0 | 0074 |
| `costing_method` ➕ | text not null default 'wac' | 0112 |
| `barcode` ➕ | text,
  add column if not exists alt_units jsonb not null default '[]'::jsonb | 0124 |

### `aura_inventory_stock_movements`

Created in `0054` · 1 index(es) · RLS ✅

| Column | Definition | Migration |
|---|---|---|
| `id` | uuid          primary key | 0054 |
| `tenant_id` | text          not null | 0054 |
| `stock_item_id` | uuid          not null references public.aura_inventory_stock_items(id) on delete cascade | 0054 |
| `direction` | text          not null | 0054 |
| `quantity` | numeric(15,4) not null | 0054 |
| `reason` | text          not null | 0054 |
| `balance_after` | numeric(15,4) not null | 0054 |
| `created_at` | timestamptz   not null default now() | 0054 |
| `unit_cost` ➕ | numeric(15,4) not null default 0,
  add column if not exists value_after numeric(15,4) not null default 0 | 0073 |

### `aura_inventory_stock_transfers`

Created in `0055` · 3 index(es) · RLS —

| Column | Definition | Migration |
|---|---|---|
| `id` | uuid PRIMARY KEY DEFAULT gen_random_uuid() | 0055 |
| `tenant_id` | text NOT NULL | 0055 |
| `source_item_id` | uuid NOT NULL REFERENCES public.aura_inventory_stock_items(id) | 0055 |
| `dest_item_id` | uuid NOT NULL REFERENCES public.aura_inventory_stock_items(id) | 0055 |
| `quantity` | numeric(18,4) NOT NULL CHECK (quantity > 0) | 0055 |
| `reason` | text NOT NULL DEFAULT 'warehouse transfer' | 0055 |
| `status` | text NOT NULL DEFAULT 'completed' CHECK (status IN ('pending','completed','cancelled')) | 0055 |
| `created_at` | timestamptz NOT NULL DEFAULT now() | 0055 |
| `completed_at` | timestamptz | 0055 |

## kernel (2 tables)

### `aura_kernel_saga_steps`

Created in `0043` · 1 index(es) · RLS ✅

| Column | Definition | Migration |
|---|---|---|
| `id` | UUID        PRIMARY KEY DEFAULT gen_random_uuid() | 0043 |
| `tenant_id` | TEXT        NOT NULL | 0043 |
| `company_id` | TEXT | 0043 |
| `saga_id` | UUID        NOT NULL REFERENCES public.aura_kernel_sagas(id) ON DELETE CASCADE | 0043 |
| `step_name` | TEXT        NOT NULL | 0043 |
| `status` | TEXT        NOT NULL, -- pending, running, completed, failed, compensated | 0043 |
| `action_payload` | JSONB       NOT NULL DEFAULT '{}' | 0043 |
| `compensation_payload` | JSONB       NOT NULL DEFAULT '{}' | 0043 |
| `error_message` | TEXT | 0043 |
| `executed_at` | TIMESTAMPTZ | 0043 |
| `compensated_at` | TIMESTAMPTZ | 0043 |
| `created_at` | TIMESTAMPTZ NOT NULL DEFAULT now() | 0043 |
| `updated_at` | TIMESTAMPTZ NOT NULL DEFAULT now() | 0043 |

### `aura_kernel_sagas`

Created in `0043` · 2 index(es) · RLS ✅

| Column | Definition | Migration |
|---|---|---|
| `id` | UUID        PRIMARY KEY DEFAULT gen_random_uuid() | 0043 |
| `tenant_id` | TEXT        NOT NULL | 0043 |
| `company_id` | TEXT | 0043 |
| `saga_type` | TEXT        NOT NULL, -- e.g. 'tendering.tender_awarded_saga' | 0043 |
| `status` | TEXT        NOT NULL, -- pending, running, completed, failed, compensating, compensated | 0043 |
| `payload` | JSONB       NOT NULL DEFAULT '{}' | 0043 |
| `created_at` | TIMESTAMPTZ NOT NULL DEFAULT now() | 0043 |
| `updated_at` | TIMESTAMPTZ NOT NULL DEFAULT now() | 0043 |

## kernel-misc (14 tables)

### `aura_audit_log`

Created in `0029` · 3 index(es) · RLS ✅

| Column | Definition | Migration |
|---|---|---|
| `id` | uuid        primary key default gen_random_uuid() | 0029 |
| `tenant_id` | text        not null | 0029 |
| `company_id` | text | 0029 |
| `actor_id` | text | 0029 |
| `module` | text        not null | 0029 |
| `entity_type` | text        not null | 0029 |
| `entity_id` | text        not null | 0029 |
| `action` | text        not null | 0029 |
| `changes` | jsonb       not null default '{}'::jsonb | 0029 |
| `metadata` | jsonb       not null default '{}'::jsonb | 0029 |
| `created_at` | timestamptz not null default now() | 0029 |
| `correlation_id` ➕ | TEXT | 0051 |

### `aura_background_jobs`

Created in `0036` · 0 index(es) · RLS ✅

| Column | Definition | Migration |
|---|---|---|
| `id` | uuid        primary key default gen_random_uuid() | 0036 |
| `tenant_id` | text        not null | 0036 |
| `queue_name` | text        not null default 'default' | 0036 |
| `payload` | jsonb       not null | 0036 |
| `status` | text        not null default 'pending', -- 'pending', 'running', 'completed', 'failed' | 0036 |
| `attempts` | integer     not null default 0 | 0036 |
| `max_attempts` | integer     not null default 3 | 0036 |
| `run_at` | timestamptz not null default now() | 0036 |
| `error_message` | text | 0036 |
| `created_at` | timestamptz not null default now() | 0036 |
| `updated_at` | timestamptz not null default now() | 0036 |

### `aura_digital_twin_snapshots`

Created in `0040` · 0 index(es) · RLS ✅

| Column | Definition | Migration |
|---|---|---|
| `id` | uuid        primary key default gen_random_uuid() | 0040 |
| `tenant_id` | text        not null | 0040 |
| `entity_type` | text        not null,   -- e.g. 'project', 'asset', 'invoice' | 0040 |
| `entity_id` | text        not null | 0040 |
| `snapshot_data` | jsonb       not null | 0040 |
| `captured_at` | timestamptz not null default now() | 0040 |
| *unique* | (tenant_id, entity_type, entity_id) | 0040 |

### `aura_events`

Created in `0001` · 6 index(es) · RLS ✅

| Column | Definition | Migration |
|---|---|---|
| `id` | uuid        primary key | 0001 |
| `type` | text        not null | 0001 |
| `tenant_id` | text        not null | 0001 |
| `company_id` | text | 0001 |
| `aggregate_type` | text        not null | 0001 |
| `aggregate_id` | text        not null | 0001 |
| `actor_id` | text | 0001 |
| `occurred_at` | timestamptz not null | 0001 |
| `version` | integer     not null default 1 | 0001 |
| `payload` | jsonb       not null default '{}'::jsonb | 0001 |
| `processed_at` | timestamptz | 0001 |
| `processing_error` | text | 0001 |
| `created_at` | timestamptz not null default now() | 0001 |
| `attempts` ➕ | integer not null default 0 | 0013 |
| `correlation_id` ➕ | TEXT | 0051 |

### `aura_exchange_rates`

Created in `0031` · 0 index(es) · RLS ✅

| Column | Definition | Migration |
|---|---|---|
| `id` | uuid        primary key default gen_random_uuid() | 0031 |
| `tenant_id` | text        not null | 0031 |
| `from_currency` | text        not null | 0031 |
| `to_currency` | text        not null | 0031 |
| `rate` | numeric(12,6) not null | 0031 |
| `effective_date` | date        not null | 0031 |
| `created_at` | timestamptz not null default now() | 0031 |
| *constraint* | uq_aura_exchange_rates unique (tenant_id, from_currency, to_currency, effective_date) | 0031 |

### `aura_feature_flags`

Created in `0036` · 0 index(es) · RLS ✅

| Column | Definition | Migration |
|---|---|---|
| `flag_key` | text        primary key | 0036 |
| `description` | text | 0036 |
| `enabled_default` | boolean     not null default false | 0036 |
| `rules` | jsonb       not null default '[]'::jsonb, -- e.g. [{"tenantId": "t1", "enabled": true}] | 0036 |
| `updated_at` | timestamptz not null default now() | 0036 |

### `aura_idempotency_keys`

Created in `0033` · 0 index(es) · RLS ✅

| Column | Definition | Migration |
|---|---|---|
| `idempotency_key` | text        not null | 0033 |
| `tenant_id` | text        not null | 0033 |
| `response_status` | integer     not null | 0033 |
| `response_body` | jsonb       not null | 0033 |
| `created_at` | timestamptz not null default now() | 0033 |
| `expires_at` | timestamptz not null | 0033 |
| *constraint* | pk_aura_idempotency_keys primary key (tenant_id, idempotency_key) | 0033 |

### `aura_integration_connectors`

Created in `0037` · 0 index(es) · RLS ✅

| Column | Definition | Migration |
|---|---|---|
| `id` | uuid        primary key default gen_random_uuid() | 0037 |
| `tenant_id` | text        not null | 0037 |
| `system_name` | text        not null, -- 'sap' \| 'procore' \| 'dynamics' \| 'oracle' | 0037 |
| `auth_config` | jsonb       not null default '{}'::jsonb, -- endpoint credentials | 0037 |
| `mapping_rules` | jsonb       not null default '{}'::jsonb, -- event transformation mapping | 0037 |
| `enabled` | boolean     not null default true | 0037 |
| `created_at` | timestamptz not null default now() | 0037 |
| `updated_at` | timestamptz not null default now() | 0037 |

### `aura_notifications`

Created in `0094` · 2 index(es) · RLS ✅

| Column | Definition | Migration |
|---|---|---|
| `id` | uuid        primary key default gen_random_uuid() | 0094 |
| `tenant_id` | text        not null | 0094 |
| `user_id` | text | 0094 |
| `title` | text        not null | 0094 |
| `body` | text        not null | 0094 |
| `category` | text        not null default 'general' | 0094 |
| `ref_type` | text | 0094 |
| `ref_id` | text | 0094 |
| `read` | boolean     not null default false | 0094 |
| `created_at` | timestamptz not null default now() | 0094 |
| `id` | uuid        primary key default gen_random_uuid() | 0114 |
| `tenant_id` | text        not null | 0114 |
| `user_id` | text | 0114 |
| `title` | text        not null | 0114 |
| `body` | text        not null | 0114 |
| `category` | text        not null default 'general' | 0114 |
| `ref_type` | text | 0114 |
| `ref_id` | text | 0114 |
| `read` | boolean     not null default false | 0114 |
| `created_at` | timestamptz not null default now() | 0114 |

### `aura_number_sequences`

Created in `0028` · 0 index(es) · RLS ✅

| Column | Definition | Migration |
|---|---|---|
| `id` | uuid        primary key default gen_random_uuid() | 0028 |
| `tenant_id` | text        not null | 0028 |
| `company_id` | text | 0028 |
| `module` | text        not null | 0028 |
| `entity` | text        not null | 0028 |
| `prefix` | text        not null | 0028 |
| `fiscal_year` | integer | 0028 |
| `current_seq` | bigint      not null default 0 | 0028 |
| `pad_width` | integer     not null default 6 | 0028 |
| `created_at` | timestamptz not null default now() | 0028 |
| *constraint* | uq_aura_number_sequences unique (tenant_id, company_id, module, entity, fiscal_year) | 0028 |

### `aura_projection_status`

Created in `0034` · 0 index(es) · RLS ✅

| Column | Definition | Migration |
|---|---|---|
| `projection_name` | text        primary key | 0034 |
| `version` | integer     not null | 0034 |
| `last_event_id` | text | 0034 |
| `last_occurred_at` | timestamptz | 0034 |
| `rebuilding` | boolean     not null default false | 0034 |
| `updated_at` | timestamptz not null default now() | 0034 |

### `aura_saved_views`

Created in `0115` · 1 index(es) · RLS ✅

| Column | Definition | Migration |
|---|---|---|
| `id` | uuid        primary key default gen_random_uuid() | 0115 |
| `tenant_id` | text        not null | 0115 |
| `user_id` | text | 0115 |
| `label` | text        not null | 0115 |
| `path` | text        not null | 0115 |
| `query` | text        not null default '' | 0115 |
| `created_at` | timestamptz not null default now() | 0115 |

### `aura_snapshots`

Created in `0034` · 0 index(es) · RLS ✅

| Column | Definition | Migration |
|---|---|---|
| `tenant_id` | text        not null | 0034 |
| `aggregate_type` | text        not null | 0034 |
| `aggregate_id` | text        not null | 0034 |
| `version` | integer     not null | 0034 |
| `state` | jsonb       not null | 0034 |
| `created_at` | timestamptz not null default now() | 0034 |
| *constraint* | pk_aura_snapshots primary key (tenant_id, aggregate_type, aggregate_id) | 0034 |

### `aura_working_calendars`

Created in `0030` · 0 index(es) · RLS ✅

| Column | Definition | Migration |
|---|---|---|
| `id` | uuid        primary key default gen_random_uuid() | 0030 |
| `tenant_id` | text        not null | 0030 |
| `company_id` | text | 0030 |
| `name` | text        not null | 0030 |
| `weekends` | integer[]   not null default array[0, 6], -- 0=Sunday, 6=Saturday | 0030 |
| `standard_hours_per_day` | numeric(4,2) not null default 8.00 | 0030 |
| `created_at` | timestamptz not null default now() | 0030 |

## pricing (2 tables)

### `aura_pricing_calibrations`

Created in `0019` · 0 index(es) · RLS —

| Column | Definition | Migration |
|---|---|---|
| `id` | UUID PRIMARY KEY DEFAULT gen_random_uuid() | 0019 |
| `tenant_id` | TEXT NOT NULL | 0019 |
| `item_code` | TEXT NOT NULL | 0019 |
| `description` | TEXT | 0019 |
| `calibrated_price` | NUMERIC(14,4) NOT NULL | 0019 |
| `reality_gap` | NUMERIC(8,4) NOT NULL DEFAULT 0,    -- % gap vs original estimate | 0019 |
| `source_count` | INT NOT NULL DEFAULT 0 | 0019 |
| `avg_trust_score` | NUMERIC(6,4) NOT NULL DEFAULT 1 | 0019 |
| `currency` | TEXT NOT NULL DEFAULT 'AED' | 0019 |
| `calibrated_at` | TIMESTAMPTZ NOT NULL DEFAULT now() | 0019 |
| *unique* | (tenant_id, item_code) | 0019 |

### `aura_pricing_sources`

Created in `0019` · 1 index(es) · RLS —

| Column | Definition | Migration |
|---|---|---|
| `id` | UUID PRIMARY KEY DEFAULT gen_random_uuid() | 0019 |
| `tenant_id` | TEXT NOT NULL | 0019 |
| `item_code` | TEXT NOT NULL | 0019 |
| `description` | TEXT | 0019 |
| `source_type` | TEXT NOT NULL DEFAULT 'po',          -- po \| quote \| subcontract \| manual | 0019 |
| `unit_price` | NUMERIC(14,4) NOT NULL | 0019 |
| `currency` | TEXT NOT NULL DEFAULT 'AED' | 0019 |
| `quantity` | NUMERIC(14,4) NOT NULL DEFAULT 1 | 0019 |
| `supplier_id` | TEXT | 0019 |
| `project_id` | TEXT | 0019 |
| `observed_at` | TIMESTAMPTZ NOT NULL DEFAULT now() | 0019 |
| `created_at` | TIMESTAMPTZ NOT NULL DEFAULT now() | 0019 |

## procurement (6 tables)

### `aura_procurement_framework_agreements`

Created in `0122` · 2 index(es) · RLS ✅

| Column | Definition | Migration |
|---|---|---|
| `id` | uuid primary key | 0122 |
| `tenant_id` | text not null | 0122 |
| `company_id` | text | 0122 |
| `reference` | text | 0122 |
| `title` | text not null | 0122 |
| `supplier_id` | uuid not null | 0122 |
| `supplier_name` | text | 0122 |
| `status` | text not null default 'draft' | 0122 |
| `valid_from` | date not null | 0122 |
| `valid_to` | date not null | 0122 |
| `ceiling_value` | numeric(18,2) not null default 0 | 0122 |
| `called_off_value` | numeric(18,2) not null default 0 | 0122 |
| `items` | jsonb not null default '[]'::jsonb | 0122 |
| `notes` | text | 0122 |
| `created_by` | text | 0122 |
| `created_at` | timestamptz not null default now() | 0122 |

### `aura_procurement_purchase_orders`

Created in `0009` · 4 index(es) · RLS ✅

| Column | Definition | Migration |
|---|---|---|
| `id` | uuid        primary key | 0009 |
| `tenant_id` | text        not null | 0009 |
| `company_id` | text | 0009 |
| `reference` | text | 0009 |
| `title` | text        not null | 0009 |
| `supplier_name` | text | 0009 |
| `project_id` | text | 0009 |
| `project_name` | text | 0009 |
| `status` | text        not null default 'draft' | 0009 |
| `value` | numeric     not null default 0 | 0009 |
| `owner_id` | text | 0009 |
| `created_by` | text | 0009 |
| `created_at` | timestamptz not null default now() | 0009 |
| `supplier_id` ➕ | uuid references public.aura_procurement_suppliers(id) | 0084 |

### `aura_procurement_purchase_requests`

Created in `0015` · 2 index(es) · RLS ✅

| Column | Definition | Migration |
|---|---|---|
| `id` | uuid        primary key | 0015 |
| `tenant_id` | text        not null | 0015 |
| `company_id` | text | 0015 |
| `reference` | text | 0015 |
| `title` | text        not null | 0015 |
| `project_id` | text | 0015 |
| `project_name` | text | 0015 |
| `status` | text        not null default 'draft' | 0015 |
| `value` | numeric     not null default 0 | 0015 |
| `owner_id` | text | 0015 |
| `created_by` | text | 0015 |
| `created_at` | timestamptz not null default now() | 0015 |

### `aura_procurement_rfq_quotes`

Created in `0053` · 1 index(es) · RLS ✅

| Column | Definition | Migration |
|---|---|---|
| `id` | uuid          primary key | 0053 |
| `rfq_id` | uuid          not null references public.aura_procurement_rfqs(id) on delete cascade | 0053 |
| `tenant_id` | text          not null | 0053 |
| `supplier_name` | text          not null | 0053 |
| `amount` | numeric(15,4) not null | 0053 |
| `lead_time_days` | integer | 0053 |
| `notes` | text | 0053 |
| `status` | text          not null default 'received' | 0053 |
| `created_at` | timestamptz   not null default now() | 0053 |

### `aura_procurement_rfqs`

Created in `0053` · 1 index(es) · RLS ✅

| Column | Definition | Migration |
|---|---|---|
| `id` | uuid        primary key | 0053 |
| `tenant_id` | text        not null | 0053 |
| `company_id` | text | 0053 |
| `reference` | text | 0053 |
| `title` | text        not null | 0053 |
| `pr_id` | text | 0053 |
| `pr_title` | text | 0053 |
| `status` | text        not null default 'draft' | 0053 |
| `due_date` | text | 0053 |
| `owner_id` | text | 0053 |
| `created_by` | text | 0053 |
| `created_at` | timestamptz not null default now() | 0053 |

### `aura_procurement_suppliers`

Created in `0062` · 3 index(es) · RLS —

| Column | Definition | Migration |
|---|---|---|
| `id` | uuid PRIMARY KEY DEFAULT gen_random_uuid() | 0062 |
| `tenant_id` | text NOT NULL | 0062 |
| `company_id` | text | 0062 |
| `code` | text NOT NULL | 0062 |
| `name` | text NOT NULL | 0062 |
| `category` | text NOT NULL DEFAULT 'materials' CHECK (category IN ('materials','subcontractor','services','equipment','other')) | 0062 |
| `trade_license` | text | 0062 |
| `trn` | text | 0062 |
| `contact_name` | text | 0062 |
| `email` | text | 0062 |
| `phone` | text | 0062 |
| `status` | text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','suspended')) | 0062 |
| `created_by` | uuid | 0062 |
| `created_at` | timestamptz NOT NULL DEFAULT now() | 0062 |
| *unique* | (tenant_id, code) | 0062 |

## projects (10 tables)

### `aura_projects_cashflow_forecasts`

Created in `0091` · 1 index(es) · RLS ✅

| Column | Definition | Migration |
|---|---|---|
| `id` | uuid        primary key default gen_random_uuid() | 0091 |
| `tenant_id` | text        not null | 0091 |
| `company_id` | text | 0091 |
| `project_id` | uuid        not null | 0091 |
| `project_name` | text | 0091 |
| `periods` | jsonb       not null default '[]'::jsonb | 0091 |
| `notes` | text        not null default '' | 0091 |
| `created_by` | uuid | 0091 |
| `created_at` | timestamptz not null default now() | 0091 |
| `updated_at` | timestamptz not null default now() | 0091 |
| *unique* | (tenant_id, project_id) | 0091 |

### `aura_projects_cbs_nodes`

Created in `0047` · 0 index(es) · RLS ✅

| Column | Definition | Migration |
|---|---|---|
| `id` | uuid PRIMARY KEY DEFAULT gen_random_uuid() | 0047 |
| `tenant_id` | text NOT NULL | 0047 |
| `project_id` | uuid NOT NULL REFERENCES public.aura_projects_projects(id) | 0047 |
| `parent_id` | uuid REFERENCES public.aura_projects_cbs_nodes(id) | 0047 |
| `code` | text NOT NULL,                    -- e.g. "01", "01.01", "01.01.03" | 0047 |
| `title` | text NOT NULL,                   -- e.g. "Materials", "Steel Reinforcement" | 0047 |
| `category` | text NOT NULL DEFAULT 'direct', -- 'direct' \| 'indirect' \| 'overhead' \| 'contingency' | 0047 |
| `budget_amount` | numeric NOT NULL DEFAULT 0 | 0047 |
| `committed_amount` | numeric NOT NULL DEFAULT 0,  -- sum of PO/subcontract values | 0047 |
| `actual_amount` | numeric NOT NULL DEFAULT 0,     -- sum of approved invoices/payments | 0047 |
| `forecast_amount` | numeric NOT NULL DEFAULT 0,   -- projected final cost (EAC) | 0047 |
| `variance` | numeric GENERATED ALWAYS AS (budget_amount - forecast_amount) STORED | 0047 |
| `currency` | text NOT NULL DEFAULT 'AED' | 0047 |
| `notes` | text | 0047 |
| `created_at` | timestamptz NOT NULL DEFAULT now() | 0047 |

### `aura_projects_closeouts`

Created in `0087` · 1 index(es) · RLS ✅

| Column | Definition | Migration |
|---|---|---|
| `id` | uuid        primary key default gen_random_uuid() | 0087 |
| `tenant_id` | text        not null | 0087 |
| `company_id` | text | 0087 |
| `project_id` | uuid        not null | 0087 |
| `project_name` | text | 0087 |
| `status` | text        not null default 'in_progress' check (status in ('in_progress','completed')) | 0087 |
| `items` | jsonb       not null default '[]'::jsonb | 0087 |
| `handover_date` | date | 0087 |
| `dlp_end_date` | date | 0087 |
| `notes` | text        not null default '' | 0087 |
| `created_by` | uuid | 0087 |
| `created_at` | timestamptz not null default now() | 0087 |
| `updated_at` | timestamptz not null default now() | 0087 |
| *unique* | (tenant_id, project_id) | 0087 |

### `aura_projects_delay_events`

Created in `0047` · 0 index(es) · RLS ✅

| Column | Definition | Migration |
|---|---|---|
| `id` | uuid PRIMARY KEY DEFAULT gen_random_uuid() | 0047 |
| `tenant_id` | text NOT NULL | 0047 |
| `project_id` | uuid NOT NULL REFERENCES public.aura_projects_projects(id) | 0047 |
| `title` | text NOT NULL | 0047 |
| `cause_category` | text NOT NULL DEFAULT 'employer',  -- 'employer' \| 'contractor' \| 'neutral' \| 'force_majeure' | 0047 |
| `start_date` | date NOT NULL | 0047 |
| `end_date` | date | 0047 |
| `delay_days` | integer NOT NULL DEFAULT 0 | 0047 |
| `is_concurrent` | boolean NOT NULL DEFAULT false | 0047 |
| `linked_activity_code` | text,             -- WBS code reference | 0047 |
| `description` | text | 0047 |
| `status` | text NOT NULL DEFAULT 'identified',  -- 'identified' \| 'analysed' \| 'submitted' \| 'approved' \| 'rejected' | 0047 |
| `created_at` | timestamptz NOT NULL DEFAULT now() | 0047 |

### `aura_projects_eot_claims`

Created in `0047` · 0 index(es) · RLS ✅

| Column | Definition | Migration |
|---|---|---|
| `id` | uuid PRIMARY KEY DEFAULT gen_random_uuid() | 0047 |
| `tenant_id` | text NOT NULL | 0047 |
| `project_id` | uuid NOT NULL REFERENCES public.aura_projects_projects(id) | 0047 |
| `claim_number` | integer NOT NULL | 0047 |
| `title` | text NOT NULL | 0047 |
| `submitted_days` | integer NOT NULL,        -- days claimed | 0047 |
| `approved_days` | integer DEFAULT 0,        -- days approved by employer | 0047 |
| `status` | text NOT NULL DEFAULT 'draft',   -- 'draft' \| 'submitted' \| 'under_review' \| 'approved' \| 'partially_approved' \| 'rejected' | 0047 |
| `justification` | text | 0047 |
| `original_completion_date` | date | 0047 |
| `revised_completion_date` | date | 0047 |
| `submitted_at` | timestamptz | 0047 |
| `decided_at` | timestamptz | 0047 |
| `decided_by` | text | 0047 |
| `created_at` | timestamptz NOT NULL DEFAULT now() | 0047 |

### `aura_projects_eot_delay_links`

Created in `0047` · 0 index(es) · RLS —

| Column | Definition | Migration |
|---|---|---|
| `eot_claim_id` | uuid NOT NULL REFERENCES public.aura_projects_eot_claims(id) | 0047 |
| `delay_event_id` | uuid NOT NULL REFERENCES public.aura_projects_delay_events(id) | 0047 |
| *primary* | KEY (eot_claim_id, delay_event_id) | 0047 |

### `aura_projects_projects`

Created in `0008` · 4 index(es) · RLS ✅

| Column | Definition | Migration |
|---|---|---|
| `id` | uuid        primary key | 0008 |
| `tenant_id` | text        not null | 0008 |
| `company_id` | text | 0008 |
| `title` | text        not null | 0008 |
| `reference` | text | 0008 |
| `contract_id` | text | 0008 |
| `contract_title` | text | 0008 |
| `account_id` | text | 0008 |
| `account_name` | text | 0008 |
| `status` | text        not null default 'planned' | 0008 |
| `value` | numeric     not null default 0 | 0008 |
| `owner_id` | text | 0008 |
| `created_by` | text | 0008 |
| `created_at` | timestamptz not null default now() | 0008 |
| `branch_id` ➕ | text | 0049 |

### `aura_projects_schedules`

Created in `0092` · 1 index(es) · RLS ✅

| Column | Definition | Migration |
|---|---|---|
| `id` | uuid        primary key default gen_random_uuid() | 0092 |
| `tenant_id` | text        not null | 0092 |
| `company_id` | text | 0092 |
| `project_id` | uuid        not null | 0092 |
| `project_name` | text | 0092 |
| `tasks` | jsonb       not null default '[]'::jsonb | 0092 |
| `baseline_set_at` | timestamptz | 0092 |
| `created_by` | uuid | 0092 |
| `created_at` | timestamptz not null default now() | 0092 |
| `updated_at` | timestamptz not null default now() | 0092 |
| *unique* | (tenant_id, project_id) | 0092 |

### `aura_projects_variations`

Created in `0079` · 1 index(es) · RLS ✅

| Column | Definition | Migration |
|---|---|---|
| `id` | uuid          primary key | 0079 |
| `tenant_id` | text          not null | 0079 |
| `company_id` | text | 0079 |
| `project_id` | text          not null | 0079 |
| `project_title` | text | 0079 |
| `reference` | text | 0079 |
| `title` | text          not null | 0079 |
| `description` | text | 0079 |
| `type` | text          not null,             -- 'addition' \| 'omission' | 0079 |
| `amount` | numeric(15,2) not null,             -- positive magnitude | 0079 |
| `signed_amount` | numeric(15,2) not null,             -- +amount / −amount | 0079 |
| `status` | text          not null default 'draft', -- draft\|submitted\|approved\|rejected | 0079 |
| `created_by` | text | 0079 |
| `decided_by` | text | 0079 |
| `decided_at` | timestamptz | 0079 |
| `created_at` | timestamptz   not null default now() | 0079 |

### `aura_projects_wbs_nodes`

Created in `0016` · 2 index(es) · RLS ✅

| Column | Definition | Migration |
|---|---|---|
| `id` | uuid        primary key | 0016 |
| `tenant_id` | text        not null | 0016 |
| `project_id` | uuid        not null | 0016 |
| `parent_id` | uuid | 0016 |
| `code` | text        not null | 0016 |
| `title` | text        not null | 0016 |
| `planned_value` | numeric     not null default 0 | 0016 |
| `earned_value` | numeric     not null default 0 | 0016 |
| `actual_cost` | numeric     not null default 0 | 0016 |
| `progress` | numeric     not null default 0 | 0016 |
| `status` | text        not null default 'pending' | 0016 |
| `created_at` | timestamptz not null default now() | 0016 |

## quality (7 tables)

### `aura_quality_audit_schedules`

Created in `0108` · 1 index(es) · RLS ✅

| Column | Definition | Migration |
|---|---|---|
| `id` | uuid        primary key | 0108 |
| `tenant_id` | text        not null | 0108 |
| `company_id` | text | 0108 |
| `project_id` | uuid        not null | 0108 |
| `project_name` | text | 0108 |
| `audit_number` | text        not null | 0108 |
| `audit_type` | text        not null | 0108 |
| `scheduled_date` | date        not null | 0108 |
| `auditor_name` | text        not null | 0108 |
| `status` | text        not null default 'scheduled', -- scheduled \| in_progress \| completed \| cancelled | 0108 |
| `checklist` | jsonb       not null default '[]'::jsonb | 0108 |
| `created_at` | timestamptz not null default now() | 0108 |
| `updated_at` | timestamptz not null default now() | 0108 |

### `aura_quality_calibrations`

Created in `0099` · 3 index(es) · RLS ✅

| Column | Definition | Migration |
|---|---|---|
| `id` | uuid primary key | 0099 |
| `tenant_id` | text not null | 0099 |
| `company_id` | text | 0099 |
| `project_id` | text | 0099 |
| `project_name` | text | 0099 |
| `equipment_name` | text not null | 0099 |
| `equipment_serial` | text not null | 0099 |
| `instrument_type` | text | 0099 |
| `calibration_date` | date not null | 0099 |
| `due_date` | date not null | 0099 |
| `certificate_number` | text | 0099 |
| `calibrated_by` | text | 0099 |
| `status` | text not null default 'valid' | 0099 |
| `notes` | text | 0099 |
| `created_by` | text | 0099 |
| `created_at` | timestamptz not null default now() | 0099 |
| `updated_at` | timestamptz not null default now() | 0099 |

### `aura_quality_irs`

Created in `0024` · 1 index(es) · RLS ✅

| Column | Definition | Migration |
|---|---|---|
| `id` | uuid        primary key | 0024 |
| `tenant_id` | text        not null | 0024 |
| `company_id` | text | 0024 |
| `project_id` | uuid        not null | 0024 |
| `project_name` | text | 0024 |
| `ir_number` | text        not null | 0024 |
| `discipline` | text        not null, -- civil \| mechanical \| electrical \| plumbing | 0024 |
| `location_detail` | text        not null | 0024 |
| `inspection_date` | date        not null | 0024 |
| `status` | text        not null default 'requested', -- requested \| approved \| rejected | 0024 |
| `inspected_by` | text | 0024 |
| `comments` | text | 0024 |
| `created_at` | timestamptz not null default now() | 0024 |
| `updated_at` | timestamptz not null default now() | 0024 |

### `aura_quality_itps`

Created in `0068` · 3 index(es) · RLS —

| Column | Definition | Migration |
|---|---|---|
| `id` | uuid PRIMARY KEY DEFAULT gen_random_uuid() | 0068 |
| `tenant_id` | text NOT NULL | 0068 |
| `company_id` | text | 0068 |
| `project_id` | uuid NOT NULL | 0068 |
| `project_name` | text | 0068 |
| `reference` | text NOT NULL | 0068 |
| `title` | text NOT NULL | 0068 |
| `discipline` | text NOT NULL DEFAULT 'general' | 0068 |
| `status` | text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','closed')) | 0068 |
| `points` | jsonb NOT NULL DEFAULT '[]'::jsonb | 0068 |
| `created_by` | uuid | 0068 |
| `created_at` | timestamptz NOT NULL DEFAULT now() | 0068 |
| `updated_at` | timestamptz NOT NULL DEFAULT now() | 0068 |

### `aura_quality_material_approvals`

Created in `0076` · 3 index(es) · RLS ✅

| Column | Definition | Migration |
|---|---|---|
| `id` | uuid PRIMARY KEY DEFAULT gen_random_uuid() | 0076 |
| `tenant_id` | text NOT NULL | 0076 |
| `company_id` | text | 0076 |
| `project_id` | uuid NOT NULL | 0076 |
| `project_name` | text | 0076 |
| `reference` | text NOT NULL | 0076 |
| `material_name` | text NOT NULL | 0076 |
| `manufacturer` | text NOT NULL DEFAULT '' | 0076 |
| `supplier` | text NOT NULL DEFAULT '' | 0076 |
| `specification` | text NOT NULL DEFAULT '' | 0076 |
| `discipline` | text NOT NULL DEFAULT 'general' | 0076 |
| `status` | text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','submitted','approved','approved_as_noted','rejected')) | 0076 |
| `revision` | integer NOT NULL DEFAULT 0 | 0076 |
| `review_comments` | text NOT NULL DEFAULT '' | 0076 |
| `reviewed_by` | uuid | 0076 |
| `reviewed_at` | timestamptz | 0076 |
| `created_by` | uuid | 0076 |
| `created_at` | timestamptz NOT NULL DEFAULT now() | 0076 |
| `updated_at` | timestamptz NOT NULL DEFAULT now() | 0076 |

### `aura_quality_ncrs`

Created in `0024` · 1 index(es) · RLS ✅

| Column | Definition | Migration |
|---|---|---|
| `id` | uuid        primary key | 0024 |
| `tenant_id` | text        not null | 0024 |
| `company_id` | text | 0024 |
| `project_id` | uuid        not null | 0024 |
| `project_name` | text | 0024 |
| `ncr_number` | text        not null | 0024 |
| `description` | text        not null | 0024 |
| `root_cause` | text | 0024 |
| `proposed_correction` | text | 0024 |
| `severity` | text        not null, -- minor \| major | 0024 |
| `status` | text        not null default 'raised', -- raised \| corrected \| closed | 0024 |
| `raised_by` | text | 0024 |
| `assigned_to` | text | 0024 |
| `created_at` | timestamptz not null default now() | 0024 |
| `updated_at` | timestamptz not null default now() | 0024 |

### `aura_quality_snags`

Created in `0024` · 1 index(es) · RLS ✅

| Column | Definition | Migration |
|---|---|---|
| `id` | uuid        primary key | 0024 |
| `tenant_id` | text        not null | 0024 |
| `company_id` | text | 0024 |
| `project_id` | uuid        not null | 0024 |
| `project_name` | text | 0024 |
| `description` | text        not null | 0024 |
| `location_detail` | text        not null | 0024 |
| `severity` | text        not null, -- low \| medium \| high | 0024 |
| `status` | text        not null default 'open', -- open \| resolved \| closed | 0024 |
| `assigned_to` | text | 0024 |
| `resolved_at` | timestamptz | 0024 |
| `created_by` | text | 0024 |
| `created_at` | timestamptz not null default now() | 0024 |
| `updated_at` | timestamptz not null default now() | 0024 |

## site (5 tables)

### `aura_site_daily_reports`

Created in `0022` · 1 index(es) · RLS ✅

| Column | Definition | Migration |
|---|---|---|
| `id` | uuid        primary key | 0022 |
| `tenant_id` | text        not null | 0022 |
| `company_id` | text | 0022 |
| `project_id` | uuid        not null | 0022 |
| `project_name` | text | 0022 |
| `date` | date        not null | 0022 |
| `work_description` | text        not null | 0022 |
| `manpower_count` | integer     not null default 0 | 0022 |
| `equipment_count` | integer     not null default 0 | 0022 |
| `status` | text        not null default 'draft', -- draft \| submitted | 0022 |
| `created_by` | text | 0022 |
| `created_at` | timestamptz not null default now() | 0022 |
| `updated_at` | timestamptz not null default now() | 0022 |
| *unique* | (tenant_id, project_id, date) | 0022 |

### `aura_site_delay_logs`

Created in `0022` · 1 index(es) · RLS ✅

| Column | Definition | Migration |
|---|---|---|
| `id` | uuid        primary key | 0022 |
| `tenant_id` | text        not null | 0022 |
| `company_id` | text | 0022 |
| `project_id` | uuid        not null | 0022 |
| `project_name` | text | 0022 |
| `date` | date        not null | 0022 |
| `delay_type` | text        not null, -- weather \| material \| access \| drawings \| other | 0022 |
| `description` | text        not null | 0022 |
| `impact_hours` | numeric     not null default 0 | 0022 |
| `status` | text        not null default 'logged', -- logged \| resolved | 0022 |
| `resolved_at` | timestamptz | 0022 |
| `created_by` | text | 0022 |
| `created_at` | timestamptz not null default now() | 0022 |
| `updated_at` | timestamptz not null default now() | 0022 |

### `aura_site_instructions`

Created in `0066` · 3 index(es) · RLS —

| Column | Definition | Migration |
|---|---|---|
| `id` | uuid PRIMARY KEY DEFAULT gen_random_uuid() | 0066 |
| `tenant_id` | text NOT NULL | 0066 |
| `company_id` | text | 0066 |
| `project_id` | uuid NOT NULL | 0066 |
| `project_name` | text | 0066 |
| `reference` | text NOT NULL | 0066 |
| `issued_by` | text NOT NULL | 0066 |
| `date` | date NOT NULL | 0066 |
| `instruction` | text NOT NULL | 0066 |
| `cost_implication` | boolean NOT NULL DEFAULT false | 0066 |
| `time_implication` | boolean NOT NULL DEFAULT false | 0066 |
| `status` | text NOT NULL DEFAULT 'open' CHECK (status IN ('open','acknowledged','closed')) | 0066 |
| `acknowledged_at` | timestamptz | 0066 |
| `closed_at` | timestamptz | 0066 |
| `created_by` | uuid | 0066 |
| `created_at` | timestamptz NOT NULL DEFAULT now() | 0066 |
| `updated_at` | timestamptz NOT NULL DEFAULT now() | 0066 |

### `aura_site_labour_allocations`

Created in `0102` · 2 index(es) · RLS ✅

| Column | Definition | Migration |
|---|---|---|
| `id` | uuid primary key | 0102 |
| `tenant_id` | text not null | 0102 |
| `company_id` | text | 0102 |
| `project_id` | text not null | 0102 |
| `project_name` | text | 0102 |
| `date` | date not null | 0102 |
| `trade` | text not null | 0102 |
| `headcount` | numeric(10,2) not null default 0 | 0102 |
| `hours` | numeric(10,2) not null default 0 | 0102 |
| `man_hours` | numeric(12,2) not null default 0 | 0102 |
| `subcontractor_name` | text | 0102 |
| `notes` | text | 0102 |
| `created_by` | text | 0102 |
| `created_at` | timestamptz not null default now() | 0102 |
| `updated_at` | timestamptz not null default now() | 0102 |

### `aura_site_material_consumption`

Created in `0022` · 1 index(es) · RLS ✅

| Column | Definition | Migration |
|---|---|---|
| `id` | uuid        primary key | 0022 |
| `tenant_id` | text        not null | 0022 |
| `company_id` | text | 0022 |
| `project_id` | uuid        not null | 0022 |
| `project_name` | text | 0022 |
| `date` | date        not null | 0022 |
| `item_id` | text        not null | 0022 |
| `item_name` | text        not null | 0022 |
| `quantity_consumed` | numeric     not null default 0 | 0022 |
| `unit` | text        not null | 0022 |
| `created_by` | text | 0022 |
| `created_at` | timestamptz not null default now() | 0022 |
| `updated_at` | timestamptz not null default now() | 0022 |

## subcontracts (4 tables)

### `aura_subcontracts`

Created in `0017` · 2 index(es) · RLS ✅

| Column | Definition | Migration |
|---|---|---|
| `id` | uuid        primary key | 0017 |
| `tenant_id` | text        not null | 0017 |
| `project_id` | uuid        not null | 0017 |
| `project_name` | text | 0017 |
| `title` | text        not null | 0017 |
| `subcontractor_name` | text        not null | 0017 |
| `status` | text        not null default 'draft' | 0017 |
| `value` | numeric     not null default 0 | 0017 |
| `retention_percentage` | numeric     not null default 10 | 0017 |
| `created_at` | timestamptz not null default now() | 0017 |

### `aura_subcontracts_back_charges`

Created in `0071` · 2 index(es) · RLS ✅

| Column | Definition | Migration |
|---|---|---|
| `id` | uuid          primary key | 0071 |
| `tenant_id` | text          not null | 0071 |
| `subcontract_id` | uuid          not null | 0071 |
| `subcontractor_name` | text | 0071 |
| `reference` | text          not null,                  -- e.g. BC-001 | 0071 |
| `category` | text          not null default 'other',  -- materials\|plant\|labour\|rectification\|attendance\|other | 0071 |
| `description` | text          not null | 0071 |
| `gross_amount` | numeric(18,2) not null default 0,        -- raw cost incurred | 0071 |
| `markup_percent` | numeric(6,3)  not null default 0,        -- admin handling fee % | 0071 |
| `markup_amount` | numeric(18,2) not null default 0 | 0071 |
| `recoverable_amount` | numeric(18,2) not null default 0,        -- gross + markup | 0071 |
| `recovered_amount` | numeric(18,2) not null default 0,        -- deducted from claims to date | 0071 |
| `outstanding_amount` | numeric(18,2) not null default 0 | 0071 |
| `status` | text          not null default 'raised', -- raised\|agreed\|disputed\|recovered\|written_off | 0071 |
| `raised_at` | timestamptz   not null default now() | 0071 |
| `agreed_at` | timestamptz | 0071 |
| `created_at` | timestamptz   not null default now() | 0071 |
| `updated_at` | timestamptz   not null default now() | 0071 |

### `aura_subcontracts_claims`

Created in `0017` · 2 index(es) · RLS ✅

| Column | Definition | Migration |
|---|---|---|
| `id` | uuid        primary key | 0017 |
| `tenant_id` | text        not null | 0017 |
| `subcontract_id` | uuid        not null | 0017 |
| `claim_number` | integer     not null | 0017 |
| `status` | text        not null default 'draft' | 0017 |
| `work_completed_value` | numeric     not null default 0 | 0017 |
| `previously_certified_value` | numeric     not null default 0 | 0017 |
| `this_period_gross_value` | numeric     not null default 0 | 0017 |
| `retention_withheld` | numeric     not null default 0 | 0017 |
| `net_certified_value` | numeric     not null default 0 | 0017 |
| `certified_at` | timestamptz | 0017 |
| `certified_by` | text | 0017 |
| `created_at` | timestamptz not null default now() | 0017 |
| `is_retention_release` ➕ | boolean not null default false,
  add column if not exists retention_released numeric not null default 0 | 0045 |

### `aura_subcontracts_variations`

Created in `0069` · 3 index(es) · RLS —

| Column | Definition | Migration |
|---|---|---|
| `id` | uuid PRIMARY KEY DEFAULT gen_random_uuid() | 0069 |
| `tenant_id` | text NOT NULL | 0069 |
| `subcontract_id` | uuid NOT NULL REFERENCES public.aura_subcontracts(id) | 0069 |
| `reference` | text NOT NULL | 0069 |
| `type` | text NOT NULL CHECK (type IN ('addition','omission')) | 0069 |
| `amount` | numeric(16,2) NOT NULL CHECK (amount > 0) | 0069 |
| `description` | text NOT NULL DEFAULT '' | 0069 |
| `status` | text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')) | 0069 |
| `approved_by` | uuid | 0069 |
| `created_at` | timestamptz NOT NULL DEFAULT now() | 0069 |

## tendering (6 tables)

### `aura_tendering_bid_scores`

Created in `0101` · 2 index(es) · RLS ✅

| Column | Definition | Migration |
|---|---|---|
| `id` | uuid primary key | 0101 |
| `tenant_id` | text not null | 0101 |
| `company_id` | text | 0101 |
| `tender_id` | text not null | 0101 |
| `tender_title` | text | 0101 |
| `criteria` | jsonb not null default '[]'::jsonb | 0101 |
| `total_score` | numeric(6,2) not null default 0 | 0101 |
| `recommendation` | text not null default 'no_go' | 0101 |
| `notes` | text | 0101 |
| `decided_by` | text | 0101 |
| `created_by` | text | 0101 |
| `created_at` | timestamptz not null default now() | 0101 |

### `aura_tendering_boq_items`

Created in `0042` · 2 index(es) · RLS ✅

| Column | Definition | Migration |
|---|---|---|
| `id` | UUID        PRIMARY KEY DEFAULT gen_random_uuid() | 0042 |
| `tenant_id` | TEXT        NOT NULL | 0042 |
| `company_id` | TEXT | 0042 |
| `boq_id` | UUID        NOT NULL REFERENCES public.aura_tendering_boqs(id) ON DELETE CASCADE | 0042 |
| `item_code` | TEXT        NOT NULL, -- hierarchy like 1.1, 1.1.1 | 0042 |
| `description` | TEXT        NOT NULL | 0042 |
| `unit` | TEXT        NOT NULL, -- m3, ton, sqm, etc. | 0042 |
| `quantity` | NUMERIC     NOT NULL DEFAULT 0 | 0042 |
| `rate` | NUMERIC     NOT NULL DEFAULT 0 | 0042 |
| `total_amount` | NUMERIC     NOT NULL DEFAULT 0 | 0042 |
| `ifc_guid` | TEXT,                 -- BIM IFC GUID mapping link | 0042 |
| `created_at` | TIMESTAMPTZ NOT NULL DEFAULT now() | 0042 |
| `updated_at` | TIMESTAMPTZ NOT NULL DEFAULT now() | 0042 |

### `aura_tendering_boqs`

Created in `0042` · 2 index(es) · RLS ✅

| Column | Definition | Migration |
|---|---|---|
| `id` | UUID        PRIMARY KEY DEFAULT gen_random_uuid() | 0042 |
| `tenant_id` | TEXT        NOT NULL | 0042 |
| `company_id` | TEXT | 0042 |
| `tender_id` | UUID        NOT NULL REFERENCES public.aura_tendering_tenders(id) ON DELETE CASCADE | 0042 |
| `created_at` | TIMESTAMPTZ NOT NULL DEFAULT now() | 0042 |
| `updated_at` | TIMESTAMPTZ NOT NULL DEFAULT now() | 0042 |
| *constraint* | uq_boq_tender UNIQUE (tender_id) | 0042 |

### `aura_tendering_outcomes`

Created in `0126` · 2 index(es) · RLS ✅

| Column | Definition | Migration |
|---|---|---|
| `id` | uuid primary key | 0126 |
| `tenant_id` | text not null | 0126 |
| `company_id` | text | 0126 |
| `tender_id` | text not null | 0126 |
| `tender_title` | text | 0126 |
| `result` | text not null check (result in ('won', 'lost')) | 0126 |
| `our_bid_value` | numeric(18,2) not null default 0 | 0126 |
| `competitors` | jsonb not null default '[]'::jsonb | 0126 |
| `winner_name` | text | 0126 |
| `reason` | text | 0126 |
| `decided_at` | timestamptz not null | 0126 |
| `created_by` | text | 0126 |
| `created_at` | timestamptz not null default now() | 0126 |

### `aura_tendering_rate_buildups`

Created in `0121` · 3 index(es) · RLS ✅

| Column | Definition | Migration |
|---|---|---|
| `id` | uuid primary key | 0121 |
| `tenant_id` | text not null | 0121 |
| `company_id` | text | 0121 |
| `tender_id` | uuid not null | 0121 |
| `boq_item_id` | uuid not null | 0121 |
| `components` | jsonb not null default '[]'::jsonb | 0121 |
| `direct_cost` | numeric(18,2) not null default 0 | 0121 |
| `overhead_percent` | numeric(6,2) not null default 0 | 0121 |
| `profit_percent` | numeric(6,2) not null default 0 | 0121 |
| `overhead_amount` | numeric(18,2) not null default 0 | 0121 |
| `profit_amount` | numeric(18,2) not null default 0 | 0121 |
| `selling_rate` | numeric(18,2) not null default 0 | 0121 |
| `notes` | text | 0121 |
| `created_by` | text | 0121 |
| `created_at` | timestamptz not null default now() | 0121 |

### `aura_tendering_tenders`

Created in `0006` · 3 index(es) · RLS ✅

| Column | Definition | Migration |
|---|---|---|
| `id` | uuid        primary key | 0006 |
| `tenant_id` | text        not null | 0006 |
| `company_id` | text | 0006 |
| `title` | text        not null | 0006 |
| `reference` | text | 0006 |
| `account_id` | text | 0006 |
| `account_name` | text | 0006 |
| `status` | text        not null default 'draft' | 0006 |
| `value` | numeric     not null default 0 | 0006 |
| `owner_id` | text | 0006 |
| `created_by` | text | 0006 |
| `created_at` | timestamptz not null default now() | 0006 |

## vector (1 tables)

### `aura_vector_store`

Created in `0019` · 1 index(es) · RLS —

| Column | Definition | Migration |
|---|---|---|
| `id` | UUID PRIMARY KEY DEFAULT gen_random_uuid() | 0019 |
| `tenant_id` | TEXT NOT NULL | 0019 |
| `content` | TEXT NOT NULL | 0019 |
| `metadata` | JSONB NOT NULL DEFAULT '{}'::jsonb | 0019 |
| `embedding` | vector(1536) | 0019 |
| `created_at` | TIMESTAMPTZ NOT NULL DEFAULT now() | 0019 |

## webhook (2 tables)

### `aura_webhook_deliveries`

Created in `0004` · 2 index(es) · RLS ✅

| Column | Definition | Migration |
|---|---|---|
| `id` | uuid        primary key | 0004 |
| `subscription_id` | uuid        not null references public.aura_webhook_subscriptions (id) on delete cascade | 0004 |
| `event_id` | uuid        not null | 0004 |
| `event_type` | text        not null | 0004 |
| `url` | text        not null | 0004 |
| `status` | text        not null | 0004 |
| `status_code` | integer | 0004 |
| `error` | text | 0004 |
| `attempted_at` | timestamptz not null default now() | 0004 |
| `attempts` ➕ | integer not null default 1 | 0012 |
| `next_attempt_at` ➕ | timestamptz | 0012 |
| `body` ➕ | text | 0012 |

### `aura_webhook_subscriptions`

Created in `0004` · 1 index(es) · RLS ✅

| Column | Definition | Migration |
|---|---|---|
| `id` | uuid        primary key | 0004 |
| `tenant_id` | text        not null | 0004 |
| `event_types` | jsonb       not null default '[]'::jsonb | 0004 |
| `url` | text        not null | 0004 |
| `secret` | text        not null | 0004 |
| `active` | boolean     not null default true | 0004 |
| `created_at` | timestamptz not null default now() | 0004 |

## workflow (2 tables)

### `aura_workflow_definitions`

Created in `0003` · 0 index(es) · RLS ✅

| Column | Definition | Migration |
|---|---|---|
| `id` | uuid        primary key | 0003 |
| `key` | text        not null | 0003 |
| `tenant_id` | text        not null default '',   -- '' = global (all tenants) | 0003 |
| `name` | text        not null | 0003 |
| `initial_state` | text        not null | 0003 |
| `states` | jsonb       not null default '[]'::jsonb | 0003 |
| `terminal_states` | jsonb       not null default '[]'::jsonb | 0003 |
| `transitions` | jsonb       not null default '[]'::jsonb | 0003 |
| `version` | integer     not null default 1 | 0003 |
| `created_at` | timestamptz not null default now() | 0003 |
| *unique* | (key, tenant_id) | 0003 |
| `id` | uuid        primary key default gen_random_uuid() | 0039 |
| `tenant_id` | text        not null | 0039 |
| `workflow_key` | text        not null | 0039 |
| `label` | text        not null | 0039 |
| `nodes` | jsonb       not null default '[]'::jsonb | 0039 |
| `version` | integer     not null default 1 | 0039 |
| `created_at` | timestamptz not null default now() | 0039 |
| *unique* | (tenant_id, workflow_key, version) | 0039 |

### `aura_workflow_instances`

Created in `0003` · 4 index(es) · RLS ✅

| Column | Definition | Migration |
|---|---|---|
| `id` | uuid        primary key | 0003 |
| `definition_key` | text        not null | 0003 |
| `tenant_id` | text        not null | 0003 |
| `company_id` | text | 0003 |
| `aggregate_type` | text        not null | 0003 |
| `aggregate_id` | text        not null | 0003 |
| `current_state` | text        not null | 0003 |
| `status` | text        not null default 'open' | 0003 |
| `history` | jsonb       not null default '[]'::jsonb | 0003 |
| `created_by` | text | 0003 |
| `created_at` | timestamptz not null default now() | 0003 |
| `updated_at` | timestamptz not null default now() | 0003 |
| `id` | uuid        primary key default gen_random_uuid() | 0039 |
| `tenant_id` | text        not null | 0039 |
| `workflow_key` | text        not null | 0039 |
| `entity_id` | text        not null | 0039 |
| `entity_type` | text        not null | 0039 |
| `current_node_id` | text        not null | 0039 |
| `status` | text        not null default 'running', -- 'running'\|'completed'\|'failed' | 0039 |
| `context` | jsonb       not null default '{}'::jsonb | 0039 |
| `history` | jsonb       not null default '[]'::jsonb, -- [{nodeId, completedAt, actor}] | 0039 |
| `created_at` | timestamptz not null default now() | 0039 |
| `updated_at` | timestamptz not null default now() | 0039 |

-- 0218: FORCE row-level security on six tenant-scoped AI-platform / collaboration / marketplace
-- tables (P0-2, RLS fail-closed). These were created in 0193/0195 with ENABLE RLS + a tenant
-- policy, and those migration files were later amended to add FORCE — but long-lived databases
-- that had already applied 0193/0195 never received the FORCE statements (an applied migration is
-- never re-run). Result: on those databases the table OWNER still bypasses the policy, which the
-- rls-fitness gate flags as "not FORCED". This forward migration closes that drift idempotently.
-- ENABLE and the tenant policy already exist on every target, so we only add FORCE here.

alter table public.aura_agent_traces              force row level security;
alter table public.aura_ai_credit_ledger          force row level security;
alter table public.aura_collaboration_messages    force row level security;
alter table public.aura_marketplace_installations force row level security;
alter table public.aura_skill_packages            force row level security;
alter table public.aura_tenant_ai_credits         force row level security;
alter table public.aura_agent_evaluations         force row level security;
alter table public.aura_agent_executions          force row level security;
alter table public.aura_agent_feedback            force row level security;

-- @DOWN
-- Reverse only the FORCE added here; ENABLE + policy predate this migration and are left intact.
alter table public.aura_agent_traces              no force row level security;
alter table public.aura_ai_credit_ledger          no force row level security;
alter table public.aura_collaboration_messages    no force row level security;
alter table public.aura_marketplace_installations no force row level security;
alter table public.aura_skill_packages            no force row level security;
alter table public.aura_tenant_ai_credits         no force row level security;
alter table public.aura_agent_evaluations         no force row level security;
alter table public.aura_agent_executions          no force row level security;
alter table public.aura_agent_feedback            no force row level security;

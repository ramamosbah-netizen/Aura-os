-- ============================================================
-- AURA OS — migration 0264: one commercial baseline per approved quotation
-- ------------------------------------------------------------
-- Approval may be retried concurrently. The application checks for an existing baseline, but the
-- database must enforce the invariant as the final arbiter so two approvers cannot create two
-- immutable commercial snapshots for one quotation.
-- ============================================================

do $$ begin
  if exists (
    select 1
    from public.aura_crm_commercial_baselines
    group by tenant_id, quotation_id
    having count(*) > 1
  ) then
    raise exception 'cannot add baseline uniqueness: duplicate tenant/quotation baselines exist';
  end if;
end $$;

create unique index if not exists uq_crm_commercial_baselines_quotation
  on public.aura_crm_commercial_baselines (tenant_id, quotation_id);

-- @DOWN
drop index if exists public.uq_crm_commercial_baselines_quotation;

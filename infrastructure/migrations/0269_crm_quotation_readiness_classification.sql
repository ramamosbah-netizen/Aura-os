-- AURA OS — migration 0269: close the explicit quotation readiness classification
--
-- 0267 introduced the marker and trigger, but the development database had already applied that
-- version before the backfill/NOT NULL hardening was added. This corrective migration is deliberately
-- additive and idempotent: classify existing rows once, make omission governed, and keep the legacy
-- compatibility path explicit. It creates no new table or service.

-- Existing quotations pre-date the governance rollout and are the only compatibility class.
update public.aura_crm_quotations
set approval_readiness_mode = 'legacy'
where approval_readiness_mode is null;

create or replace function public.crm_quotation_default_readiness_mode()
returns trigger language plpgsql as $$
begin
  if new.approval_readiness_mode is null then
    new.approval_readiness_mode := 'governed';
  end if;
  return new;
end;
$$;

drop trigger if exists crm_quotation_default_readiness_mode on public.aura_crm_quotations;
create trigger crm_quotation_default_readiness_mode
before insert on public.aura_crm_quotations
for each row execute function public.crm_quotation_default_readiness_mode();

alter table public.aura_crm_quotations
  alter column approval_readiness_mode set default 'governed',
  alter column approval_readiness_mode set not null;

create index if not exists idx_crm_quotations_readiness_mode
  on public.aura_crm_quotations (tenant_id, approval_readiness_mode);

-- @DOWN
drop trigger if exists crm_quotation_default_readiness_mode on public.aura_crm_quotations;
drop function if exists public.crm_quotation_default_readiness_mode();
drop index if exists idx_crm_quotations_readiness_mode;
alter table public.aura_crm_quotations
  alter column approval_readiness_mode drop not null,
  alter column approval_readiness_mode drop default;

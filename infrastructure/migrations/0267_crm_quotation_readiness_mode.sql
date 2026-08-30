-- ============================================================
-- AURA OS — migration 0267: explicit quotation readiness governance marker
-- ------------------------------------------------------------
-- Existing rows are explicitly classified as legacy during this migration. New rows default to
-- governed, so the legacy no-checklist compatibility path cannot be obtained through NULL.
-- ============================================================

alter table public.aura_crm_quotations
  add column if not exists approval_readiness_mode text
  check (approval_readiness_mode in ('governed', 'legacy'));

-- Backfill the only compatibility class once, then make omission fail closed at the schema level.
update public.aura_crm_quotations
set approval_readiness_mode = 'legacy'
where approval_readiness_mode is null;

alter table public.aura_crm_quotations
  alter column approval_readiness_mode set default 'governed',
  alter column approval_readiness_mode set not null;

-- Old application binaries may omit the additive column while rolling forward. Treat such INSERTs
-- as governed. The trigger also normalizes an explicit NULL from an old writer before NOT NULL is
-- checked, keeping the compatibility path from becoming an omission-based bypass in a rollout.
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

create index if not exists idx_crm_quotations_readiness_mode
  on public.aura_crm_quotations (tenant_id, approval_readiness_mode);

-- @DOWN
drop trigger if exists crm_quotation_default_readiness_mode on public.aura_crm_quotations;
drop function if exists public.crm_quotation_default_readiness_mode();
drop index if exists idx_crm_quotations_readiness_mode;
alter table public.aura_crm_quotations
  drop column if exists approval_readiness_mode;

-- ============================================================
-- AURA OS — migration 0245: PreAwardPackage.opportunity_id → uuid + real FK
-- ------------------------------------------------------------
-- Forward-fix of 0244 (which shipped opportunity_id as text). Decision: the Direct owner is a real
-- intra-CRM FK (opportunities.id is uuid); tender_id stays a cross-module text ref, app-enforced.
-- SAFE: aura_crm_pre_award_packages is empty at apply time (verified) — the type change converts
-- zero rows. Works on a fresh DB too (0244 creates text → 0245 alters to uuid).
-- ============================================================

alter table public.aura_crm_pre_award_packages
  alter column opportunity_id type uuid using nullif(opportunity_id, '')::uuid;

alter table public.aura_crm_pre_award_packages
  add constraint aura_pre_award_pkg_opportunity_fk
  foreign key (opportunity_id) references public.aura_crm_opportunities(id) on delete restrict;

-- @DOWN
alter table public.aura_crm_pre_award_packages drop constraint if exists aura_pre_award_pkg_opportunity_fk;
alter table public.aura_crm_pre_award_packages
  alter column opportunity_id type text using opportunity_id::text;

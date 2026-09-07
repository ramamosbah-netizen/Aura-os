-- ============================================================
-- AURA OS — migration 0282: the ELV system an NCR belongs to
-- ------------------------------------------------------------
-- The Project 360 discipline lens filters records by their discipline / system / systemType field.
-- NCRs carried none of the three, so `filterAreaRows` fell to its "no system field at all" arm,
-- which KEEPS the row on purpose — that is what "project-wide records remain visible alongside
-- matching system records" means. The consequence was that selecting CCTV in the Project 360 shell
-- narrowed the Testing section (commissioning records carry `system`) and silently narrowed nothing
-- in Quality, while both surfaces claimed to be filtered.
--
-- Nullable and free text, matching how `system` already exists on aura_commissioning_records,
-- aura_elv_devices and aura_compliance_*. NOT defaulted to 'other': a default would make every
-- historical NCR claim a system it was never assessed against, and the lens would then hide rows
-- from anyone filtering — turning a gap in coverage into a gap in evidence. NULL keeps the existing
-- "no system recorded, so always visible" behaviour for rows raised before this column existed.
--
-- The vocabulary is not constrained here for the same reason commissioning does not constrain it:
-- the lens normalises values before comparing (case, hyphens and underscores are all stripped), so
-- 'access-control' and 'access_control' already match, and a CHECK would only add a way for a
-- project with an unusual system name to fail a write.
-- ============================================================

alter table public.aura_quality_ncrs add column if not exists system text;

-- The lens filters within one project, so the existing (tenant_id, project_id) index does the
-- narrowing; this only helps the cross-project "all NCRs on this system" reads.
create index if not exists idx_aura_quality_ncrs_system
  on public.aura_quality_ncrs (tenant_id, system)
  where system is not null;

-- @DOWN
-- Dropping the column discards every system attribution recorded through it. That is the honest
-- reversal: the lens then treats all NCRs as unattributed again, which is exactly the state this
-- migration was written to leave behind, so nothing is silently mis-filtered on the way back.
drop index if exists public.idx_aura_quality_ncrs_system;
alter table public.aura_quality_ncrs drop column if exists system;

-- ============================================================
-- AURA OS — migration 0231: asset maintenance lookup by asset
-- ------------------------------------------------------------
-- Part of closing the last of gap G-08 (fleet / assets / amc).
--
-- The asset register now refuses to dispose an asset while maintenance is still open against it,
-- and returns an asset to `active` only when its LAST open job completes. Both read maintenance by
-- (tenant, asset). Without this index that check is a sequential scan on every disposal and every
-- completion — on the hot path of the gate itself.
--
-- No new columns: the asset status vocabulary (active | maintenance | inactive | disposed) already
-- existed, it simply was not enforced. This migration is the index that makes enforcing it cheap.
-- ============================================================

create index if not exists idx_asset_maintenance_by_asset
  on public.aura_asset_maintenance (tenant_id, asset_id, status);

-- @DOWN
drop index if exists idx_asset_maintenance_by_asset;

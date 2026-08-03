-- ============================================================
-- AURA OS — migration 0209: code project variations to a CBS cost line
-- ------------------------------------------------------------
-- The Variation (change-order) strand of the Cost Engine — the BUDGET side of the cost sheet. A
-- variation coded to a CBS node adjusts that line's approved budget (BAC) when approved: an addition
-- is a +budget ledger entry, an omission a −budget entry. No module touches the CBS directly; the
-- budget baseline becomes opening estimate + SUM(approved variations). Nullable + additive; an
-- uncoded variation changes no cost line. Owned by projects.
-- ============================================================

alter table public.aura_projects_variations add column if not exists cbs_node_id text;

-- @DOWN
alter table public.aura_projects_variations drop column if exists cbs_node_id;

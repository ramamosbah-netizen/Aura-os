-- ============================================================
-- AURA OS — migration 0207: code subcontracts to a CBS cost line
-- ------------------------------------------------------------
-- The Subcontract strand of the Cost Engine, mirroring the PO: a subcontract coded to a CBS node
-- accrues COMMITTED cost when it goes active (like a PO commitment), and ACTUAL cost as each interim
-- claim (IPC) is certified (the gross work done this period). No module touches the CBS directly —
-- both are append-only ledger postings. Nullable + additive; an uncoded subcontract accrues nowhere.
-- Owned by subcontracts.
-- ============================================================

alter table public.aura_subcontracts add column if not exists cbs_node_id text;

-- @DOWN
alter table public.aura_subcontracts drop column if exists cbs_node_id;

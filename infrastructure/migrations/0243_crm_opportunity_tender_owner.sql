-- ============================================================
-- AURA OS — migration 0243: Opportunity → owning Tender link (commercial-ownership fact)
-- ------------------------------------------------------------
-- Denormalises WHICH tender owns a deal's commercial progression onto the opportunity, so the
-- opportunity aggregate can enforce — in the service, not just the UI — that a tender-route deal
-- does NOT run a parallel commercial lifecycle: once `tender_id` is set (Start Tender, or a tender
-- registered directly and back-linked), manual proposal/negotiation/won/lost and direct
-- convert-to-quotation are refused; the tender's award/loss syncs the outcome back. Null for
-- direct-sale deals. Additive, nullable — existing rows are unaffected (treated as direct/unowned).
-- ============================================================

alter table public.aura_crm_opportunities add column if not exists tender_id text;

-- @DOWN
alter table public.aura_crm_opportunities drop column if exists tender_id;

-- ============================================================
-- AURA OS — migration 0172: win reason on the Opportunity (G5)
-- ------------------------------------------------------------
-- The opportunity could always record WHY we lost (loss_reason, 0153) but never why we WON.
-- That asymmetry is backwards: losses teach you what to fix, wins teach you what to repeat and
-- what to price. Without it, "why do we win?" is answerable only by asking people to remember.
--
-- §40 invariant 3 (Won → final value + winning context) is unenforceable without somewhere to put
-- the winning context — this is that column, and 0172 is what makes the gate possible rather than
-- aspirational.
--
-- Additive + nullable, and the gate only applies to TRANSITIONS: every opportunity already sitting
-- in `won` keeps its history untouched and is never retro-blocked. New wins must explain
-- themselves; old ones are not rewritten to pretend they did.
-- ============================================================

alter table public.aura_crm_opportunities
  add column if not exists win_reason text;

-- @DOWN
alter table public.aura_crm_opportunities
  drop column if exists win_reason;

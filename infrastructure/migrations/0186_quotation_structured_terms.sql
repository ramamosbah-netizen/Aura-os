-- ============================================================
-- AURA OS — migration 0186: structured commercial terms on a quotation
-- ------------------------------------------------------------
-- The quotation carried its terms as one free-text blob (`terms`, added in 0146):
-- payment, delivery and exclusions all mixed in a paragraph. An exclusion buried
-- in prose is the one a customer later says they never saw, and "does this cover
-- the permits?" should be answered by a row, not by re-reading a blob.
--
-- So exclusions become a list and payment/delivery become their own fields. `terms`
-- stays for free-form notes the structured fields do not capture — nothing is
-- dropped, the existing 19 quotations keep whatever they had.
--
-- exclusions is jsonb like `lines` and `pricing` (0169): a small, bounded list read
-- only with its quotation, never filtered across records — a child table would buy
-- nothing and cost a join on every read.
-- ============================================================

alter table public.aura_crm_quotations
  add column if not exists exclusions         jsonb not null default '[]'::jsonb,
  add column if not exists payment_conditions text,
  add column if not exists delivery_terms     text;

-- @DOWN
alter table public.aura_crm_quotations
  drop column if exists exclusions,
  drop column if exists payment_conditions,
  drop column if exists delivery_terms;

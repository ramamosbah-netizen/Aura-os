-- ============================================================
-- AURA OS — migration 0187: the quotation's subject
-- ------------------------------------------------------------
-- What the quote is FOR, in the author's words — "Tower B ELV fit-out". Not a line
-- item and not the customer: the one phrase that names the job. It travels downstream
-- as the title of the contract and then the project, so the words a customer saw on
-- the quote are the words the delivery team works under. Nullable — legacy quotes
-- keep null and read fine.
-- ============================================================

alter table public.aura_crm_quotations
  add column if not exists subject text;

-- @DOWN
alter table public.aura_crm_quotations
  drop column if exists subject;

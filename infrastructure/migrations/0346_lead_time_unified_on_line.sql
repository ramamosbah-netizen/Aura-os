-- Lead time is the LINE's fact, not the quotation's.
--
-- 0344 gave each quotation line its own `lead_time_days`, and the quotation header had carried one
-- since 0053. Both are legitimate things to say — an overall delivery, and a per-item one — but they
-- can disagree, and nothing reconciled them. Two writable places for one fact is the competing-truth
-- shape this wave has spent itself removing: a header value beside line values, a scalar order
-- quantity beside its lines, a normalised total beside an original price.
--
-- Unified on the LINE, because that is the grain a comparison reads: "when does THIS item arrive" is
-- the question that feeds a need-by date, and an overall figure cannot answer it for a partial
-- delivery.
--
-- NO DATA IS CHANGED AND NOTHING IS BACKFILLED. The header column keeps whatever historic quotations
-- recorded — deleting it would destroy a fact somebody entered, and copying it down onto lines would
-- invent a per-item claim the supplier never made. What changes is that the API now REFUSES a lead
-- time on a new quotation header and names where it belongs, so the two cannot diverge going forward.

comment on column public.aura_procurement_rfq_quotes.lead_time_days is
  'SUPERSEDED by aura_procurement_quotation_lines.lead_time_days. Retained for historic quotations; refused on new ones. Lead time is a per-item fact.';

-- @DOWN
comment on column public.aura_procurement_rfq_quotes.lead_time_days is NULL;

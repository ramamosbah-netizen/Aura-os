-- ============================================================
-- AURA OS — migration 0352: retire quotation_lines.quotation_id (QC-01, final)
-- ------------------------------------------------------------
-- The last legacy field. A line now belongs to an immutable REVISION and to nothing else.
--
-- This was held back deliberately while SUP-01's technical-evaluation surfaces still read lines by
-- quotation. Those reads are now on revisions — which is not merely a rename: a verdict belongs to
-- the lines of a SPECIFIC offer revision, and under the old model a verdict recorded against Rev 1's
-- line could be read as a verdict on Rev 2's different price.
--
-- IT REFUSES RATHER THAN HALF-APPLIES. The guard below is not defensive decoration: an earlier draft
-- of this migration set NOT NULL and dropped the column as separate statements, met two rows the
-- backfill had never seen, failed on the first — and dropped the column anyway, destroying the only
-- lineage those rows had. Any line without a revision means the backfill has not been run, or has
-- been run and something was created after it; either way the answer is to go and look, not to drop
-- the evidence.
--
-- `aura_procurement_rfq_quotes` itself is untouched. It still carries the award path and the legacy
-- header scalar `lowestQuote` compares, and retiring that belongs to SUP-13, not here.
-- ============================================================

DO $$
DECLARE orphans integer;
BEGIN
  SELECT count(*) INTO orphans
    FROM public.aura_procurement_quotation_lines
   WHERE revision_id IS NULL;

  IF orphans > 0 THEN
    RAISE EXCEPTION
      'REFUSING to drop quotation_id: % quotation line(s) have no revision. Run '
      'apps/api/scripts/qc-01-backfill.mjs and re-check; dropping now would destroy the only '
      'lineage those rows have.', orphans;
  END IF;
END $$;

alter table public.aura_procurement_quotation_lines
  drop constraint if exists aura_procurement_quotation_lines_tenant_id_quotation_id_pr_l_key;

alter table public.aura_procurement_quotation_lines
  alter column revision_id set not null;

alter table public.aura_procurement_quotation_lines
  drop column if exists quotation_id;

-- @DOWN
-- Restored EMPTY. Every value it held was the id of a quotation whose lines now belong to a
-- revision, and re-deriving it would assert a lineage the backfill deliberately preserved elsewhere.
alter table public.aura_procurement_quotation_lines
  add column if not exists quotation_id uuid;
alter table public.aura_procurement_quotation_lines
  alter column revision_id drop not null;

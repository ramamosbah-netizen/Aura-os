-- ============================================================
-- AURA OS — migration 0350: a quotation line belongs to a revision (QC-01)
-- ------------------------------------------------------------
-- 0349 gave lines a `revision_id` beside the legacy `quotation_id`. This is the enabling step that
-- lets a line exist WITHOUT a legacy quotation at all, so a line captured against a revision does
-- not need a phantom row in `aura_procurement_rfq_quotes` invented to satisfy a constraint.
--
-- It relaxes, it does not retire. `quotation_id` stays, every existing value stays, and the column
-- is dropped only in the final retirement step once nothing reads it. The uniqueness that matters —
-- ONE ANSWER PER REQUISITION LINE PER OFFER — moves to the revision, where it belongs: a supplier
-- quoting the same item on a base offer and on an alternative is two legitimate answers, and the old
-- quotation-scoped constraint could not express that.
-- ============================================================

alter table public.aura_procurement_quotation_lines
  alter column quotation_id drop not null;

comment on column public.aura_procurement_quotation_lines.quotation_id is
  'LEGACY. NULL on any line captured against a revision. Retained until the retirement step so backfilled lineage stays inspectable; nothing new should write it.';

-- One answer per requisition line per REVISION. The legacy quotation-scoped unique constraint is
-- left in place: it still holds for backfilled rows, and a NULL quotation_id makes it inert for new
-- ones, which is exactly the behaviour a staged migration wants.
create unique index if not exists aura_quotation_lines_one_per_revision
  on public.aura_procurement_quotation_lines (tenant_id, revision_id, pr_line_id)
  where revision_id is not null;

-- @DOWN
drop index if exists public.aura_quotation_lines_one_per_revision;
-- Deliberately NOT restoring NOT NULL: rows captured against a revision have no quotation_id, and
-- re-imposing it would fail rather than reverse cleanly.

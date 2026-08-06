-- Tax point (supply date) on VAT lines — the date a return must be filed by.
--
-- A VAT return covers supplies whose TAX POINT falls in the period. The return builder was
-- filtering on `created_at`, the moment the row was written, which is only the same thing when
-- nothing is ever entered late. Book a March invoice on 2 April and its VAT landed in the April
-- return: March under-declared, April over-declared, both filed wrong. Backdated entries and
-- month-end catch-up — normal for a contractor — hit this every period.
--
-- Nullable with a backfill from created_at, so existing rows keep exactly the behaviour they had
-- and nothing re-states a filed period. New lines carry the real supply date.

ALTER TABLE public.aura_finance_tax_lines
  ADD COLUMN IF NOT EXISTS tax_point_date date;

UPDATE public.aura_finance_tax_lines
   SET tax_point_date = created_at::date
 WHERE tax_point_date IS NULL;

-- Returns are built by scanning a period, so index the column they scan.
CREATE INDEX IF NOT EXISTS idx_tax_lines_tenant_tax_point
  ON public.aura_finance_tax_lines (tenant_id, tax_point_date);

-- @DOWN
DROP INDEX IF EXISTS idx_tax_lines_tenant_tax_point;
ALTER TABLE public.aura_finance_tax_lines DROP COLUMN IF EXISTS tax_point_date;

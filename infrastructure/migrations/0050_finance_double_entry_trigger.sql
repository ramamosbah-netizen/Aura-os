-- Migration: Double-Entry Financial Integrity Trigger
-- Enforces that Sum(debit) = Sum(credit) for each journal entry at commit time.

CREATE OR REPLACE FUNCTION public.fn_check_journal_balance()
RETURNS TRIGGER AS $$
DECLARE
  v_journal_id UUID;
  v_balance NUMERIC;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_journal_id := OLD.journal_id;
  ELSE
    v_journal_id := NEW.journal_id;
  END IF;

  -- Compute the imbalance: Sum(debit) - Sum(credit)
  SELECT COALESCE(SUM(debit), 0) - COALESCE(SUM(credit), 0) INTO v_balance
  FROM public.aura_finance_journal_lines
  WHERE journal_id = v_journal_id;

  -- Ensure total balance is 0 within standard precision
  IF v_balance IS NOT NULL AND ABS(v_balance) > 0.001 THEN
    RAISE EXCEPTION 'Double-entry integrity violation: Journal % is unbalanced by %. Sum of debits must equal sum of credits.', v_journal_id, v_balance;
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Register the constraint trigger to execute deferred at transaction commit
DROP TRIGGER IF EXISTS trg_journal_balance_check ON public.aura_finance_journal_lines;

CREATE CONSTRAINT TRIGGER trg_journal_balance_check
AFTER INSERT OR UPDATE OR DELETE ON public.aura_finance_journal_lines
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION public.fn_check_journal_balance();

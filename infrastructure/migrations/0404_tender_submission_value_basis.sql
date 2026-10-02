-- ============================================================
-- 0404 — A SUBMITTED BID SAYS WHAT ITS NUMBER IS: NET, VAT AND GROSS (VAT-BASIS-01)
--
-- `submitted_value` was a bare number. The submit path writes the approved offer's baseline TOTAL —
-- VAT-inclusive (measured: ALD-376214 stored 123,694.20 = 117,804.00 + VAT 5,890.20) — while the
-- customer's award is captured EXCLUDING VAT (ADR-0021: Award Value excl. VAT). The first comparison
-- anybody built would read the VAT as a pricing gap: a tender won at exactly our price would look
-- like a 4.76% discount conceded.
--
-- Now a submission carries its basis beside the number:
--   value_basis = 'gross'     submitted_value is the approved offer's total INCLUDING VAT, and
--                             submitted_net + submitted_vat are its two parts — exactly
--   value_basis = 'unstated'  nothing recorded what the number is: every row written before this
--                             migration, and a bid submitted with no approved offer (the tender's own
--                             figure). Its parts stay null — a back-filled split would be a guess
--                             about which baseline was current at the time, presented as a record.
--
-- `submitted_value` keeps its meaning and its rows; nothing here renames, merges or re-derives an
-- ADR-0021 measure. The table refuses a 'gross' row whose parts do not add up to its value, and an
-- 'unstated' row that claims parts — whatever writes it.
-- ============================================================

alter table public.aura_tendering_submissions
  add column if not exists value_basis   text    not null default 'unstated',
  add column if not exists submitted_net numeric,
  add column if not exists submitted_vat numeric;

alter table public.aura_tendering_submissions
  drop constraint if exists chk_aura_tendering_submission_value_basis;

alter table public.aura_tendering_submissions
  add constraint chk_aura_tendering_submission_value_basis check (
    (value_basis = 'unstated' and submitted_net is null and submitted_vat is null)
    or (
      value_basis = 'gross'
      and submitted_net is not null
      and submitted_vat is not null
      and submitted_vat >= 0
      and submitted_net + submitted_vat = submitted_value
    )
  );

-- @DOWN
alter table public.aura_tendering_submissions drop constraint if exists chk_aura_tendering_submission_value_basis;
alter table public.aura_tendering_submissions drop column if exists submitted_vat;
alter table public.aura_tendering_submissions drop column if exists submitted_net;
alter table public.aura_tendering_submissions drop column if exists value_basis;

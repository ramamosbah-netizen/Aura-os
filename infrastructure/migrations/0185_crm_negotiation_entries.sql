-- ============================================================
-- AURA OS kernel — migration 0185: the negotiation log
-- ------------------------------------------------------------
-- What was asked, what was answered, and what the competition was doing. The
-- stage already existed (quotation status `under_negotiation`) and price movement
-- was already recoverable from the revision chain — each revision being a full
-- quotation with its own total. What had no home was the ASK and the ANSWER:
-- "they want 8% off", "we held at 3%", "the competitor quoted 1.42M".
--
-- A LOG, not a state column. A negotiation is a sequence of positions, and
-- collapsing it to a current status throws away the shape of the conversation,
-- which is exactly what tells a commercial manager whether to hold or move.
--
-- NOTE ON TRUTH: nothing here bills. Price movement is computed from the revision
-- chain, never from what a note claimed. A note reading "gave them 5%" and a
-- revision chain showing 2% disagree, and the chain wins. This table is why a
-- decision was taken, not what the decision was.
-- ============================================================

create table if not exists public.aura_crm_negotiation_entries (
  id           uuid        primary key,
  tenant_id    text        not null,
  quotation_id text        not null,
  -- DISCOUNT_REQUESTED | COUNTER_OFFERED | POSITION_HELD | CUSTOMER_COMMENT |
  -- COMPETITOR_NOTED | SCOPE_CHANGED
  type         text        not null,
  -- CUSTOMER | US | COMPETITOR — a log that cannot tell the two sides apart is not a log.
  party        text        not null,
  -- The money on the table when there is a number: the amount asked for, the amount
  -- offered, or the competitor's price. Null when the entry is qualitative.
  amount       numeric(18,2),
  -- Percent when the ask was put that way. Both may be set; neither derives from the other.
  percent      numeric(6,2),
  note         text        not null,
  recorded_by  text,
  -- When it HAPPENED, which is not when it was typed — people log yesterday's call today,
  -- and reading the sequence by created_at would put the answer before the question.
  occurred_at  timestamptz not null default now(),
  created_at   timestamptz not null default now()
);

-- The only read there is: the whole log for one quotation, in order.
create index if not exists idx_aura_crm_negotiation_quotation
  on public.aura_crm_negotiation_entries (quotation_id, occurred_at);

-- Deliberately NO unique constraint. Two identical entries are not a data-entry
-- error here: a customer really can ask for the same 10% twice, and the second ask
-- is a fact about the negotiation.

-- Tenant isolation, the enforced way (0163/0164) — enabled, FORCED, and policied.
-- NOT the pre-R1 "enable RLS, no policy" pattern, which is deny-all under `aura_app`.
alter table public.aura_crm_negotiation_entries enable row level security;
alter table public.aura_crm_negotiation_entries force row level security;

drop policy if exists tenant_isolation on public.aura_crm_negotiation_entries;
create policy tenant_isolation on public.aura_crm_negotiation_entries
  using (tenant_id::text = public.current_tenant_id() and public.current_tenant_id() is not null)
  with check (tenant_id::text = public.current_tenant_id() and public.current_tenant_id() is not null);

-- @DOWN
drop table if exists public.aura_crm_negotiation_entries;

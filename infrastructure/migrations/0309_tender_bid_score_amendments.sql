-- Governed Bid / No-Bid amendments keep every confirmed decision immutable.
alter table public.aura_tendering_bid_scores
  add column if not exists supersedes_id uuid references public.aura_tendering_bid_scores(id),
  add column if not exists amendment_reason text,
  add column if not exists superseded_at timestamptz,
  add column if not exists superseded_by text;

create unique index if not exists uq_tendering_bid_scores_active_decision
  on public.aura_tendering_bid_scores (tenant_id, tender_id)
  where superseded_at is null;

-- @DOWN
drop index if exists public.uq_tendering_bid_scores_active_decision;
alter table public.aura_tendering_bid_scores
  drop column if exists superseded_by,
  drop column if exists superseded_at,
  drop column if exists amendment_reason,
  drop column if exists supersedes_id;

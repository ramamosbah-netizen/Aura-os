-- ============================================================
-- AURA OS — migration 0101: Tender bid scores (go/no-go qualification)
-- ------------------------------------------------------------
-- Weighted go/no-go scoring of a tender across criteria (stored as jsonb),
-- yielding a 0–100 overall score and a recommendation (go/conditional/no_go).
-- ============================================================

create table if not exists public.aura_tendering_bid_scores (
  id             uuid primary key,
  tenant_id      text not null,
  company_id     text,
  tender_id      text not null,
  tender_title   text,
  criteria       jsonb not null default '[]'::jsonb,
  total_score    numeric(6,2) not null default 0,
  recommendation text not null default 'no_go',
  notes          text,
  decided_by     text,
  created_by     text,
  created_at     timestamptz not null default now()
);

create index if not exists idx_tendering_bid_scores_tenant on public.aura_tendering_bid_scores (tenant_id);
create index if not exists idx_tendering_bid_scores_tender on public.aura_tendering_bid_scores (tender_id);

alter table public.aura_tendering_bid_scores enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'aura_tendering_bid_scores' and policyname = 'tenant_isolation_policy'
  ) then
    create policy tenant_isolation_policy on public.aura_tendering_bid_scores
      using (tenant_id = public.current_tenant_id());
  end if;
end $$;

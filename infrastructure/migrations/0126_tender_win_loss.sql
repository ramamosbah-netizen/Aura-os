-- ============================================================
-- AURA OS — migration 0126: tender win/loss outcomes
-- ------------------------------------------------------------
-- Competitor win/loss analytics behind tendering: one row per decided tender
-- recording our bid, the competitors met (jsonb snapshot), who won, and the
-- debrief reason. Rolled up by WinLossService into win-rate + head-to-head stats.
-- ============================================================

create table if not exists public.aura_tendering_outcomes (
  id            uuid primary key,
  tenant_id     text not null,
  company_id    text,
  tender_id     text not null,
  tender_title  text,
  result        text not null check (result in ('won', 'lost')),
  our_bid_value numeric(18,2) not null default 0,
  competitors   jsonb not null default '[]'::jsonb,
  winner_name   text,
  reason        text,
  decided_at    timestamptz not null,
  created_by    text,
  created_at    timestamptz not null default now()
);

create index if not exists idx_tendering_outcomes_tenant on public.aura_tendering_outcomes (tenant_id, decided_at desc);
create index if not exists idx_tendering_outcomes_tender on public.aura_tendering_outcomes (tender_id);

alter table public.aura_tendering_outcomes enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'aura_tendering_outcomes' and policyname = 'tenant_isolation_policy'
  ) then
    create policy tenant_isolation_policy on public.aura_tendering_outcomes
      using (tenant_id = public.current_tenant_id());
  end if;
end $$;

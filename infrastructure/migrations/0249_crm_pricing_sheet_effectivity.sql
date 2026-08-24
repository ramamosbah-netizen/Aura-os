-- ============================================================
-- AURA OS — migration 0249: pricing sheet effectivity (Slice 8, PR-1)
-- ------------------------------------------------------------
-- A pricing revision, once frozen, is a permanent commercial record — it may have produced a
-- quotation and carries the audit of exactly which price the customer saw. Re-pricing must NOT
-- destroy it. So we model effectivity ORTHOGONALLY to `status`: `status` stays the lifecycle fact
-- ("this revision was frozen"), and three additive columns mark whether a frozen revision is still
-- CURRENT or has been SUPERSEDED by a newer frozen revision. Currently effective =
-- status='frozen' AND superseded_at IS NULL. History (frozen_at, frozen_by, commercial_decision,
-- quotation_id, lines) is never rewritten.
--
-- Additive + nullable — the running app ignores the new columns, so this is backward-compatible.
-- ============================================================

alter table public.aura_crm_pricing_sheets
  add column if not exists superseded_at            timestamptz,
  add column if not exists superseded_by            text,
  add column if not exists superseded_by_pricing_id uuid;

-- ── Backfill existing double-frozen data ─────────────────────────────────────────────────────────
-- Before this migration, freezing a new version left the old version 'frozen' too, so a package (or a
-- legacy quotation-scoped sheet) could carry more than one frozen revision with no way to tell which
-- is current. We reconcile that here, but ONLY when the lineage is UNAMBIGUOUS: within an effectivity
-- scope (package, else quotation, else opportunity), the newest revision by `version` must ALSO be the
-- newest by `frozen_at`, and its version must be unique. When all three signals agree we mark every
-- older frozen revision superseded by that current one. Any scope where version-order and time-order
-- DISAGREE, or the top version is tied, is left completely untouched and reported (a human decides) —
-- we never silently pick a winner by created_at alone.
with frozen as (
  select id, frozen_by, frozen_at, version,
         coalesce(package_id::text, 'q:' || quotation_id, 'o:' || opportunity_id, 'id:' || id::text) as scope_key
  from public.aura_crm_pricing_sheets
  where status = 'frozen'
),
ranked as (
  select f.*,
         count(*)     over (partition by f.scope_key)                                     as n,
         row_number() over (partition by f.scope_key order by f.version desc, f.frozen_at desc) as rn_ver,
         row_number() over (partition by f.scope_key order by f.frozen_at desc, f.version desc) as rn_time,
         count(*)     over (partition by f.scope_key, f.version)                           as ties_this_ver
  from frozen f
),
current_row as (
  -- rank-1-by-version row in each multi-frozen scope that is coherent (also rank-1-by-time, unique version)
  select scope_key, id as current_id, frozen_by as current_by, frozen_at as current_at
  from ranked
  where n > 1 and rn_ver = 1 and rn_time = 1 and ties_this_ver = 1
)
update public.aura_crm_pricing_sheets s
set superseded_at            = c.current_at,
    superseded_by            = c.current_by,
    superseded_by_pricing_id = c.current_id
from ranked r
join current_row c on c.scope_key = r.scope_key
where s.id = r.id
  and r.id <> c.current_id
  and s.superseded_at is null;

-- Report (do not modify) any scope whose double-frozen rows are ambiguous: version-order and
-- time-order disagree, or the top version is tied. These need a human decision, not a guess.
do $$
declare rec record;
begin
  for rec in
    with frozen as (
      select id, frozen_at, version,
             coalesce(package_id::text, 'q:' || quotation_id, 'o:' || opportunity_id, 'id:' || id::text) as scope_key
      from public.aura_crm_pricing_sheets
      where status = 'frozen'
    ),
    ranked as (
      select f.*,
             count(*)     over (partition by f.scope_key)                                     as n,
             row_number() over (partition by f.scope_key order by f.version desc, f.frozen_at desc) as rn_ver,
             row_number() over (partition by f.scope_key order by f.frozen_at desc, f.version desc) as rn_time,
             count(*)     over (partition by f.scope_key, f.version)                           as ties_this_ver
      from frozen f
    )
    select scope_key, array_agg(id order by version) as ids
    from ranked
    where n > 1
    group by scope_key
    having bool_or(rn_ver = 1 and (rn_time <> 1 or ties_this_ver <> 1))
  loop
    raise notice 'AURA 0249: ambiguous double-frozen pricing scope % (sheets %) left unchanged — resolve effectivity manually', rec.scope_key, rec.ids;
  end loop;
end $$;

-- Partial index for the deterministic "current price" read (status='frozen' AND superseded_at IS NULL).
create index if not exists idx_aura_crm_pricing_sheets_current
  on public.aura_crm_pricing_sheets (tenant_id, package_id)
  where status = 'frozen' and superseded_at is null;

-- @DOWN
drop index if exists idx_aura_crm_pricing_sheets_current;
alter table public.aura_crm_pricing_sheets
  drop column if exists superseded_by_pricing_id,
  drop column if exists superseded_by,
  drop column if exists superseded_at;

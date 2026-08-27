#!/usr/bin/env node
/**
 * AUDIT — tenders awarded BEFORE the commercial-basis model (ADR-0021 follow-up, migration 0256).
 *
 * STRICTLY READ-ONLY. It sets the session read-only and opens a `READ ONLY` transaction before
 * issuing a single query, so an accidental write raises `25006` instead of changing data. It does
 * not backfill, does not re-emit events, and does not touch the reactor.
 *
 * WHAT IT MEASURES. Migration 0256 pinned the contract's commercial basis to the award. A tender
 * won before that model — or via a legacy `tendering.tender.awarded` that never went through the
 * governed `award()` — pins no basis, so it gets no contract, and only a FUTURE
 * `crm.commercial_baseline.locked` can link one. This counts who is actually in that position,
 * before any policy is chosen:
 *
 *   1  won tenders, split by basis and by award provenance
 *   2  cohort A: won + commercial_basis IS NULL, crossed with baseline/contract presence
 *   3  cohort B(1): of A, exactly one locked baseline naming them in `source_tender_id`
 *   4  cohort E: of A, MORE THAN ONE candidate baseline — the group that proves a script must
 *      not pick one retroactively
 *   5/6  cohorts C+D: of A, those that already have a contract, with `contract.value` CLASSIFIED
 *      against baseline totals and the tender estimate rather than assumed to come from either
 *
 * RLS. Every tenant-scoped `aura_*` table is ENABLE + FORCE ROW LEVEL SECURITY (0163/0164), and the
 * policy needs `app.current_tenant_id` bound, so a non-BYPASSRLS role with no tenant bound sees
 * NOTHING — and would report "0 legacy awards" for a database full of them. This script refuses to
 * report a "0" it cannot distinguish from "hidden": run it as a BYPASSRLS/superuser role for a
 * whole-database pass, or pass --tenants=<id,...> to bind each tenant in turn and sum the passes.
 *
 * Usage:
 *   AUDIT_DATABASE_URL='postgres://...' node scripts/audit-legacy-award-commercial-basis.mjs
 *   ... --tenants=t1,t2      per-tenant pass, for a role that cannot bypass RLS
 *   ... --detail=50          rows of per-tender detail per section (default 20, 0 = counts only)
 *   ... --json               machine-readable output instead of the report
 */

import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/**
 * `pg` is a dependency of `apps/api`, not of the workspace root, and pnpm does not hoist it. Resolve
 * it from the package that actually declares it so this script runs from anywhere without adding a
 * root dependency just to read some rows.
 */
function loadPg() {
  const here = dirname(fileURLToPath(import.meta.url));
  const roots = [join(here, '..', 'apps', 'api'), join(here, '..'), here];
  for (const root of roots) {
    const anchor = join(root, 'package.json');
    if (!existsSync(anchor)) continue;
    try {
      return createRequire(anchor)('pg');
    } catch {
      /* try the next anchor */
    }
  }
  console.error('❌ Cannot resolve the `pg` driver. Run `pnpm install` first.');
  process.exit(2);
}

const { Pool } = loadPg();

const args = process.argv.slice(2);
const flag = (name, fallback = null) => {
  const hit = args.find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (!hit) return fallback;
  return hit.includes('=') ? hit.slice(hit.indexOf('=') + 1) : true;
};

const DETAIL = Number(flag('detail', 20)) || 0;
const AS_JSON = flag('json', false) === true;
const TENANTS =
  typeof flag('tenants') === 'string'
    ? String(flag('tenants')).split(',').map((s) => s.trim()).filter(Boolean)
    : [];
/*
 * ONE variable, and deliberately NOT `DATABASE_URL`.
 *
 * Falling back to `DATABASE_URL` would mean that running this in any ordinary shell in this repo
 * silently audits DEV and prints those numbers under the same headings as real ones. The failure is
 * not a crash, it is a plausible wrong answer — the same class as the RLS false zero. The target
 * must be named on purpose, every time.
 *
 * Supply it for the invocation only (`AUDIT_DATABASE_URL='…' node scripts/…`), from a temporary,
 * least-privilege, read-only credential. Do NOT persist a staging/production URL into
 * `apps/api/.env.local` beside the dev configuration.
 */
const URL = process.env.AUDIT_DATABASE_URL;

if (!URL) {
  console.error('❌ Set AUDIT_DATABASE_URL to the environment you want to audit.');
  console.error('   There is deliberately NO fallback to DATABASE_URL: an audit that silently reads dev');
  console.error('   and reports it under production headings is worse than one that refuses to run.');
  console.error('   Pass it for this invocation only, from a temporary read-only credential.');
  process.exit(2);
}

/*
 * ── the cohorts, as one set of CTEs ─────────────────────────────────────────────────────────────
 * Type reality, not assumption: `tenders.id` is uuid, while `commercial_baselines.source_tender_id`
 * and `contracts.tender_id` are BOTH text — so every join casts the uuid, never the text. tenant_id
 * is carried through every join: these tables have no FKs across module boundaries.
 */
const BASE_CTE = `
  with won as (
    select t.id, t.tenant_id, t.title, t.reference, t.value as tender_value,
           t.commercial_basis, t.award_evidence, t.created_at
      from public.aura_tendering_tenders t
     where t.status = 'won'
       and ($1::text[] is null or t.tenant_id = any($1::text[]))
  ),
  legacy as (
    select * from won where commercial_basis is null
  ),
  -- The authoritative award moment, when one was ever recorded. A legacy award has no
  -- award_evidence.awardedAt, so the emitted event is the only timestamp that is not an invention.
  awarded_event as (
    select e.aggregate_id as tender_id, min(e.occurred_at) as awarded_at, count(*) as award_events
      from public.aura_events e
     where e.type = 'tendering.tender.awarded'
       and ($1::text[] is null or e.tenant_id = any($1::text[]))
     group by e.aggregate_id
  ),
  -- Every locked baseline that NAMES a tender. A row in this table IS a lock (locked_at NOT NULL).
  cand as (
    select b.id as baseline_id, b.tenant_id, b.source_tender_id, b.quotation_id, b.quote_number,
           b.revision, b.total, b.locked_at,
           q.status as quotation_status,
           case q.status
             when 'accepted' then 0 when 'approved' then 1 when 'sent' then 2 else 3
           end as rank
      from public.aura_crm_commercial_baselines b
      left join public.aura_crm_quotations q
             on q.id::text = b.quotation_id and q.tenant_id = b.tenant_id
     where b.source_tender_id is not null
       and ($1::text[] is null or b.tenant_id = any($1::text[]))
  ),
  cand_of as (
    select l.id as tender_id, c.baseline_id, c.quotation_id, c.quote_number, c.revision,
           c.total, c.locked_at, c.quotation_status, c.rank
      from legacy l
      join cand c on c.source_tender_id = l.id::text and c.tenant_id = l.tenant_id
  ),
  cand_stats as (
    select tender_id,
           count(*)                         as n_baselines,
           count(distinct total)            as n_distinct_totals,
           min(total)                       as min_total,
           max(total)                       as max_total,
           min(locked_at)                   as first_locked_at,
           max(locked_at)                   as last_locked_at,
           count(*) filter (where rank < 3) as n_decided,
           min(rank)                        as best_rank
      from cand_of group by tender_id
  ),
  con as (
    select l.id as tender_id, k.id as contract_id, k.value as contract_value,
           k.commercial_baseline_id, k.status as contract_status, k.created_at as contract_created_at
      from legacy l
      join public.aura_contracts_contracts k
        on k.tender_id = l.id::text and k.tenant_id = l.tenant_id
  ),
  con_stats as (
    select tender_id, count(*) as n_contracts from con group by tender_id
  )
`;

export const QUERIES = {
  /* 1 — the whole won population, so cohort A has a denominator. */
  population: `${BASE_CTE}
    select
      (select count(*) from won)                                                    as won_total,
      (select count(*) from won where commercial_basis is not null)                 as with_basis,
      (select count(*) from won where commercial_basis is null)                     as without_basis,
      (select count(*) from won where commercial_basis is null and award_evidence is not null)
                                                                                    as without_basis_governed_award,
      (select count(*) from won where commercial_basis is null and award_evidence is null)
                                                                                    as without_basis_legacy_won,
      (select count(*) from won w where w.commercial_basis is null
         and not exists (select 1 from awarded_event a where a.tender_id = w.id::text))
                                                                                    as without_basis_no_award_event,
      (select count(distinct tenant_id) from won)                                   as tenants_with_won
  `,

  /* 2 — the cross-tab that frames the policy: baseline present? contract present? */
  matrix: `${BASE_CTE}
    select
      case
        when cs.tender_id is null then 'no_baseline'
        when cs.n_baselines = 1 then 'one_baseline'
        else 'many_baselines'
      end as baseline_bucket,
      case when coalesce(ks.n_contracts, 0) = 0 then 'no_contract' else 'has_contract' end as contract_bucket,
      count(*) as tenders
      from legacy l
      left join cand_stats cs on cs.tender_id = l.id
      left join con_stats  ks on ks.tender_id = l.id
     group by 1, 2 order by 1, 2
  `,

  /*
   * 4 — the ambiguity group. Two different defensible pickers are computed and compared; where they
   * disagree, no script can be said to hold "the" answer.
   */
  ambiguous: `${BASE_CTE}
    , ranked as (
      select c.*,
             row_number() over (partition by c.tender_id order by c.rank asc, c.locked_at desc) as by_rank,
             row_number() over (partition by c.tender_id order by c.locked_at desc)             as by_recency
        from cand_of c
    )
    select l.id, l.tenant_id, l.title, l.reference, l.tender_value,
           cs.n_baselines, cs.n_distinct_totals, cs.min_total, cs.max_total,
           cs.max_total - cs.min_total as total_spread,
           cs.first_locked_at, cs.last_locked_at, cs.n_decided,
           a.awarded_at,
           (select count(*) from cand_of c where c.tender_id = l.id and c.locked_at > a.awarded_at)
             as locked_after_award,
           r1.total as pick_by_rank_total, r1.baseline_id as pick_by_rank_baseline,
           r1.quotation_status as pick_by_rank_status,
           r2.total as pick_by_recency_total, r2.baseline_id as pick_by_recency_baseline,
           (r1.baseline_id is distinct from r2.baseline_id) as pickers_disagree,
           (r1.total is distinct from r2.total)             as pickers_disagree_on_money,
           (select count(*) from cand_of c where c.tender_id = l.id and c.rank = cs.best_rank)
             as tied_at_best_rank,
           (select count(distinct c.total) from cand_of c where c.tender_id = l.id and c.rank = cs.best_rank)
             as distinct_totals_at_best_rank
      from legacy l
      join cand_stats cs on cs.tender_id = l.id and cs.n_baselines > 1
      left join awarded_event a on a.tender_id = l.id::text
      left join ranked r1 on r1.tender_id = l.id and r1.by_rank = 1
      left join ranked r2 on r2.tender_id = l.id and r2.by_recency = 1
     order by cs.n_distinct_totals desc, (cs.max_total - cs.min_total) desc
  `,

  /*
   * 5/6 — existing contracts on basis-less tenders, CLASSIFIED. `commercial_baseline_id` is the
   * contract's own declared provenance; the value comparison is independent corroboration. Where the
   * two disagree, that is the finding — it is surfaced here, never resolved.
   */
  contracts: `${BASE_CTE}
    select k.tender_id, l.tenant_id, l.title, l.reference,
           k.contract_id, k.contract_status, k.contract_value, k.commercial_baseline_id,
           k.contract_created_at, l.tender_value,
           cs.n_baselines, cs.min_total, cs.max_total,
           (k.commercial_baseline_id is not null) as declares_baseline,
           exists (select 1 from cand_of c
                    where c.tender_id = k.tender_id and c.baseline_id::text = k.commercial_baseline_id)
             as declared_baseline_is_a_candidate,
           (select c.total from cand_of c
             where c.tender_id = k.tender_id and c.baseline_id::text = k.commercial_baseline_id)
             as declared_baseline_total,
           (abs(k.contract_value - l.tender_value) < 0.01) as value_equals_tender_estimate,
           exists (select 1 from cand_of c
                    where c.tender_id = k.tender_id and abs(c.total - k.contract_value) < 0.01)
             as value_equals_some_baseline,
           case
             when k.contract_value is null then 'NO_VALUE'
             when exists (select 1 from cand_of c
                           where c.tender_id = k.tender_id and abs(c.total - k.contract_value) < 0.01)
                  and abs(k.contract_value - l.tender_value) < 0.01 then 'AMBIGUOUS_BOTH_EQUAL'
             when exists (select 1 from cand_of c
                           where c.tender_id = k.tender_id and abs(c.total - k.contract_value) < 0.01)
                  then 'MATCHES_A_BASELINE_TOTAL'
             when abs(k.contract_value - l.tender_value) < 0.01 then 'MATCHES_TENDER_ESTIMATE'
             else 'MATCHES_NEITHER'
           end as value_classification
      from con k
      join legacy l on l.id = k.tender_id
      left join cand_stats cs on cs.tender_id = k.tender_id
     order by k.contract_created_at desc nulls last
  `,

  /*
   * 3 — the linkable cohort, for the one-off / operator-driven options. `locked_at` is the only
   * honest `establishedAt` for a POST_AWARD_LINKED record; whether it PRECEDES the award is exactly
   * what decides whether calling it "post-award" would itself be a misstatement.
   */
  linkable: `${BASE_CTE}
    select l.id, l.tenant_id, l.title, l.reference, l.tender_value,
           (l.award_evidence is not null) as has_award_evidence,
           cs.n_baselines, cs.min_total as baseline_total, cs.first_locked_at as locked_at,
           a.awarded_at,
           case
             when a.awarded_at is null               then 'AWARD_DATE_UNKNOWN'
             when cs.first_locked_at <= a.awarded_at then 'BASELINE_PREDATES_AWARD'
             else 'BASELINE_LOCKED_AFTER_AWARD'
           end as lock_vs_award,
           coalesce(ks.n_contracts, 0) as n_contracts
      from legacy l
      join cand_stats cs on cs.tender_id = l.id and cs.n_baselines = 1
      left join awarded_event a on a.tender_id = l.id::text
      left join con_stats ks on ks.tender_id = l.id
     order by cs.first_locked_at desc nulls last
  `,
};

/* ── report helpers ──────────────────────────────────────────────────────────────────────────── */
const out = [];
const say = (s = '') => {
  if (!AS_JSON) console.log(s);
  out.push(s);
};
const num = (v) => (v === null || v === undefined ? '—' : Number(v).toLocaleString('en-US'));

function table(rows, limit) {
  if (!rows.length) {
    say('   (none)');
    return;
  }
  const shown = limit > 0 ? rows.slice(0, limit) : [];
  for (const r of shown) {
    say(`   · ${Object.entries(r).map(([k, v]) => `${k}=${v === null ? '—' : v}`).join('  ')}`);
  }
  if (limit > 0 && rows.length > shown.length) {
    say(`   … ${rows.length - shown.length} more (raise --detail)`);
  }
}

/** Run the five cohort queries once, for whatever slice of the data is currently visible. */
async function gather(client, tenantFilter) {
  const p = [tenantFilter];
  // Sequential, deliberately: one client cannot run concurrent queries, and this is an audit — the
  // five results must describe the same transaction snapshot, not race each other.
  const population = await client.query(QUERIES.population, p);
  const matrix = await client.query(QUERIES.matrix, p);
  const ambiguous = await client.query(QUERIES.ambiguous, p);
  const contracts = await client.query(QUERIES.contracts, p);
  const linkable = await client.query(QUERIES.linkable, p);
  return { population, matrix, ambiguous, contracts, linkable };
}

const POPULATION_KEYS = [
  'won_total', 'with_basis', 'without_basis', 'without_basis_governed_award',
  'without_basis_legacy_won', 'without_basis_no_award_event', 'tenants_with_won',
];

/** Fold per-tenant passes into one set of numbers. Counts add; detail rows concatenate. */
function merge(passes) {
  const population = Object.fromEntries(POPULATION_KEYS.map((k) => [k, 0]));
  for (const pass of passes) {
    const row = pass.population.rows[0] ?? {};
    for (const k of POPULATION_KEYS) population[k] += Number(row[k] ?? 0);
  }
  const buckets = new Map();
  for (const pass of passes) {
    for (const r of pass.matrix) {
      const key = `${r.baseline_bucket}|${r.contract_bucket}`;
      buckets.set(key, (buckets.get(key) ?? 0) + Number(r.tenders));
    }
  }
  const matrix = [...buckets.entries()]
    .map(([key, tenders]) => {
      const [baseline_bucket, contract_bucket] = key.split('|');
      return { baseline_bucket, contract_bucket, tenders };
    })
    .sort((a, b) => a.baseline_bucket.localeCompare(b.baseline_bucket)
      || a.contract_bucket.localeCompare(b.contract_bucket));
  const flat = (name) => passes.flatMap((pass) => pass[name].rows);
  return {
    population,
    matrix,
    ambiguous: flat('ambiguous'),
    contracts: flat('contracts'),
    linkable: flat('linkable'),
  };
}

async function main() {
  const pool = new Pool({ connectionString: URL, max: 1 });
  const client = await pool.connect();
  const result = {};
  try {
    // Read-only, twice over: the session default AND the explicit transaction mode.
    await client.query('SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY');
    await client.query('BEGIN READ ONLY');

    const who = await client.query(
      `select current_user, current_database(),
              (select rolsuper from pg_roles where rolname = current_user)     as is_super,
              (select rolbypassrls from pg_roles where rolname = current_user) as bypasses_rls,
              public.current_tenant_id()                                       as bound_tenant`,
    );
    const w = who.rows[0];
    const canBypass = w.is_super === true || w.bypasses_rls === true;

    say('═══════════════════════════════════════════════════════════════════════════════');
    say(' AUDIT — legacy tender awards with no pinned commercial basis (ADR-0021 / 0256)');
    say('═══════════════════════════════════════════════════════════════════════════════');
    // Name the SERVER, not just the database. "postgres" is the database name on dev and on every
    // Supabase project alike, so it alone cannot tell an operator which environment they just read.
    // Host/port/path only — never the credential.
    let target = '(unparseable connection string)';
    try {
      const u = new global.URL(URL);
      target = `${u.hostname}${u.port ? `:${u.port}` : ''}${u.pathname}`;
    } catch {
      /* keep the placeholder */
    }
    say(` target:   ${target}`);
    say(` database: ${w.current_database}   role: ${w.current_user}   bypasses RLS: ${canBypass}`);
    say(' mode: READ ONLY transaction — no write is possible from this script');
    say(` tenant filter: ${TENANTS.length ? TENANTS.join(', ') : '(none — whole database)'}`);
    say('');

    /*
     * VISIBILITY GUARD — the reason this audit can be believed.
     *
     * Every tenant-scoped table is FORCE ROW LEVEL SECURITY, and the policy is
     * `tenant_id = current_tenant_id() AND current_tenant_id() IS NOT NULL`. So a role that cannot
     * bypass RLS, with no tenant bound, sees exactly zero rows — and would report "0 legacy awards"
     * for a database full of them. That is the one failure mode this script must never have, so it
     * refuses outright rather than inferring absence from silence.
     */
    if (!canBypass && TENANTS.length === 0) {
      say('❌ REFUSING TO REPORT — this role cannot bypass RLS and no tenant is bound.');
      say(`   current_user=${w.current_user}  current_tenant_id()=${w.bound_tenant ?? 'NULL'}`);
      say('   Under FORCE row-level security this session sees 0 rows in EVERY tenant-scoped table,');
      say('   so any count it printed would be indistinguishable from an empty database.');
      say('');
      say('   Re-run either way:');
      say('     · as a BYPASSRLS / superuser role  (whole-database pass, preferred for an audit)');
      say('     · with --tenants=<id,...>          (binds each tenant in turn and sums the passes)');
      process.exitCode = 3;
      return;
    }

    const est = await client.query(
      `select (select reltuples::bigint from pg_class
                where oid = 'public.aura_tendering_tenders'::regclass) as est,
              (select count(*) from public.aura_tendering_tenders)     as visible`,
    );
    const estimate = est.rows[0].est === null ? -1 : Number(est.rows[0].est);
    const visible = Number(est.rows[0].visible);
    // reltuples is -1 for a table ANALYZE has never seen: "unknown", not "empty". Say so.
    const estText = estimate < 0 ? 'unknown — never ANALYZEd' : `~${num(estimate)}`;
    say(` visibility: ${num(visible)} tender rows visible (planner estimate ${estText})`);
    if (visible === 0 && estimate !== 0) {
      say('   ⚠ 0 rows visible and the estimate does not confirm an empty table. Treat the counts');
      say('     below as UNPROVEN until re-run on an environment that actually holds tenders.');
    }
    say('');

    // One pass when the role sees everything; otherwise bind each tenant in turn, since RLS is what
    // decides visibility — a WHERE clause alone would silently return nothing.
    const passes = [];
    if (canBypass) {
      passes.push(await gather(client, TENANTS.length ? TENANTS : null));
    } else {
      for (const tenant of TENANTS) {
        // `true` = local to this transaction; the transaction is READ ONLY and rolled back.
        await client.query("select set_config('app.current_tenant_id', $1, true)", [tenant]);
        passes.push(await gather(client, [tenant]));
      }
    }
    const merged = merge(passes);
    const { matrix, ambiguous, contracts, linkable } = merged;

    const P = merged.population;
    result.population = P;
    say('─── 1. WON POPULATION ─────────────────────────────────────────────────────────');
    say(`   won tenders total .......................... ${num(P.won_total)}   across ${num(P.tenants_with_won)} tenant(s)`);
    say(`   ├─ with a pinned commercial basis .......... ${num(P.with_basis)}`);
    say(`   └─ COHORT A: commercial_basis IS NULL ...... ${num(P.without_basis)}`);
    say(`        ├─ governed award, no basis ........... ${num(P.without_basis_governed_award)}  (award_evidence present)`);
    say(`        ├─ LEGACY_WON, no evidence at all ..... ${num(P.without_basis_legacy_won)}`);
    say(`        └─ no tendering.tender.awarded event .. ${num(P.without_basis_no_award_event)}  (never went through award())`);
    say('');

    result.matrix = matrix;
    say('─── 2. COHORT A CROSS-TAB — baseline present × contract present ───────────────');
    if (!matrix.length) say('   (cohort A is empty)');
    for (const r of matrix) {
      say(`   ${r.baseline_bucket.padEnd(15)} × ${r.contract_bucket.padEnd(13)} = ${num(r.tenders)}`);
    }
    say('');

    result.linkable = linkable;
    say('─── 3. COHORT B(1) — exactly ONE candidate baseline (the linkable cohort) ──────');
    say(`   tenders: ${num(linkable.length)}`);
    const lockSplit = {};
    for (const r of linkable) lockSplit[r.lock_vs_award] = (lockSplit[r.lock_vs_award] ?? 0) + 1;
    for (const [k, v] of Object.entries(lockSplit)) say(`   ├─ ${k.padEnd(28)} ${num(v)}`);
    say('   (BASELINE_PREDATES_AWARD means calling the link "POST_AWARD_LINKED" with locked_at');
    say('    would record a basis that already existed at the award — a different claim.)');
    table(linkable, DETAIL);
    say('');

    result.ambiguous = ambiguous;
    say('─── 4. COHORT E — MORE THAN ONE candidate baseline (the dangerous group) ───────');
    say(`   tenders with 2+ candidate baselines ........ ${num(ambiguous.length)}`);
    const money = ambiguous.filter((r) => Number(r.n_distinct_totals) > 1).length;
    const disagree = ambiguous.filter((r) => r.pickers_disagree_on_money === true).length;
    const tied = ambiguous.filter((r) => Number(r.distinct_totals_at_best_rank) > 1).length;
    say(`   ├─ where the totals actually DIFFER ........ ${num(money)}   (ambiguity that moves money)`);
    say(`   ├─ two defensible pickers disagree ......... ${num(disagree)}   (best-status vs latest-lock)`);
    say(`   └─ tied at the best status, different total  ${num(tied)}   (the OLD resolver was non-deterministic here)`);
    table(ambiguous, DETAIL);
    say('');

    result.contracts = contracts;
    say('─── 5/6. COHORT C+D — contracts that ALREADY exist on basis-less tenders ───────');
    say(`   contracts: ${num(contracts.length)}`);
    const byClass = {};
    for (const r of contracts) byClass[r.value_classification] = (byClass[r.value_classification] ?? 0) + 1;
    for (const [k, v] of Object.entries(byClass)) say(`   ├─ ${k.padEnd(28)} ${num(v)}`);
    const declared = contracts.filter((r) => r.declares_baseline === true).length;
    const declaredNotCand = contracts.filter(
      (r) => r.declares_baseline === true && r.declared_baseline_is_a_candidate === false,
    ).length;
    const declaredValueMismatch = contracts.filter(
      (r) => r.declared_baseline_total !== null
        && Math.abs(Number(r.contract_value) - Number(r.declared_baseline_total)) >= 0.01,
    ).length;
    say(`   declared provenance (commercial_baseline_id set) ... ${num(declared)} of ${num(contracts.length)}`);
    say(`   ├─ declared baseline is NOT a candidate for that tender ... ${num(declaredNotCand)}`);
    say(`   └─ declared baseline total ≠ contract value ............... ${num(declaredValueMismatch)}`);
    say('   (These are SURFACED, never corrected here. 0256\'s trigger refuses re-basing, and a');
    say('    contract built on the old estimate fallback is a separate remediation decision.)');
    table(contracts, DETAIL);
    say('');
    say('═══ END OF AUDIT — nothing was written ════════════════════════════════════════');
  } finally {
    await client.query('ROLLBACK').catch(() => undefined);
    client.release();
    await pool.end().catch(() => undefined);
  }
  if (AS_JSON) console.log(JSON.stringify(result, null, 2));
}

// Only audit when RUN; importing this module (to reuse `QUERIES`) must not open a connection.
const invokedDirectly = process.argv[1]
  && import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  main().catch((err) => {
    console.error(`❌ audit failed: ${err.message}`);
    process.exit(1);
  });
}

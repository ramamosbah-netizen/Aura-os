// Backfill: wrap existing tender estimates into the Pre-Award Package model, and link pricing sheets
// to packages. Uses the SHARED estimation core (summariseEstimate) — never re-implements the math.
// Idempotent (skips owners that already have a package). Reconcile-gated: computes each estimate's
// totals, re-derives them, and ROLLS BACK on any diff. DRY-RUN by default — set BACKFILL_APPLY=1 to
// commit. Run: pnpm --filter @aura/api exec node scripts/backfill-pre-award.mjs
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { config } from 'dotenv';
import pg from 'pg';
import { summariseEstimate } from '@aura/tendering';

const apiRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
config({ path: join(apiRoot, '.env.local') });
const connectionString = (process.env.MIGRATION_DATABASE_URL || process.env.DATABASE_URL || '').trim();
if (!connectionString) { console.error('✗ no MIGRATION_DATABASE_URL/DATABASE_URL'); process.exit(1); }
const sslOff = /(@|\/\/)(localhost|127\.0\.0\.1)/.test(connectionString) || /sslmode=disable/.test(connectionString);
const client = new pg.Client({ connectionString, ssl: sslOff ? false : { rejectUnauthorized: false } });
const APPLY = process.env.BACKFILL_APPLY === '1';
const num = (v) => (v == null ? 0 : Number(v));
// Canonical (recursively key-sorted) JSON — jsonb does NOT preserve key order, so equality must be
// SEMANTIC, not raw-string. Numbers round-trip as numbers, so value equality holds.
const canon = (v) => (Array.isArray(v) ? v.map(canon)
  : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, canon(v[k])]))
  : v);
const sameJson = (a, b) => JSON.stringify(canon(a)) === JSON.stringify(canon(b));
// FORCE-RLS tables need the tenant GUC bound (harmless if the role bypasses RLS).
const bindTenant = (t) => client.query("select set_config('app.current_tenant_id', $1, true)", [t ?? '']);

async function main() {
  await client.connect();
  await client.query('BEGIN');
  const created = { packages: 0, basis: 0, estimates: 0, buildups: 0, sheets: 0 };
  const log = [];
  let reconcileOk = true;

  // ── Tender-route packages from existing rate build-ups ──
  const { rows: bu } = await client.query('select * from public.aura_tendering_rate_buildups order by tender_id, boq_item_id');
  const byTender = new Map();
  for (const b of bu) { if (!byTender.has(b.tender_id)) byTender.set(b.tender_id, []); byTender.get(b.tender_id).push(b); }

  for (const [tenderId, buildups] of byTender) {
    const exists = await client.query('select id from public.aura_crm_pre_award_packages where tender_id=$1', [tenderId]);
    if (exists.rows.length) { log.push(`tender ${tenderId}: package exists → skip`); continue; }
    const tenantId = buildups[0].tenant_id, companyId = buildups[0].company_id;
    await bindTenant(tenantId);
    const boqRes = await client.query('select * from public.aura_tendering_boqs where tender_id=$1 limit 1', [tenderId]);
    if (!boqRes.rows.length) { log.push(`tender ${tenderId}: no BOQ → skip`); continue; }
    const boq = boqRes.rows[0];
    const itemsRes = await client.query('select * from public.aura_tendering_boq_items where boq_id=$1', [boq.id]);
    const itemsDom = itemsRes.rows.map((i) => ({ id: i.id, quantity: num(i.quantity), totalAmount: num(i.total_amount) }));
    const buDom = buildups.map((b) => ({
      boqItemId: b.boq_item_id, components: b.components ?? [],
      directCost: num(b.direct_cost), indirectAmount: num(b.indirect_amount), overheadAmount: num(b.overhead_amount),
      riskAmount: num(b.risk_amount), profitAmount: num(b.profit_amount), sellingRate: num(b.selling_rate),
    }));
    const totals = summariseEstimate(boq.id, tenderId, itemsDom, buDom);

    const pkgId = randomUUID(), basisId = randomUUID(), estId = randomUUID();
    await client.query(
      "insert into public.aura_crm_pre_award_packages (id,tenant_id,company_id,tender_id,route,status,created_by) values ($1,$2,$3,$4,'tender','open','backfill')",
      [pkgId, tenantId, companyId, tenderId]); created.packages++;
    const lines = itemsRes.rows.map((i) => ({ lineId: i.id, description: i.description, unit: i.unit, quantity: num(i.quantity), sourceLineId: i.id }));
    await client.query(
      "insert into public.aura_crm_estimation_basis_revisions (id,tenant_id,company_id,package_id,revision_no,source_kind,source_id,source_rev_ref,status,lines,created_by,approved_by,approved_at) values ($1,$2,$3,$4,1,'boq',$5,$6,'approved',$7,'backfill','backfill',now())",
      [basisId, tenantId, companyId, pkgId, boq.id, `boq:${boq.id}`, JSON.stringify(lines)]); created.basis++;
    await client.query(
      "insert into public.aura_crm_estimate_revisions (id,tenant_id,company_id,package_id,basis_revision_id,revision_no,status,totals,created_by,frozen_by,frozen_at) values ($1,$2,$3,$4,$5,1,'frozen',$6,'backfill','backfill',now())",
      [estId, tenantId, companyId, pkgId, basisId, JSON.stringify(totals)]); created.estimates++;
    for (const b of buildups) {
      await client.query(
        "insert into public.aura_crm_estimate_build_ups (id,tenant_id,company_id,estimate_revision_id,basis_line_id,components,resources,indirect_percent,overhead_percent,risk_percent,profit_percent,direct_cost,indirect_amount,overhead_amount,risk_amount,profit_amount,selling_rate,notes,created_by) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,'backfill')",
        [randomUUID(), b.tenant_id, b.company_id, estId, b.boq_item_id, JSON.stringify(b.components ?? []), b.resources ? JSON.stringify(b.resources) : null,
         num(b.indirect_percent), num(b.overhead_percent), num(b.risk_percent), num(b.profit_percent),
         num(b.direct_cost), num(b.indirect_amount), num(b.overhead_amount), num(b.risk_amount), num(b.profit_amount), num(b.selling_rate), b.notes]);
      created.buildups++;
    }
    // Reconcile (semantic): stored totals equal a fresh re-derivation, build-up rows all landed, and
    // each selling_rate copied verbatim (component/decimal-exact by construction).
    const back = await client.query('select totals from public.aura_crm_estimate_revisions where id=$1', [estId]);
    const fresh = summariseEstimate(boq.id, tenderId, itemsDom, buDom);
    const totalsOk = sameJson(back.rows[0].totals, fresh);
    const cntRes = await client.query('select count(*)::int n, coalesce(sum(selling_rate),0) s from public.aura_crm_estimate_build_ups where estimate_revision_id=$1', [estId]);
    const cntOk = cntRes.rows[0].n === buildups.length;
    const sellOk = num(cntRes.rows[0].s) === buildups.reduce((a, b) => a + num(b.selling_rate), 0);
    const ok = totalsOk && cntOk && sellOk;
    if (!ok) reconcileOk = false;
    log.push(`tender ${tenderId}: pkg+basis+estimate+${buildups.length} buildups · selling=${totals.totalSellingValue} · reconcile=${ok ? 'OK' : `DIFF(totals:${totalsOk} cnt:${cntOk} sell:${sellOk})`}`);
  }

  // ── Link existing pricing sheets to a package ──
  const sheetsRes = await client.query('select id, opportunity_id from public.aura_crm_pricing_sheets where package_id is null and opportunity_id is not null');
  for (const s of sheetsRes.rows) {
    const oppRes = await client.query('select id, tenant_id, company_id, tender_id from public.aura_crm_opportunities where id=$1', [s.opportunity_id]);
    if (!oppRes.rows.length) { log.push(`sheet ${s.id}: opp missing → skip`); continue; }
    const o = oppRes.rows[0];
    await bindTenant(o.tenant_id);
    let pkgId;
    if (o.tender_id) {
      const r = await client.query('select id from public.aura_crm_pre_award_packages where tender_id=$1', [o.tender_id]);
      pkgId = r.rows[0]?.id;
      if (!pkgId) { pkgId = randomUUID(); await client.query("insert into public.aura_crm_pre_award_packages (id,tenant_id,company_id,tender_id,route,status,created_by) values ($1,$2,$3,$4,'tender','open','backfill')", [pkgId, o.tenant_id, o.company_id, o.tender_id]); created.packages++; }
    } else {
      const r = await client.query('select id from public.aura_crm_pre_award_packages where opportunity_id=$1', [o.id]);
      pkgId = r.rows[0]?.id;
      if (!pkgId) { pkgId = randomUUID(); await client.query("insert into public.aura_crm_pre_award_packages (id,tenant_id,company_id,opportunity_id,route,status,created_by) values ($1,$2,$3,$4,'direct','open','backfill')", [pkgId, o.tenant_id, o.company_id, o.id]); created.packages++; }
    }
    await client.query('update public.aura_crm_pricing_sheets set package_id=$1 where id=$2', [pkgId, s.id]);
    created.sheets++;
  }

  console.log('created:', JSON.stringify(created));
  for (const l of log) console.log(' -', l);

  if (!reconcileOk) { console.error('✗ RECONCILE FAILED → ROLLBACK'); await client.query('ROLLBACK'); await client.end(); process.exit(2); }
  if (!APPLY) { console.log('DRY-RUN (set BACKFILL_APPLY=1 to commit) → ROLLBACK'); await client.query('ROLLBACK'); }
  else { await client.query('COMMIT'); console.log('✓ COMMITTED'); }
  await client.end();
}
main().catch(async (e) => { console.error(e); try { await client.query('ROLLBACK'); } catch { /* noop */ } try { await client.end(); } catch { /* noop */ } process.exit(1); });

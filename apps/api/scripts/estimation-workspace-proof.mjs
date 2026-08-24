// Slice-6B vertical-slice PROOF — structured resource estimation on live Postgres (BEGIN…ROLLBACK).
//
// Proves the backend contract BEFORE the Estimation Workspace UI exists:
//   1. a ResourceBreakdown (Materials/Labour/Plant/Subcontract/Other) round-trips through Postgres —
//      write → reload → SAME resources, and the SAME estimatedCost.
//   2. estimatedCost is DERIVED from the saved resource data, never a number the caller supplied.
//   3. basisLineId stays stable Requirement → BasisLine → EstimateBuildUp even after a resource edit.
//   4. a DRAFT estimate edits freely; once FROZEN/APPROVED it refuses edits and a new revision is made.
// Run: pnpm --filter @aura/api exec node scripts/estimation-workspace-proof.mjs
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { config } from 'dotenv';
import pg from 'pg';
import {
  PostgresPreAwardPackageStore, PostgresPricingSheetStore, PreAwardPackageService,
} from '@aura/crm';

const apiRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
config({ path: join(apiRoot, '.env.local') });
const cs = (process.env.MIGRATION_DATABASE_URL || process.env.DATABASE_URL || '').trim();
if (!cs) { console.error('no db url'); process.exit(1); }
const sslOff = /(@|\/\/)(localhost|127\.0\.0\.1)/.test(cs) || /sslmode=disable/.test(cs);
const pool = new pg.Pool({ connectionString: cs, ssl: sslOff ? false : { rejectUnauthorized: false } });
const assert = (c, m) => { if (!c) throw new Error('ASSERT FAILED: ' + m); console.log('  ✓', m); };

async function main() {
  const client = await pool.connect();
  const one = { query: (...a) => client.query(...a) };
  const store = new PostgresPreAwardPackageStore(one);
  const packages = new PreAwardPackageService(store, new PostgresPricingSheetStore(one));

  try {
    const src = (await client.query(`select * from public.aura_crm_opportunities where tender_id is null limit 1`)).rows[0];
    if (!src) { console.log('no direct opportunity to clone; nothing to prove on'); return; }
    const tenantId = src.tenant_id;
    await client.query('BEGIN');

    const oppId = randomUUID();
    const cols = Object.keys(src);
    await client.query(
      `insert into public.aura_crm_opportunities (${cols.join(',')}) values (${cols.map((_, i) => `$${i + 1}`).join(',')})`,
      cols.map((c) => (c === 'id' ? oppId : c === 'execution_type' ? 'direct_sale' : src[c])),
    );
    const pkg = await packages.openDirect({ tenantId, companyId: src.company_id, opportunityId: oppId, createdBy: '6b-proof' });

    // Approved basis: two scope lines with stable ids and real quantities.
    const basis = await packages.addScopeBasis({
      tenantId, companyId: src.company_id, packageId: pkg.id, sourceId: randomUUID(), sourceRevRef: 'scope-assist:v1',
      lines: [
        { lineId: 'S-CCTV', description: 'CCTV camera installation', unit: 'no', quantity: 12, sourceLineId: 'REQ-CCTV' },
        { lineId: 'S-CABLE', description: 'CAT6 cabling', unit: 'm', quantity: 480, sourceLineId: 'REQ-CABLE' },
      ],
      createdBy: '6b-proof',
    });
    await packages.approveScopeBasisById(tenantId, pkg.id, basis.id, 'manager');

    // ── Open Estimation with NO build-ups ⇒ seeded one zero-cost row per basis line ──
    const opened = await packages.addEstimate({ tenantId, companyId: src.company_id, packageId: pkg.id, basisRevisionId: basis.id, lines: basis.lines, buildUps: [], createdBy: '6b-proof' });
    assert(opened.buildUps.length === 2, 'Open Estimation seeds one build-up per approved basis line');
    assert(opened.estimate.totals.estimatedCost === 0, 'a freshly seeded estimate costs 0 until resources are entered');
    assert(opened.buildUps.every((b) => ['S-CCTV', 'S-CABLE'].includes(b.basisLineId)), 'seeded build-ups keep the basis line ids');

    // ── Edit the DRAFT with structured resources (Materials/Labour/Plant) ──
    // CCTV line (qty 12): supply 800/unit, technician 24h @ 55 (line total), transport 300 (line total).
    // CABLE line (qty 480): supply 6/unit + 5% wastage, technician 40h @ 45 (line total).
    const cctvResources = { supplyUnitPrice: 800, technician: { count: 1, hours: 24, rate: 55 }, transport: 300 };
    const cableResources = { supplyUnitPrice: 6, wastagePercent: 5, technician: { count: 1, hours: 40, rate: 45 } };
    const edited = await packages.updateEstimateBuildUps({
      tenantId, companyId: src.company_id, packageId: pkg.id, estimateId: opened.estimate.id,
      buildUps: [
        { basisLineId: 'S-CCTV', resources: cctvResources, overheadPercent: 10 },
        { basisLineId: 'S-CABLE', resources: cableResources, overheadPercent: 10 },
      ],
      actorId: 'estimator-1',
    });
    const estimatedCostAfterEdit = edited.estimate.totals.estimatedCost;
    assert(estimatedCostAfterEdit > 0, `editing resources derives a real estimated cost (${estimatedCostAfterEdit})`);

    // DERIVED-NOT-TYPED invariant: the headline total must equal the sum, over the build-up rows the
    // engine produced, of per-unit (direct + indirect + overhead + risk) × line quantity. Recomputing
    // from the rows (not a hand-coded constant) is what proves estimatedCost is auditable — a typed-in
    // total would not reconcile against the resource data underneath it.
    const qtyOf = (id) => basis.lines.find((l) => l.lineId === id).quantity;
    const derived = Math.round(edited.buildUps.reduce(
      (s, b) => s + (b.directCost + b.indirectAmount + b.overheadAmount + b.riskAmount) * qtyOf(b.basisLineId), 0) * 100) / 100;
    assert(derived === estimatedCostAfterEdit, `estimatedCost ${estimatedCostAfterEdit} reconciles to the persisted build-up rows ${derived} (derived, not typed)`);
    // Sanity: CCTV line direct = material 800 + labour (24h/12=2 @55=110) + transport (300/12=25) = 935.
    const cctvBu = edited.buildUps.find((b) => b.basisLineId === 'S-CCTV');
    assert(cctvBu.directCost === 935, `the engine costs the resource sheet (CCTV direct = 935, got ${cctvBu.directCost})`);

    // ── PG ROUND-TRIP: reload the build-ups and confirm resources + cost survived ──
    const reloaded = await store.listBuildUps(tenantId, opened.estimate.id);
    const cctv = reloaded.find((b) => b.basisLineId === 'S-CCTV');
    assert(!!cctv && !!cctv.resources, 'resources round-trip through Postgres (not dropped to null)');
    assert(cctv.resources.supplyUnitPrice === 800 && cctv.resources.technician.hours === 24 && cctv.resources.transport === 300,
      'the reloaded ResourceBreakdown is byte-faithful (supply, technician hours, transport)');
    const reloadedEstimate = (await store.listEstimates(tenantId, pkg.id)).find((e) => e.id === opened.estimate.id);
    assert(reloadedEstimate.totals.estimatedCost === estimatedCostAfterEdit, 'the reloaded estimate carries the same estimatedCost');
    assert(!('totalSellingValue' in reloadedEstimate.totals), 'the estimate carries NO selling value (boundary held)');

    // ── LIFECYCLE: draft edits freely; frozen refuses; a new revision works ──
    const reEdited = await packages.updateEstimateBuildUps({
      tenantId, companyId: src.company_id, packageId: pkg.id, estimateId: opened.estimate.id,
      buildUps: [
        { basisLineId: 'S-CCTV', resources: { ...cctvResources, supplyUnitPrice: 900 }, overheadPercent: 10 },
        { basisLineId: 'S-CABLE', resources: cableResources, overheadPercent: 10 },
      ], actorId: 'estimator-1',
    });
    assert(reEdited.estimate.totals.estimatedCost !== estimatedCostAfterEdit, 'a DRAFT estimate edits freely (cost changed on re-edit)');

    const frozen = await packages.freezeEstimateRevision(reEdited.estimate, 'estimator-1');
    let editRefused = false;
    try {
      await packages.updateEstimateBuildUps({ tenantId, companyId: src.company_id, packageId: pkg.id, estimateId: frozen.id, buildUps: [{ basisLineId: 'S-CCTV', resources: cctvResources }], actorId: 'x' });
    } catch { editRefused = true; }
    assert(editRefused, 'a FROZEN estimate refuses further edits (immutable once referenced)');

    await packages.approveEstimateRevision(frozen, 'manager');
    // A change after approval is a NEW revision E-002 on the same basis.
    const e2 = await packages.addEstimate({ tenantId, companyId: src.company_id, packageId: pkg.id, basisRevisionId: basis.id, lines: basis.lines, buildUps: [], createdBy: '6b-proof' });
    assert(e2.estimate.revisionNo === 2, 'a change after approval becomes E-002, not an edit of E-001');
    assert(e2.buildUps.every((b) => ['S-CCTV', 'S-CABLE'].includes(b.basisLineId)), 'E-002 still carries the same basis line ids (provenance stable across revisions)');

    await client.query('ROLLBACK');
    console.log('ROLLBACK done');
    const left = (await client.query(`select 1 from public.aura_crm_opportunities where id=$1`, [oppId])).rowCount;
    assert(left === 0, 'NOTHING left behind (fixture opportunity gone)');

    console.log('\n6B VERTICAL-SLICE PROOF PASSED — resources round-trip, estimatedCost is derived, lifecycle holds.');
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch { /* best-effort */ }
    throw e;
  } finally {
    client.release();
    await pool.end();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });

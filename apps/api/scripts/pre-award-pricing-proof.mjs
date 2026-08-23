// Slice-4 Step A PROOF — pricingFrozen is REAL, on live Postgres, with ZERO data left behind.
//
// Runs the whole Direct Pre-Award chain (open → scope → approve → estimate → approve → freezePricing)
// through the POSTGRES stores against the live DB, then asserts governance.pricingFrozen flips true
// ONLY once a real frozen pricing_sheets row exists linked to the package + approved estimate.
//
// Isolation: everything runs on ONE client inside BEGIN … ROLLBACK on a throwaway fixture opportunity
// (cloned from a real row, new id). Nothing is committed — verified by re-reading after rollback.
// Run: pnpm --filter @aura/api exec node scripts/pre-award-pricing-proof.mjs
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { config } from 'dotenv';
import pg from 'pg';
import { PostgresPreAwardPackageStore, PostgresPricingSheetStore, PreAwardPackageService } from '@aura/crm';

const apiRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
config({ path: join(apiRoot, '.env.local') });
const cs = (process.env.MIGRATION_DATABASE_URL || process.env.DATABASE_URL || '').trim();
if (!cs) { console.error('no db url'); process.exit(1); }
const sslOff = /(@|\/\/)(localhost|127\.0\.0\.1)/.test(cs) || /sslmode=disable/.test(cs);
const pool = new pg.Pool({ connectionString: cs, ssl: sslOff ? false : { rejectUnauthorized: false } });

const assert = (cond, msg) => { if (!cond) throw new Error('ASSERT FAILED: ' + msg); console.log('  ✓', msg); };

async function main() {
  const client = await pool.connect();
  // A single-client shim satisfying the stores' Pool.query surface — so every store call rides the
  // one transaction we can roll back.
  const oneClient = { query: (...args) => client.query(...args) };
  const store = new PostgresPreAwardPackageStore(oneClient);
  const pricing = new PostgresPricingSheetStore(oneClient);
  const svc = new PreAwardPackageService(store, pricing);

  let fixtureOppId = null;
  try {
    // Pick a real DIRECT opportunity to clone its shape (columns + tenant), so FKs hold.
    const src = (await client.query(
      `select * from public.aura_crm_opportunities where tender_id is null limit 1`)).rows[0];
    if (!src) { console.log('no direct opportunity to clone; nothing to prove on'); return; }
    const tenantId = src.tenant_id;
    const companyId = src.company_id;

    await client.query('BEGIN');
    await client.query("select set_config('app.current_tenant_id', $1, true)", [tenantId]);

    // Clone the row with a NEW id → a throwaway fixture opportunity (rolled back at the end).
    fixtureOppId = randomUUID();
    const cols = Object.keys(src);
    const vals = cols.map((c) => (c === 'id' ? fixtureOppId : src[c]));
    const ph = cols.map((_, i) => `$${i + 1}`).join(',');
    await client.query(`insert into public.aura_crm_opportunities (${cols.join(',')}) values (${ph})`, vals);
    console.log('fixture opportunity', fixtureOppId, 'tenant', tenantId);

    const g0 = await svc.governance(tenantId, fixtureOppId);
    assert(g0.governed === false, 'ungoverned before any package exists');

    const pkg = await svc.openDirect({ tenantId, companyId, opportunityId: fixtureOppId, createdBy: 'pricing-proof' });
    const lines = [{ lineId: 'L1', description: 'IP camera', unit: 'no', quantity: 10, sourceLineId: 'S1' }];
    let basis = await svc.addScopeBasis({ tenantId, companyId, packageId: pkg.id, sourceId: 'scope-proof', lines, createdBy: 'pricing-proof' });
    basis = await svc.approveScopeBasis(basis, 'pricing-proof');
    const { estimate } = await svc.addEstimate({ tenantId, companyId, packageId: pkg.id, basisRevisionId: basis.id, lines,
      buildUps: [{ basisLineId: 'L1', components: [{ costType: 'material', description: 'Camera', quantity: 1, unitCost: 800 }], overheadPercent: 10, profitPercent: 15 }], createdBy: 'pricing-proof' });
    const fe = await svc.freezeEstimateRevision(estimate, 'pricing-proof');
    const approvedEstimate = await svc.approveEstimateRevision(fe, 'pricing-proof');

    const gBefore = await svc.governance(tenantId, fixtureOppId);
    console.log('governance before pricing freeze', JSON.stringify(gBefore));
    assert(gBefore.scopeApproved && gBefore.estimateApproved, 'scope + estimate approved');
    assert(gBefore.pricingFrozen === false, 'pricingFrozen is FALSE with no frozen pricing sheet (no fake readiness)');

    // The real freeze — creates a frozen pricing_sheets row.
    const sheet = await svc.freezePricing({ tenantId, companyId, opportunityId: fixtureOppId, actorId: 'pricing-proof' });
    assert(sheet.status === 'frozen', 'freezePricing produced a FROZEN sheet');
    assert(sheet.packageId === pkg.id, 'sheet linked to the package');
    assert(sheet.estimateRevisionId === approvedEstimate.id, 'sheet linked to the approved estimate revision');

    // Prove the row physically exists in aura_crm_pricing_sheets with the links.
    const dbRow = (await client.query(
      `select id, status, package_id, estimate_revision_id, total_sell from public.aura_crm_pricing_sheets where id=$1`, [sheet.id])).rows[0];
    assert(!!dbRow, 'frozen pricing sheet is physically present in aura_crm_pricing_sheets');
    assert(dbRow.status === 'frozen' && dbRow.package_id === pkg.id && dbRow.estimate_revision_id === approvedEstimate.id,
      'DB row carries status=frozen + package_id + estimate_revision_id');
    assert(Number(dbRow.total_sell) === Number(approvedEstimate.totals.totalSellingValue),
      `sheet total_sell (${dbRow.total_sell}) reproduces the approved estimate selling value (${approvedEstimate.totals.totalSellingValue})`);

    const gAfter = await svc.governance(tenantId, fixtureOppId);
    console.log('governance after pricing freeze ', JSON.stringify(gAfter));
    assert(gAfter.pricingFrozen === true, 'pricingFrozen is TRUE — derived from the real frozen sheet');

    // Idempotent: a second freeze returns the same sheet, no duplicate.
    const again = await svc.freezePricing({ tenantId, companyId, opportunityId: fixtureOppId, actorId: 'pricing-proof' });
    assert(again.id === sheet.id, 'freezePricing is idempotent (same sheet id)');
    const count = Number((await client.query(
      `select count(*)::int as n from public.aura_crm_pricing_sheets where package_id=$1 and status='frozen'`, [pkg.id])).rows[0].n);
    assert(count === 1, 'exactly ONE frozen pricing sheet for the package');

    await client.query('ROLLBACK');
    console.log('ROLLBACK done');

    // Prove isolation: after rollback nothing persisted.
    const leftPkg = (await client.query(`select 1 from public.aura_crm_pre_award_packages where id=$1`, [pkg.id])).rowCount;
    const leftOpp = (await client.query(`select 1 from public.aura_crm_opportunities where id=$1`, [fixtureOppId])).rowCount;
    const leftSheet = (await client.query(`select 1 from public.aura_crm_pricing_sheets where id=$1`, [sheet.id])).rowCount;
    assert(leftPkg === 0 && leftOpp === 0 && leftSheet === 0, 'NOTHING left behind (package + opportunity + sheet all gone)');

    console.log('\nPROOF PASSED — pricingFrozen is real and isolated.');
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch { /* best-effort */ }
    throw e;
  } finally {
    client.release();
    await pool.end();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });

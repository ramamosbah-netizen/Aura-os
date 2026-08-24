// Slice-5 CLOSING PROOF — the full governed journey on live Postgres, isolated (BEGIN…ROLLBACK).
//
// The unit tests run against the in-memory store, which replaces a whole aggregate on every save. That
// hides persistence bugs: the first cut of the editable-draft patch returned 200 from PATCH and then
// LOST the edit, because the Postgres `on conflict` clause never updated `lines`. This proof exists so
// that class of defect cannot hide again — every assertion below re-reads through the DB.
//
// Proves:
//   D1  a DRAFT basis is genuinely editable and the edit PERSISTS; provenance survives the edit
//   D2  an unknown quantity stays null through accept — it is never silently 0
//   D3  unknown quantities BLOCK approve / estimate / pricing
//   D4  the quotation carries the FROZEN pricing sheet's money, not opportunity.value  ← the decisive one
//   D5  re-approving an approved basis is refused and never re-stamps the audit fields
// Run: pnpm --filter @aura/api exec node scripts/pre-award-closing-proof.mjs
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { config } from 'dotenv';
import pg from 'pg';
import {
  PostgresPreAwardPackageStore, PostgresPricingSheetStore,
  PreAwardPackageService, quotationLinesFromSheet,
} from '@aura/crm';

const apiRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
config({ path: join(apiRoot, '.env.local') });
const cs = (process.env.MIGRATION_DATABASE_URL || process.env.DATABASE_URL || '').trim();
if (!cs) { console.error('no db url'); process.exit(1); }
const sslOff = /(@|\/\/)(localhost|127\.0\.0\.1)/.test(cs) || /sslmode=disable/.test(cs);
const pool = new pg.Pool({ connectionString: cs, ssl: sslOff ? false : { rejectUnauthorized: false } });
const assert = (c, m) => { if (!c) throw new Error('ASSERT FAILED: ' + m); console.log('  ✓', m); };
const round2 = (n) => Math.round(n * 100) / 100;

async function main() {
  const client = await pool.connect();
  const one = { query: (...a) => client.query(...a) };
  const packages = new PreAwardPackageService(new PostgresPreAwardPackageStore(one), new PostgresPricingSheetStore(one));

  try {
    const src = (await client.query(`select * from public.aura_crm_opportunities where tender_id is null limit 1`)).rows[0];
    if (!src) { console.log('no direct opportunity to clone; nothing to prove on'); return; }
    const tenantId = src.tenant_id;

    await client.query('BEGIN');

    // A throwaway fixture deal (cloned shape, new id) — never a real demo opportunity.
    const oppId = randomUUID();
    const cols = Object.keys(src);
    const HEADLINE_VALUE = 999999;
    await client.query(
      `insert into public.aura_crm_opportunities (${cols.join(',')}) values (${cols.map((_, i) => `$${i + 1}`).join(',')})`,
      cols.map((c) => (c === 'id' ? oppId : c === 'value' ? HEADLINE_VALUE : c === 'execution_type' ? 'direct_sale' : src[c])),
    );
    console.log(`fixture opportunity ${oppId} — headline value ${HEADLINE_VALUE}`);

    const pkg = await packages.openDirect({ tenantId, companyId: src.company_id, opportunityId: oppId, createdBy: 'closing-proof' });

    // ── D2 — accept-shaped basis: quantity UNKNOWN, not zero ──────────────────────────────
    const basis = await packages.addScopeBasis({
      tenantId, companyId: src.company_id, packageId: pkg.id, sourceId: randomUUID(), sourceRevRef: 'scope-assist:v1',
      lines: [{ lineId: 'L1', description: 'IP cameras + NVR', unit: 'no', quantity: null, sourceLineId: 'REQ-1' }],
      createdBy: 'closing-proof',
    });
    const reloadBasis = async () => (await packages.readAggregate(tenantId, oppId)).basis.find((b) => b.id === basis.id);
    assert((await reloadBasis()).lines[0].quantity === null, 'D2: an unknown quantity persists as NULL — never silently 0');

    // ── D3 — unknown quantity blocks the chain ────────────────────────────────────────────
    let blocked = false;
    try { await packages.approveScopeBasisById(tenantId, pkg.id, basis.id, 'manager'); } catch { blocked = true; }
    assert(blocked, 'D3: approving a scope with an unknown quantity is REFUSED');

    blocked = false;
    try {
      await packages.addEstimate({ tenantId, packageId: pkg.id, basisRevisionId: basis.id,
        lines: (await reloadBasis()).lines, buildUps: [{ basisLineId: 'L1', components: [], overheadPercent: 10, profitPercent: 20 }] });
    } catch { blocked = true; }
    assert(blocked, 'D3: building an estimate on an unknown quantity is REFUSED (no confident AED 0)');

    // ── D1 — the draft is editable AND the edit survives a DB round-trip ──────────────────
    await packages.updateBasisLinesById(tenantId, pkg.id, basis.id, [
      { lineId: 'L1', description: 'IP cameras + NVR (revised on site)', unit: 'each', quantity: 2, sourceLineId: 'PAYLOAD-TRIES-TO-OVERWRITE' },
    ], 'engineer-1');
    const edited = await reloadBasis();
    assert(edited.lines[0].quantity === 2, 'D1: the edited quantity PERSISTED (re-read from Postgres, not the response)');
    assert(edited.lines[0].unit === 'each', 'D1: the edited unit persisted');
    assert(edited.lines[0].editedBy === 'engineer-1', 'D1: the line is stamped as human-edited');
    assert(edited.lines[0].sourceLineId === 'REQ-1', 'D1: provenance SURVIVES the human edit (payload cannot rewrite it)');

    // ── the chain, now on a real quantity ─────────────────────────────────────────────────
    await packages.approveScopeBasisById(tenantId, pkg.id, basis.id, 'manager-1');
    const approvedBasis = await reloadBasis();
    assert(approvedBasis.status === 'approved', 'scope basis approved once the quantity is known');

    // ── D5 — an approval is an audit record ───────────────────────────────────────────────
    let reApproveRefused = false;
    try { await packages.approveScopeBasisById(tenantId, pkg.id, basis.id, 'someone-else'); } catch { reApproveRefused = true; }
    assert(reApproveRefused, 'D5: re-approving an APPROVED basis is refused');
    const afterReApprove = await reloadBasis();
    assert(afterReApprove.approvedBy === 'manager-1' && afterReApprove.approvedAt === approvedBasis.approvedAt,
      'D5: the original approver + timestamp are UNTOUCHED (no audit overwrite)');

    const { estimate } = await packages.addEstimate({
      tenantId, companyId: src.company_id, packageId: pkg.id, basisRevisionId: basis.id,
      lines: approvedBasis.lines,
      buildUps: [{ basisLineId: 'L1', components: [{ costType: 'material', description: 'Camera', quantity: 1, unitCost: 1000 }], overheadPercent: 10, profitPercent: 20 }],
      createdBy: 'closing-proof',
    });
    // Slice 6A: the estimate is COST-ONLY — its canonical output is estimatedCost, with no selling
    // decision. direct 1000 + 10% overhead = 1100/unit × 2 = 2200.
    assert(estimate.totals.estimatedCost === 2200, `6A: the estimate commits to a COST, not a price (estimatedCost=${estimate.totals.estimatedCost})`);
    assert(!('totalSellingValue' in estimate.totals), '6A: a cost-only estimate carries NO selling value');
    const frozenEst = await packages.freezeEstimateRevision(estimate, 'u1');
    await packages.approveEstimateRevision(frozenEst, 'u1');

    // 6A: freezing a cost-only estimate with NO policy is refused — pricing is a decision, not a default.
    let noPolicyRefused = false;
    try { await packages.freezePricing({ tenantId, companyId: src.company_id, opportunityId: oppId, actorId: 'u1' }); }
    catch { noPolicyRefused = true; }
    assert(noPolicyRefused, '6A: freezing a cost-only estimate with NO pricing policy is REFUSED');

    // The selling decision is made HERE, once, explicitly: 20% markup on 2200 = 2640.
    const sheet = await packages.freezePricing({ tenantId, companyId: src.company_id, opportunityId: oppId, policy: { method: 'markup', percent: 20 }, actorId: 'u1' });
    assert(sheet.status === 'frozen' && sheet.totals.totalSell === 2640, `pricing frozen forward from the policy at ${sheet.totals.totalSell} (2200 × 1.20)`);

    // ── D4 — THE DECISIVE TEST ────────────────────────────────────────────────────────────
    // The opportunity's headline value is wildly different from the frozen sheet. The quotation must
    // reproduce the SHEET, proving opportunity.value can no longer leak into the customer's number.
    assert(sheet.totals.totalSell !== HEADLINE_VALUE, 'D4 setup: the frozen sheet total differs from opportunity.value');
    const lines = quotationLinesFromSheet(sheet);
    const quotedNet = round2(lines.reduce((s, l) => s + l.quantity * l.unitPrice, 0));
    assert(quotedNet === sheet.totals.totalSell, `D4: the quotation reproduces the FROZEN SHEET total (${quotedNet} === ${sheet.totals.totalSell})`);
    assert(quotedNet !== HEADLINE_VALUE, `D4: the quotation does NOT carry opportunity.value (${HEADLINE_VALUE})`);

    const quotationId = randomUUID();
    await packages.linkQuotationToPricing(sheet, quotationId);
    const linked = (await packages.readAggregate(tenantId, oppId)).pricing.find((p) => p.id === sheet.id);
    assert(linked.quotationId === quotationId, 'D4: the frozen sheet records the quotation it produced (P→Q link closed)');

    await client.query('ROLLBACK');
    console.log('ROLLBACK done');

    const left = (await client.query(`select 1 from public.aura_crm_opportunities where id=$1`, [oppId])).rowCount
      + (await client.query(`select 1 from public.aura_crm_estimation_basis_revisions where id=$1`, [basis.id])).rowCount;
    assert(left === 0, 'NOTHING left behind (fixture opportunity + basis gone)');

    console.log('\nCLOSING PROOF PASSED — editable draft persists, unknown ≠ zero, and the quote is the frozen sheet.');
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch { /* best-effort */ }
    throw e;
  } finally {
    client.release();
    await pool.end();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });

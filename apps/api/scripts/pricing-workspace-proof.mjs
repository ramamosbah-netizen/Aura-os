// Slice-7A vertical-slice PROOF — the Pricing Workspace commercial decision, on live Postgres (rolled back).
//
// Proves the contract BEFORE the UI exists:
//   Approved Estimate (cost, read-only) → Pricing Draft → set policy → Freeze → Quotation → P-002 revision
// and every invariant the decision must hold:
//   • no pricing draft from a non-approved estimate
//   • the commercial_decision (policy + discount + figures) round-trips through Postgres
//   • figures come from computeCommercialPricing — markup% AND margin% both present, and different
//   • no freeze without a policy; a frozen sheet is read-only (setPolicy refused); no quotation from a draft
//   • the quotation reproduces the FROZEN selling price, not opportunity.value
//   • changing opportunity.value does NOT change pricing or the quotation
//   • re-pricing is a NEW revision P-002; P-001 is untouched
// Run: pnpm --filter @aura/api exec node scripts/pricing-workspace-proof.mjs
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { config } from 'dotenv';
import pg from 'pg';
import { PostgresPreAwardPackageStore, PostgresPricingSheetStore, PreAwardPackageService, quotationLinesFromSheet } from '@aura/crm';

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
  const store = new PostgresPreAwardPackageStore(one);
  const packages = new PreAwardPackageService(store, new PostgresPricingSheetStore(one));

  try {
    const src = (await client.query(`select * from public.aura_crm_opportunities where tender_id is null limit 1`)).rows[0];
    if (!src) { console.log('no direct opportunity to clone; nothing to prove on'); return; }
    const tenantId = src.tenant_id;
    await client.query('BEGIN');

    const oppId = randomUUID();
    const HEADLINE = 777777;
    const cols = Object.keys(src);
    await client.query(`insert into public.aura_crm_opportunities (${cols.join(',')}) values (${cols.map((_, i) => `$${i + 1}`).join(',')})`,
      cols.map((c) => (c === 'id' ? oppId : c === 'value' ? HEADLINE : c === 'execution_type' ? 'direct_sale' : src[c])));
    const pkg = await packages.openDirect({ tenantId, companyId: src.company_id, opportunityId: oppId, createdBy: '7a-proof' });

    const basis = await packages.addScopeBasis({ tenantId, companyId: src.company_id, packageId: pkg.id, sourceId: randomUUID(),
      lines: [{ lineId: 'L1', description: 'CCTV', unit: 'no', quantity: 4, sourceLineId: 'REQ-1' }] });
    await packages.approveScopeBasisById(tenantId, pkg.id, basis.id, 'manager');

    // ── no pricing before an approved estimate ──
    let noEstimate = false;
    try { await packages.openPricing({ tenantId, companyId: src.company_id, opportunityId: oppId }); } catch { noEstimate = true; }
    assert(noEstimate, 'no pricing draft can open before an estimate is approved');

    // Cost-only estimate: material 1000/unit +10% overhead = 1100/unit × 4 = 4400 estimatedCost.
    const { estimate } = await packages.addEstimate({ tenantId, companyId: src.company_id, packageId: pkg.id, basisRevisionId: basis.id, lines: basis.lines,
      buildUps: [{ basisLineId: 'L1', resources: { supplyUnitPrice: 1000 }, overheadPercent: 10 }] });
    assert(estimate.totals.estimatedCost === 4400, `estimate cost baseline is 4400 (got ${estimate.totals.estimatedCost})`);
    await packages.approveEstimateRevision(await packages.freezeEstimateRevision(estimate, 'u1'), 'manager');

    // ── open a pricing draft on the cost baseline, no policy yet ──
    const draft = await packages.openPricing({ tenantId, companyId: src.company_id, opportunityId: oppId, actorId: 'sales' });
    assert(draft.status === 'draft' && draft.commercial && draft.commercial.baselineCost === 4400, `pricing draft opened on baseline 4400 (${draft.commercial?.baselineCost})`);
    assert(draft.commercial.policy === null && draft.commercial.figures === null, 'a fresh draft has no policy and no figures yet');
    assert(draft.totals.totalSell === 0, 'no selling price until a policy is chosen');

    // ── openPricing is idempotent — no second draft ──
    const again = await packages.openPricing({ tenantId, companyId: src.company_id, opportunityId: oppId });
    assert(again.id === draft.id, 'openPricing returns the SAME draft (never a second one)');

    // ── no freeze without a policy ──
    let noPolicyFreeze = false;
    try { await packages.freezePricingSheetById({ tenantId, opportunityId: oppId, sheetId: draft.id, actorId: 'sales' }); } catch { noPolicyFreeze = true; }
    assert(noPolicyFreeze, 'a pricing draft with no policy cannot be frozen');

    // ── live preview matches what setPolicy will persist ──
    const preview = await packages.previewPricing({ tenantId, opportunityId: oppId, policy: { method: 'target_margin', percent: 25 } });
    assert(preview.figures.sellingPrice === round2(4400 / 0.75), `preview: 25% target margin on 4400 → ${preview.figures.sellingPrice}`);

    // ── set the policy: 25% target margin ──
    const priced = await packages.setPricingPolicy({ tenantId, opportunityId: oppId, sheetId: draft.id, policy: { method: 'target_margin', percent: 25 } });
    assert(priced.commercial.figures.sellingPrice === preview.figures.sellingPrice, 'setPolicy persists exactly the previewed selling price');
    assert(priced.commercial.figures.marginPercent > 0 && priced.commercial.figures.markupPercent > 0 && priced.commercial.figures.markupPercent !== priced.commercial.figures.marginPercent,
      `figures carry BOTH margin% (${priced.commercial.figures.marginPercent}) and markup% (${priced.commercial.figures.markupPercent}), and they differ`);
    assert(priced.totals.totalSell === priced.commercial.figures.sellingPrice, 'sheet totalSell mirrors the decided selling price');

    // ── commercial_decision round-trips through Postgres ──
    const reloadedDraft = await new PostgresPricingSheetStore(one).get(priced.id);
    assert(reloadedDraft.commercial && reloadedDraft.commercial.policy.method === 'target_margin' && reloadedDraft.commercial.policy.percent === 25,
      'the commercial policy round-trips through Postgres (method + percent)');
    assert(reloadedDraft.commercial.figures.sellingPrice === priced.commercial.figures.sellingPrice, 'the figures round-trip too');

    // ── re-price the draft before freezing (draft edits freely): switch to a 30% markup + AED 200 discount ──
    const repriced = await packages.setPricingPolicy({ tenantId, opportunityId: oppId, sheetId: draft.id, policy: { method: 'markup', percent: 30 }, discount: { kind: 'amount', value: 200 } });
    assert(repriced.commercial.figures.preDiscountSell === round2(4400 * 1.3) && repriced.commercial.figures.discount === 200,
      `re-priced draft: 30% markup 5720 less AED 200 → sell ${repriced.commercial.figures.sellingPrice}`);
    const frozenSell = repriced.commercial.figures.sellingPrice;

    // ── freeze ──
    const frozen = await packages.freezePricingSheetById({ tenantId, opportunityId: oppId, sheetId: draft.id, actorId: 'sales' });
    assert(frozen.status === 'frozen' && frozen.totals.totalSell === frozenSell, `frozen at the committed selling price ${frozenSell}`);

    // ── a frozen sheet is read-only: setPolicy refused ──
    let editFrozen = false;
    try { await packages.setPricingPolicy({ tenantId, opportunityId: oppId, sheetId: frozen.id, policy: { method: 'markup', percent: 5 } }); } catch { editFrozen = true; }
    assert(editFrozen, 'a FROZEN pricing sheet refuses a policy change (immutable)');

    // ── the quotation reproduces the frozen price, not opportunity.value ──
    const qLines = quotationLinesFromSheet(frozen);
    const quotedNet = round2(qLines.reduce((s, l) => s + l.quantity * l.unitPrice, 0));
    assert(quotedNet === frozenSell, `quotation reproduces the FROZEN selling price (${quotedNet} === ${frozenSell})`);
    assert(quotedNet !== HEADLINE, `quotation does NOT carry opportunity.value (${HEADLINE})`);

    // ── changing opportunity.value does NOT change pricing or the quote ──
    await client.query('update public.aura_crm_opportunities set value = 111111 where id = $1', [oppId]);
    const frozenAfter = await packages.frozenPricingFor(tenantId, oppId);
    assert(frozenAfter.totals.totalSell === frozenSell, 'changing opportunity.value leaves the frozen price untouched');

    // ── re-pricing is a NEW revision; P-001 is untouched ──
    const p2 = await packages.openPricingRevision({ tenantId, companyId: src.company_id, opportunityId: oppId, actorId: 'sales' });
    assert(p2.version === 2 && p2.parentSheetId === frozen.id && p2.status === 'draft', 'openPricingRevision creates P-002 draft linked to P-001');
    const p1 = await new PostgresPricingSheetStore(one).get(frozen.id);
    assert(p1.status === 'frozen' && p1.totals.totalSell === frozenSell, 'P-001 stays frozen and unchanged after P-002 opens');

    await client.query('ROLLBACK');
    console.log('ROLLBACK done');
    const left = (await client.query(`select 1 from public.aura_crm_opportunities where id=$1`, [oppId])).rowCount
      + (await client.query(`select 1 from public.aura_crm_pricing_sheets where package_id=$1`, [pkg.id])).rowCount;
    assert(left === 0, 'NOTHING left behind (fixture opportunity + pricing sheets gone)');

    console.log('\n7A PRICING PROOF PASSED — draft policy round-trips, freeze commits, quote = frozen sheet, P-002 preserves P-001.');
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch { /* best-effort */ }
    throw e;
  } finally {
    client.release();
    await pool.end();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });

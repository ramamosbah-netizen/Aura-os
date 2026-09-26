import { describe, it, expect, vi } from 'vitest';
import type { AccessService, EventStore } from '@aura/core';
import { moneyNumber, subMoney } from '@aura/shared';
import { QuotationService } from './quotation.service';
import { InMemoryQuotationStore } from './in-memory-quotation-store';
import { InMemoryCommercialBaselineStore } from './in-memory-commercial-baseline-store';
import { InMemoryQuotationReviewStore } from './in-memory-quotation-review-store';
import { makeQuotation, refreshQuotationDraft, reviseQuotation, type Quotation } from './domain/quotation';
import { compareQuotationRevisions } from './domain/quotation-compare';
import { makeQuotationReviewDecision } from './domain/quotation-review';

/**
 * EST-16 — one logical offer per tender, the owner's decision of 2026-09-25 ("(a), (a), (a)"):
 * immutable, linked revisions after first submission; an unsubmitted draft refreshes in place; a
 * revision of a submitted tender offer carries a permanent reason and is regenerated from the
 * current governed estimate; earlier figures and decisions are preserved.
 */
const noopAccess = { assert: () => {}, assertApprovalAuthority: () => {} } as unknown as AccessService;

function harness() {
  const events = { append: vi.fn().mockResolvedValue(undefined) } as unknown as EventStore;
  const store = new InMemoryQuotationStore();
  const reviews = new InMemoryQuotationReviewStore();
  const svc = new QuotationService(store, new InMemoryCommercialBaselineStore(), events, noopAccess, undefined, undefined, null, reviews, null);
  return { svc, store, reviews };
}

const estimateAt = (supply: number) => ({
  lines: [
    { description: '[C-01] IP camera (no)', quantity: 60, unit: 'no', sourceItemId: 'boq-1', unitPrice: supply },
    { description: '[C-02] NVR (no)', quantity: 2, unit: 'no', sourceItemId: 'boq-2', unitPrice: 9000 },
  ],
  estimation: [
    { description: 'IP camera', quantity: 60, unit: 'no', sourceItemId: 'boq-1', supplyUnitPrice: supply * 0.6, profitPercent: 15 },
    { description: 'NVR', quantity: 2, unit: 'no', sourceItemId: 'boq-2', supplyUnitPrice: 6000, profitPercent: 15 },
  ] as never,
});

const tenderOffer = (svc: QuotationService) => svc.create({
  tenantId: 't1', quoteNumber: 'QUO-T1', customerName: 'Emaar', accountId: 'a1', sourceTenderId: 'tender-1',
  issueDate: '2026-09-25', ...estimateAt(500), createdBy: 'u-estimator',
});

describe('EST-16 — the domain', () => {
  const base = (over: Partial<Quotation> = {}): Quotation => ({
    ...makeQuotation({ tenantId: 't1', quoteNumber: 'QUO-9', customerName: 'Emaar', issueDate: '2026-09-25', sourceTenderId: 'tender-9', ...estimateAt(500) }),
    ...over,
  });

  it('a revision regenerated from the estimate takes the estimate\'s figures, not the previous revision\'s', () => {
    const { superseded, next } = reviseQuotation(base({ status: 'sent' }), { regenerated: estimateAt(450) });
    expect(superseded.status).toBe('revised');
    expect(superseded.lines[0].unitPrice).toBe(500);
    expect(next.revision).toBe(1);
    expect(next.parentQuotationId).toBe(superseded.id);
    expect(next.quoteNumber).toBe('QUO-9');
    expect(next.lines[0].unitPrice).toBe(450);
    expect(next.status).toBe('draft');
  });

  it('a tender offer is revisable once approved or cancelled, and from a returned draft — never from review or acceptance', () => {
    for (const status of ['approved', 'cancelled', 'sent', 'rejected', 'expired'] as const) {
      expect(() => reviseQuotation(base({ status }), { regenerated: estimateAt(450) })).not.toThrow();
    }
    expect(() => reviseQuotation(base({ status: 'draft' }), { regenerated: estimateAt(450), fromReturnedDraft: true })).not.toThrow();
    for (const status of ['internal_review', 'accepted', 'revised', 'draft'] as const) {
      expect(() => reviseQuotation(base({ status }), { regenerated: estimateAt(450) })).toThrow(/cannot revise/);
    }
    // A direct offer keeps its rule: approved is not revisable by copy.
    expect(() => reviseQuotation(base({ status: 'approved', sourceTenderId: null }))).toThrow(/cannot revise/);
  });

  it('a draft refreshes in place only while nobody has been asked to decide on it', () => {
    const draft = base();
    const refreshed = refreshQuotationDraft(draft, estimateAt(450), false);
    expect(refreshed.id).toBe(draft.id);
    expect(refreshed.revision).toBe(0);
    expect(refreshed.lines[0].unitPrice).toBe(450);
    expect(refreshed.total).toBeLessThan(draft.total);
    expect(() => refreshQuotationDraft(draft, estimateAt(450), true)).toThrow(/only a never-submitted draft/);
    expect(() => refreshQuotationDraft(base({ status: 'approved' }), estimateAt(450), false)).toThrow(/only a draft offer/);
  });

  it('a revision\'s reason is never blank, and says it is a revision', () => {
    expect(() => makeQuotationReviewDecision({ tenantId: 't1', quotationId: 'q', quoteNumber: 'QUO-9', outcome: 'revised', reason: '  ' }))
      .toThrow(/revising an offer requires a reason/);
    expect(makeQuotationReviewDecision({ tenantId: 't1', quotationId: 'q', quoteNumber: 'QUO-9', outcome: 'revised', reason: 'Client re-scoped' }).outcome).toBe('revised');
  });

  it('compares two revisions per BOQ item — figures from each frozen record, deltas and totals', () => {
    const { superseded, next } = reviseQuotation(base({ status: 'sent' }), { regenerated: estimateAt(450) });
    const cmp = compareQuotationRevisions(superseded, next);
    expect(cmp.from.revision).toBe(0);
    expect(cmp.to.revision).toBe(1);
    const camera = cmp.rows.find((r) => r.key === 'boq-1')!;
    expect(camera.from).toMatchObject({ quantity: 60, unitPrice: 500, lineTotal: 30000 });
    expect(camera.to).toMatchObject({ quantity: 60, unitPrice: 450, lineTotal: 27000 });
    expect(camera.from!.directCost).not.toBeNull();
    expect(camera.delta).toBe(-3000);
    expect(cmp.rows.find((r) => r.key === 'boq-2')!.delta).toBe(0);
    expect(cmp.totalDelta).toBe(moneyNumber(subMoney(next.total, superseded.total)));
    expect(() => compareQuotationRevisions(superseded, base({ quoteNumber: 'QUO-OTHER' }))).toThrow(/same offer/);
  });
});

describe('EST-16 — the service', () => {
  it('one offer per tender: its live revision is the latest not superseded', async () => {
    const { svc } = harness();
    expect(await svc.currentForTender('t1', 'tender-1')).toBeNull();
    const rev0 = await tenderOffer(svc);
    await svc.changeStatus(rev0.id, 'approve', 'u-qs');
    await svc.changeStatus(rev0.id, 'send', 'u-qs');
    const rev1 = await svc.revise(rev0.id, 'u-estimator', { reason: 'Client re-scoped the car park', regenerated: estimateAt(450) });
    const current = await svc.currentForTender('t1', 'tender-1');
    expect(current!.id).toBe(rev1.id);
    expect(current!.revision).toBe(1);
  });

  it('a tender offer is never revised by copy — only from its tender, regenerated, with a reason', async () => {
    const { svc } = harness();
    const rev0 = await tenderOffer(svc);
    await svc.changeStatus(rev0.id, 'approve', 'u-qs');
    await svc.changeStatus(rev0.id, 'send', 'u-qs');
    await expect(svc.revise(rev0.id, 'u-estimator')).rejects.toThrow(/can only be revised from its tender/);
    await expect(svc.revise(rev0.id, 'u-estimator', { regenerated: estimateAt(450) })).rejects.toThrow(/revising an offer requires a reason/);
    expect((await svc.get(rev0.id))!.status).toBe('sent'); // nothing was written
  });

  it('the reason is recorded against the revision it supersedes, beside the returns; Rev 0 keeps its figures', async () => {
    const { svc } = harness();
    const rev0 = await tenderOffer(svc);
    await svc.changeStatus(rev0.id, 'submit_review', 'u-estimator');
    await svc.changeStatus(rev0.id, 'return_for_revision', 'u-qs', 'Re-rate the cameras');
    const rev1 = await svc.revise(rev0.id, 'u-estimator', { reason: 'Cameras re-rated as asked', regenerated: estimateAt(450) });
    expect(rev1.revision).toBe(1);
    const decisions = await svc.listReviewDecisions('t1', rev0.id);
    expect(decisions.map((d) => [d.outcome, d.revision, d.decidedBy, d.reason])).toEqual([
      ['returned', 0, 'u-qs', 'Re-rate the cameras'],
      ['revised', 0, 'u-estimator', 'Cameras re-rated as asked'],
    ]);
    const old = (await svc.get(rev0.id))!;
    expect(old.status).toBe('revised');
    expect(old.lines[0].unitPrice).toBe(500);
    const cmp = await svc.compare('t1', rev0.id, rev1.id);
    expect(cmp.from.returned).toEqual([expect.objectContaining({ by: 'u-qs', reason: 'Re-rate the cameras' })]);
    expect(cmp.from.revised).toEqual([expect.objectContaining({ by: 'u-estimator', reason: 'Cameras re-rated as asked' })]);
    expect(cmp.totalDelta).toBeLessThan(0);
  });

  it('a never-submitted draft refreshes in place; once returned it does not', async () => {
    const { svc } = harness();
    const rev0 = await tenderOffer(svc);
    const refreshed = await svc.refreshDraft(rev0.id, 'u-estimator', estimateAt(480));
    expect(refreshed.id).toBe(rev0.id);
    expect(refreshed.revision).toBe(0);
    expect((await svc.get(rev0.id))!.lines[0].unitPrice).toBe(480);
    expect(await svc.everSubmitted('t1', refreshed)).toBe(false);
    await svc.changeStatus(rev0.id, 'submit_review', 'u-estimator');
    await svc.changeStatus(rev0.id, 'return_for_revision', 'u-qs', 'Re-rate the cameras');
    expect(await svc.everSubmitted('t1', (await svc.get(rev0.id))!)).toBe(true);
    await expect(svc.refreshDraft(rev0.id, 'u-estimator', estimateAt(450))).rejects.toThrow(/only a never-submitted draft/);
  });

  it('the CRM pricing workspace is not a second writer of a tender offer\'s figures', async () => {
    const { svc } = harness();
    const rev0 = await tenderOffer(svc);
    await expect(svc.saveEstimation(rev0.id, estimateAt(1).estimation as never)).rejects.toThrow(/can only be priced from its tender's estimate/);
  });

  it('a direct offer still revises by copy, with no reason required', async () => {
    const { svc } = harness();
    const direct = await svc.create({
      tenantId: 't1', quoteNumber: 'QUO-D1', customerName: 'Emaar', accountId: 'a1', issueDate: '2026-09-25',
      lines: [{ description: 'CCTV', quantity: 2, unitPrice: 1000 }], createdBy: 'u1',
    });
    await svc.changeStatus(direct.id, 'approve', 'u-qs');
    await svc.changeStatus(direct.id, 'send', 'u-qs');
    const next = await svc.revise(direct.id, 'u1');
    expect(next.revision).toBe(1);
    expect(next.lines[0].unitPrice).toBe(1000);
  });
});

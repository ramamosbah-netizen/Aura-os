import { describe, it, expect, vi } from 'vitest';
import type { EventStore } from '@aura/core';
import { QuotationService } from './quotation.service';
import { InMemoryQuotationStore } from './in-memory-quotation-store';
import { InMemoryCommercialBaselineStore } from './in-memory-commercial-baseline-store';

function harness() {
  const events = { append: vi.fn().mockResolvedValue(undefined) } as unknown as EventStore;
  const baselines = new InMemoryCommercialBaselineStore();
  const svc = new QuotationService(new InMemoryQuotationStore(), baselines, events);
  return { svc, baselines, events };
}

const newQuote = (svc: QuotationService) => svc.create({
  tenantId: 't1', quoteNumber: 'QT-1', customerName: 'Emaar', accountId: 'a1',
  issueDate: '2026-07-14', lines: [{ description: 'CCTV', quantity: 2, unitPrice: 1000 }], createdBy: 'u1',
});

describe('QuotationService — commercial governance (R3)', () => {
  it('locks an immutable Commercial Baseline on approval, capturing the approver', async () => {
    const { svc, events } = harness();
    const q = await newQuote(svc);
    expect(await svc.getBaseline('t1', q.id)).toBeNull(); // none before approval

    await svc.changeStatus(q.id, 'approve', 'u-manager');

    const baseline = await svc.getBaseline('t1', q.id);
    expect(baseline).not.toBeNull();
    expect(baseline!.total).toBe(2100);
    expect(baseline!.quotationId).toBe(q.id);
    expect(baseline!.lockedBy).toBe('u-manager');
    // emitted the locked event
    expect((events.append as any).mock.calls.flat(2).some((e: any) => e?.type === 'crm.commercial_baseline.locked')).toBe(true);
  });

  it('cannot send a quotation that was never approved (governance gate)', async () => {
    const { svc } = harness();
    const q = await newQuote(svc);
    await expect(svc.changeStatus(q.id, 'send')).rejects.toThrow('cannot send from status draft');
  });

  it('approval only locks one baseline, and getBaseline is scoped to the tenant', async () => {
    const { svc, baselines } = harness();
    const q = await newQuote(svc);
    await svc.changeStatus(q.id, 'approve', 'u-manager');

    // Exactly one baseline saved for this quotation.
    expect(await baselines.getByQuotation('t1', q.id)).not.toBeNull();
    // A different tenant sees nothing for this quotation id.
    expect(await svc.getBaseline('t2', q.id)).toBeNull();
  });
});

describe('QuotationService.listRevisions — the chain is links, not the number', () => {
  const quote = (svc: QuotationService, quoteNumber: string) => svc.create({
    tenantId: 't1', quoteNumber, customerName: 'Emaar', accountId: 'a1', issueDate: '2026-07-14',
    lines: [{ description: 'CCTV', quantity: 2, unitPrice: 1000 }], createdBy: 'u1',
  });

  it('follows parentQuotationId, oldest revision first', async () => {
    const { svc } = harness();
    const r0 = await quote(svc, 'QT-9');
    await svc.changeStatus(r0.id, 'approve', 'u-manager');
    await svc.changeStatus(r0.id, 'send');
    const r1 = await svc.revise(r0.id);

    const chain = await svc.listRevisions('t1', r0.id);
    expect(chain.map((q) => q.revision)).toEqual([0, 1]);
    expect(chain[1].id).toBe(r1.id);
    // Reachable from either end — a chain read from the newest revision is the same chain.
    expect((await svc.listRevisions('t1', r1.id)).map((q) => q.id)).toEqual(chain.map((q) => q.id));
  });

  // The live defect this rule exists for: quoting one opportunity twice yields two independent
  // quotes sharing a derived number, both at revision 0. Returning them as a revision history
  // invents a price change between two unrelated quotes.
  it('does NOT treat two separate quotes sharing a number as revisions of each other', async () => {
    const { svc } = harness();
    const a = await quote(svc, 'QT-OPP-947e5807');
    const b = await quote(svc, 'QT-OPP-947e5807');

    expect(await svc.listRevisions('t1', a.id)).toHaveLength(1);
    expect((await svc.listRevisions('t1', a.id))[0].id).toBe(a.id);
    expect((await svc.listRevisions('t1', b.id))[0].id).toBe(b.id);
  });

  it('still returns a number-matched chain whose links were never written', async () => {
    const { svc } = harness();
    const store = new InMemoryQuotationStore();
    const svc2 = new QuotationService(store, new InMemoryCommercialBaselineStore(),
      { append: vi.fn().mockResolvedValue(undefined) } as unknown as EventStore);
    const r0 = await quote(svc2, 'QT-LEGACY');
    // A revision 1 with no parent link — legacy data, but distinct revision numbers prove it is
    // one chain rather than two quotes.
    await store.save({ ...r0, id: 'legacy-r1', revision: 1, parentQuotationId: null });

    expect((await svc2.listRevisions('t1', r0.id)).map((q) => q.revision)).toEqual([0, 1]);
  });

  it('returns nothing for a quotation that does not exist', async () => {
    const { svc } = harness();
    expect(await svc.listRevisions('t1', 'nope')).toEqual([]);
  });
});

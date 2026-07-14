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

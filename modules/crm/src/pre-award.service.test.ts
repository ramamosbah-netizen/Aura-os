import { describe, it, expect, vi } from 'vitest';
import type { EventStore } from '@aura/core';
import { PreAwardService } from './pre-award.service';
import { InMemoryPreAwardStore } from './in-memory-pre-award-store';
import { QuotationService } from './quotation.service';
import { InMemoryQuotationStore } from './in-memory-quotation-store';
import { InMemoryCommercialBaselineStore } from './in-memory-commercial-baseline-store';

function harness() {
  const events = { append: vi.fn().mockResolvedValue(undefined) } as unknown as EventStore;
  const quotations = new QuotationService(new InMemoryQuotationStore(), new InMemoryCommercialBaselineStore(), events);
  const svc = new PreAwardService(new InMemoryPreAwardStore(), events, quotations);
  return { svc, quotations };
}

const scopeInput = {
  tenantId: 't1', opportunityId: 'o1', title: 'Villa ELV',
  lines: [{ discipline: 'CCTV', description: '4MP camera', unit: 'no', quantity: 8, unitPrice: 700 }], // 5600
};

describe('PreAwardService — scope → quotation bridge (R4)', () => {
  it('creates a draft scope with a rolled-up total', async () => {
    const { svc } = harness();
    const s = await svc.createScope(scopeInput);
    expect(s.status).toBe('draft');
    expect(s.total).toBe(5600);
  });

  it('cannot generate a quotation from a scope that is not approved', async () => {
    const { svc } = harness();
    const s = await svc.createScope(scopeInput);
    await expect(svc.generateQuotation(s.id, { customerName: 'Emaar' })).rejects.toThrow('must be approved');
  });

  it('an approved scope generates a governed draft quotation from its lines', async () => {
    const { svc, quotations } = harness();
    const s = await svc.createScope(scopeInput);
    await svc.approveScope(s.id, 'u-eng');

    const quote = await svc.generateQuotation(s.id, { customerName: 'Emaar', accountId: 'a1', actorId: 'u-sales' });
    expect(quote.status).toBe('draft'); // enters the R3 governance gate like any quote
    expect(quote.sourceOpportunityId).toBe('o1');
    expect(quote.total).toBe(5880); // 5600 + 5% VAT
    expect(quote.lines[0].description).toBe('CCTV: 4MP camera');

    // the scope remembers the quote it produced, and re-generating is idempotent
    const again = await svc.generateQuotation(s.id, { customerName: 'Emaar' });
    expect(again.id).toBe(quote.id);
    expect((await quotations.list({ tenantId: 't1' })).length).toBe(1);
  });

  it('the generated quote then runs the R3 gate — approval locks a baseline', async () => {
    const { svc, quotations } = harness();
    const s = await svc.approveScope((await svc.createScope(scopeInput)).id, 'u-eng');
    const quote = await svc.generateQuotation(s.id, { customerName: 'Emaar' });
    // cannot send unapproved (R3), but approving locks the baseline
    await expect(quotations.changeStatus(quote.id, 'send')).rejects.toThrow('cannot send from status draft');
    await quotations.changeStatus(quote.id, 'approve', 'u-mgr');
    expect(await quotations.getBaseline('t1', quote.id)).not.toBeNull();
  });
});

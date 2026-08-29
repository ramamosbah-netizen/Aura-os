import { describe, expect, it } from 'vitest';
import { InMemoryQuotationStore } from './in-memory-quotation-store';
import { makeQuotation } from './domain/quotation';

const quote = (over: Partial<Parameters<typeof makeQuotation>[0]>) => makeQuotation({
  tenantId: 'tenant-a', quoteNumber: 'QT-001', customerName: 'Falcon Facilities', issueDate: '2026-08-01',
  lines: [{ description: 'CCTV', quantity: 1, unitPrice: 100 }], ...over,
});

describe('quotation search/filter contract', () => {
  it('searches quote number, customer, subject and contact and paginates the filtered result', async () => {
    const store = new InMemoryQuotationStore();
    await store.save(quote({ quoteNumber: 'QT-FAR', customerName: 'Remote Customer', subject: 'Remote fit-out' }));
    await store.save(quote({ quoteNumber: 'QT-NEAR', customerName: 'Falcon Facilities', contactName: 'Layla' }));

    const bySubject = await store.listPaged({ tenantId: 'tenant-a', search: 'fit-out' }, { limit: 1, offset: 0 });
    expect(bySubject.total).toBe(1);
    expect(bySubject.items[0].quoteNumber).toBe('QT-FAR');

    const byContact = await store.listPaged({ tenantId: 'tenant-a', search: 'layla' }, { limit: 1, offset: 0 });
    expect(byContact.items[0].quoteNumber).toBe('QT-NEAR');
  });

  it('applies owner and issue-date filters before paging', async () => {
    const store = new InMemoryQuotationStore();
    await store.save(quote({ quoteNumber: 'QT-OLD', ownerId: 'u-1', issueDate: '2026-01-01' }));
    await store.save(quote({ quoteNumber: 'QT-NEW', ownerId: 'u-2', issueDate: '2026-08-15' }));
    const page = await store.listPaged({ tenantId: 'tenant-a', ownerId: 'u-2', issueDateFrom: '2026-08-01' }, { limit: 50, offset: 0 });
    expect(page.total).toBe(1);
    expect(page.items[0].quoteNumber).toBe('QT-NEW');
  });

  it('summarises the full filtered tenant, independently of page size', async () => {
    const store = new InMemoryQuotationStore();
    await store.save(quote({ quoteNumber: 'QT-1', sourceOpportunityId: 'opp-1', lines: [{ description: 'CCTV', quantity: 1, unitPrice: 100, vatRate: 0 }] }));
    await store.save(quote({ quoteNumber: 'QT-2', sourceTenderId: 'tender-1', lines: [{ description: 'CCTV', quantity: 1, unitPrice: 250, vatRate: 0 }] }));
    const summary = await store.summary({ tenantId: 'tenant-a' });
    expect(summary).toMatchObject({ total: 2, totalValue: 350, draftValue: 350, sources: { opportunity: 1, tender: 1, direct: 0 } });
    expect(summary.stage.draft).toMatchObject({ count: 2, value: 350 });
  });
});

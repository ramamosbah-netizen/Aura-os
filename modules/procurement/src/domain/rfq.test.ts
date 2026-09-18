import { describe, it, expect, vi } from 'vitest';
import { type EventStore, type AccessService } from '@aura/core';
import { makeRfq, makeRfqQuote, type RfqQuote } from './rfq';
import { RfqService } from '../rfq.service';
import { InMemoryRfqStore } from '../in-memory-rfq-store';

describe('RFQ domain', () => {
  it('makeRfq applies defaults and trims', () => {
    const r = makeRfq({ tenantId: 't1', title: '  Cabling RFQ  ' });
    expect(r.title).toBe('Cabling RFQ');
    expect(r.status).toBe('draft');
    expect(r.id).toBeTruthy();
  });

  it('validates RFQ title and quote inputs', () => {
    expect(() => makeRfq({ tenantId: 't1', title: '   ' })).toThrow('title is required');
    expect(() => makeRfqQuote({ rfqId: 'r1', tenantId: 't1', supplierName: '', amount: 5 })).toThrow('supplier is required');
    expect(() => makeRfqQuote({ rfqId: 'r1', tenantId: 't1', supplierName: 'X', amount: 0 })).toThrow('amount must be positive');
  });

});

describe('RfqService', () => {
  const build = () => {
    const events = { append: vi.fn().mockResolvedValue(undefined) } as unknown as EventStore;
    const access = { assert: vi.fn() } as unknown as AccessService;
    return { service: new RfqService(new InMemoryRfqStore(), events, access), events };
  };

  it('creates and collects quotes — and names no winner among them', async () => {
    const { service } = build();
    const rfq = await service.create({ tenantId: 't1', title: 'Cabling', createdBy: 'u1' });

    await service.addQuote({ rfqId: rfq.id, tenantId: 't1', supplierName: 'Gulf Cables', amount: 5000 });
    await service.addQuote({ rfqId: rfq.id, tenantId: 't1', supplierName: 'Acme', amount: 4200 });

    const detail = await service.getWithQuotes(rfq.id);
    expect(detail?.quotes).toHaveLength(2);

    // The cheaper figure is NOT marked, recommended or sorted to the top. 4200 against 5000 is not a
    // comparison until both are in one currency, on one tax treatment, with freight accounted for
    // and every required line technically compliant — which is SUP-06's work, not a `<` operator's.
    expect(detail).not.toHaveProperty('recommended');
    expect((service as unknown as Record<string, unknown>).award).toBeUndefined();
  });
});

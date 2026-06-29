import { describe, it, expect, vi } from 'vitest';
import { type EventStore, type AccessService } from '@aura/core';
import { makeRfq, makeRfqQuote, lowestQuote, type RfqQuote } from './rfq';
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

  it('lowestQuote picks the cheapest non-rejected quote', () => {
    const q = (over: Partial<RfqQuote>): RfqQuote => makeRfqQuote({ rfqId: 'r1', tenantId: 't1', supplierName: 's', amount: 100, ...over });
    const a = q({ amount: 300 });
    const b = q({ amount: 150 });
    const c = q({ amount: 120, status: 'rejected' });
    expect(lowestQuote([a, b, c])?.amount).toBe(150); // c rejected, b cheapest
    expect(lowestQuote([])).toBeNull();
  });
});

describe('RfqService', () => {
  const build = () => {
    const events = { append: vi.fn().mockResolvedValue(undefined) } as unknown as EventStore;
    const access = { assert: vi.fn() } as unknown as AccessService;
    return { service: new RfqService(new InMemoryRfqStore(), events, access), events };
  };

  it('creates, collects quotes, and awards (winner awarded, rest rejected, RFQ awarded)', async () => {
    const { service } = build();
    const rfq = await service.create({ tenantId: 't1', title: 'Cabling', createdBy: 'u1' });

    await service.addQuote({ rfqId: rfq.id, tenantId: 't1', supplierName: 'Gulf Cables', amount: 5000 });
    const win = await service.addQuote({ rfqId: rfq.id, tenantId: 't1', supplierName: 'Acme', amount: 4200 });

    const detail = await service.getWithQuotes(rfq.id);
    expect(detail?.quotes).toHaveLength(2);
    expect(detail?.recommended?.supplierName).toBe('Acme'); // cheapest

    const awarded = await service.award(rfq.id, win.id, 'u1');
    expect(awarded.rfq.status).toBe('awarded');
    expect(awarded.quotes.find((q) => q.id === win.id)?.status).toBe('awarded');
    expect(awarded.quotes.filter((q) => q.status === 'rejected')).toHaveLength(1);
  });
});

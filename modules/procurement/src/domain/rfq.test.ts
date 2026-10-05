import { describe, it, expect, vi } from 'vitest';
import { type EventStore, type AccessService } from '@aura/core';
import { makeRfq, makeRfqQuote, sendRfq, type RfqQuote } from './rfq';
import { approveSupplier, makeSupplier } from './supplier';
import { RfqService } from '../rfq.service';
import { InMemoryRfqStore } from '../in-memory-rfq-store';
import { InMemorySupplierStore } from '../in-memory-supplier-store';

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

/**
 * BUY-03 — an enquiry names the suppliers it is sent to. "Send to vendors" recorded who pressed it and
 * nothing about which vendors, so an RFQ could be sent to nobody and nobody could later say who had
 * been asked and had not answered.
 */
describe('RFQ dispatch — who the enquiry is sent to', () => {
  const build = async () => {
    const events = { append: vi.fn().mockResolvedValue(undefined) } as unknown as EventStore;
    const access = { assert: vi.fn() } as unknown as AccessService;
    const suppliers = new InMemorySupplierStore();
    const gulf = approveSupplier(makeSupplier({ tenantId: 't1', code: 'GC', name: 'Gulf Cables' }));
    const acme = makeSupplier({ tenantId: 't1', code: 'AC', name: 'Acme Trading' });
    const foreign = makeSupplier({ tenantId: 't2', code: 'XX', name: 'Other Tenant Supplier' });
    for (const s of [gulf, acme, foreign]) await suppliers.create(s);
    const service = new RfqService(new InMemoryRfqStore(), events, access, null, null, suppliers);
    const rfq = await service.create({ tenantId: 't1', title: 'Cabling', createdBy: 'u1' });
    return { service, events, rfq, gulf, acme, foreign };
  };

  it('refuses to send an enquiry to nobody', async () => {
    const { service, rfq } = await build();
    await expect(service.send(rfq.id, 'u1')).rejects.toThrow(/is not ready to send: no supplier is invited/);
    expect(() => sendRfq(rfq, 'u1', [])).toThrow(/no supplier is invited/);
    expect((await service.get(rfq.id))?.status).toBe('draft');
  });

  it('sends to the suppliers invited, and says so on the record and the event', async () => {
    const { service, events, rfq, gulf, acme } = await build();
    await service.invite(rfq.id, gulf.id, 'u1');
    await service.invite(rfq.id, acme.id, 'u1');
    const sent = await service.send(rfq.id, 'u1');
    expect(sent).toMatchObject({ status: 'sent', sentBy: 'u1' });

    const detail = await service.getWithQuotes(rfq.id);
    expect(detail?.invitations.map((i) => [i.supplierName, i.invitedBy])).toEqual([['Gulf Cables', 'u1'], ['Acme Trading', 'u1']]);
    const appended = (events.append as ReturnType<typeof vi.fn>).mock.calls.flatMap((c) => c[0] as Array<{ type: string; payload: unknown }>);
    expect(appended.find((e) => e.type === 'procurement.rfq.sent')?.payload).toMatchObject({
      suppliers: [{ id: gulf.id, name: 'Gulf Cables' }, { id: acme.id, name: 'Acme Trading' }],
    });
  });

  it("addresses only a supplier from this tenant's register, once", async () => {
    const { service, rfq, gulf, foreign } = await build();
    await expect(service.invite(rfq.id, 'no-such-supplier', 'u1')).rejects.toThrow(/not found/);
    await expect(service.invite(rfq.id, foreign.id, 'u1')).rejects.toThrow(/not found/);
    await service.invite(rfq.id, gulf.id, 'u1');
    await expect(service.invite(rfq.id, gulf.id, 'u1')).rejects.toThrow(/already invited/);
  });

  it('asks nothing about approval to request a price — the status travels with the invitation instead', async () => {
    const { service, rfq, gulf, acme } = await build();
    await service.invite(rfq.id, acme.id, 'u1');
    await service.invite(rfq.id, gulf.id, 'u1');
    const detail = await service.getWithQuotes(rfq.id);
    expect(detail?.invitations.map((i) => [i.supplierName, i.supplierStatus])).toEqual([['Acme Trading', 'pending'], ['Gulf Cables', 'approved']]);
  });

  it('lets a draft be corrected, and keeps who it went to once sent', async () => {
    const { service, rfq, gulf, acme } = await build();
    await service.invite(rfq.id, gulf.id, 'u1');
    await service.invite(rfq.id, acme.id, 'u1');
    await service.withdrawInvitation(rfq.id, acme.id);
    await expect(service.withdrawInvitation(rfq.id, acme.id)).rejects.toThrow(/not found/);
    await service.send(rfq.id, 'u1');

    await expect(service.withdrawInvitation(rfq.id, gulf.id)).rejects.toThrow(/only a draft enquiry's suppliers can be changed/);
    await expect(service.invite(rfq.id, acme.id, 'u1')).rejects.toThrow(/can only be invited before the enquiry is sent/);
    expect((await service.getWithQuotes(rfq.id))?.invitations.map((i) => i.supplierName)).toEqual(['Gulf Cables']);
  });
});

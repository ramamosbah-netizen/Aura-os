import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';
import { PERMISSIONS_KEY } from '@aura/core';
import { NegotiationController } from './negotiation.controller';

describe('NegotiationController canonical quotation ownership', () => {
  it('declares quotation read/update permissions at the API boundary', () => {
    const prototype = NegotiationController.prototype;
    expect(Reflect.getMetadata(PERMISSIONS_KEY, prototype.list)).toEqual(['crm.quotation.read']);
    expect(Reflect.getMetadata(PERMISSIONS_KEY, prototype.create)).toEqual(['crm.quotation.update']);
    expect(Reflect.getMetadata(PERMISSIONS_KEY, prototype.remove)).toEqual(['crm.quotation.update']);
  });

  it('records a tenant-scoped audit event when a log entry is removed', async () => {
    const events = { append: vi.fn().mockResolvedValue(undefined) };
    const controller = new NegotiationController(
      { remove: vi.fn().mockResolvedValue(true) } as never,
      events as never,
      {} as never,
      { get: () => ({ tenantId: 'tenant-a', actorId: 'user-a' }) } as never,
    );

    await controller.remove('entry-1');

    expect(events.append).toHaveBeenCalledOnce();
    const [event] = events.append.mock.calls[0][0];
    expect(event).toMatchObject({
      type: 'crm.negotiation.deleted',
      tenantId: 'tenant-a',
      actorId: 'user-a',
      aggregateType: 'crm.negotiation_entry',
      aggregateId: 'entry-1',
      payload: { entryId: 'entry-1', reason: 'correction' },
    });
  });

  it('does not emit an audit event when the tenant-scoped delete misses', async () => {
    const events = { append: vi.fn().mockResolvedValue(undefined) };
    const controller = new NegotiationController(
      { remove: vi.fn().mockResolvedValue(false) } as never,
      events as never,
      {} as never,
      { get: () => ({ tenantId: 'tenant-b', actorId: 'user-b' }) } as never,
    );

    await expect(controller.remove('entry-from-tenant-a')).rejects.toThrow(/not found/i);
    expect(events.append).not.toHaveBeenCalled();
  });

  it('reads negotiation reasons across the canonical revision chain', async () => {
    const store = {
      list: vi.fn(async ({ quotationId }: { quotationId?: string }) => quotationId === 'q0'
        ? [{ id: 'entry-0', quotationId: 'q0', occurredAt: '2026-09-14T08:00:00.000Z', amount: null, percent: 8 }]
        : [{ id: 'entry-1', quotationId: 'q1', occurredAt: '2026-09-14T09:00:00.000Z', amount: null, percent: null }]),
    };
    const quotations = {
      listRevisions: vi.fn().mockResolvedValue([
        { id: 'q0', revision: 0, total: 10_000, createdAt: '2026-09-13T08:00:00.000Z' },
        { id: 'q1', revision: 1, total: 9_200, createdAt: '2026-09-14T09:00:00.000Z' },
      ]),
    };
    const controller = new NegotiationController(
      store as never,
      { append: vi.fn() } as never,
      quotations as never,
      { get: () => ({ tenantId: 'tenant-a', actorId: 'user-a' }) } as never,
    );

    const result = await controller.list('q1');

    expect(quotations.listRevisions).toHaveBeenCalledWith('tenant-a', 'q1');
    expect(store.list.mock.calls.map(([filter]) => filter.quotationId)).toEqual(['q0', 'q1']);
    expect(result.entries.map((entry) => entry.id)).toEqual(['entry-0', 'entry-1']);
    expect(result.moves.map((move) => ({ revision: move.revision, total: move.total, delta: move.delta }))).toEqual([
      { revision: 0, total: 10_000, delta: 0 },
      { revision: 1, total: 9_200, delta: -800 },
    ]);
  });
});

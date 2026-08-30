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
});

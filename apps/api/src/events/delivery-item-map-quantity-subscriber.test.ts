import { describe, expect, it, vi } from 'vitest';
import { EventBus } from '@aura/core';
import { makeEvent } from '@aura/shared';
import { DeliveryItemMapQuantitySubscriber } from './delivery-item-map-quantity-subscriber';

const mapping = {
  id: 'map-1', tenantId: 'tenant-1', projectId: 'project-1', handoverId: 'handover-1',
  frozenItemKey: 'TENDER|rev-1|item-1', sourceKind: 'TENDER' as const, sourceId: 'tender-1',
  sourceRevisionRef: 'rev-1', sourceItemId: 'item-1', wbsNodeId: 'wbs-1', cbsNodeId: null,
  createdAt: '2026-09-14T08:00:00.000Z', immutableAt: '2026-09-14T08:00:00.000Z',
};

describe('DeliveryItemMapQuantitySubscriber', () => {
  it('posts the canonical frozen SOLD fact when delivery mapping is created', async () => {
    const bus = new EventBus();
    const maps = {
      get: vi.fn().mockResolvedValue(mapping),
      validate: vi.fn().mockResolvedValue({ soldQuantity: 12, unit: 'nr' }),
    };
    const quantities = { postSold: vi.fn().mockResolvedValue({ id: 'sold-1' }) };
    new DeliveryItemMapQuantitySubscriber(bus, maps as never, quantities as never).onModuleInit();
    const event = makeEvent({
      type: 'projects.delivery_item_map.created', tenantId: 'tenant-1', companyId: 'company-1',
      actorId: 'planner-1', aggregateType: 'projects.delivery_item_map', aggregateId: mapping.id,
    });

    await bus.publish(event);

    expect(maps.validate).toHaveBeenCalledWith(mapping);
    expect(quantities.postSold).toHaveBeenCalledWith({
      mapping,
      soldQuantity: 12,
      unit: 'nr',
      companyId: 'company-1',
      createdBy: 'planner-1',
      occurredAt: event.occurredAt,
    });
  });

  it('fails the event so the outbox can retry when the mapping is unavailable', async () => {
    const bus = new EventBus();
    const maps = { get: vi.fn().mockResolvedValue(null), validate: vi.fn() };
    const quantities = { postSold: vi.fn() };
    new DeliveryItemMapQuantitySubscriber(bus, maps as never, quantities as never).onModuleInit();
    await expect(bus.publish(makeEvent({
      type: 'projects.delivery_item_map.created', tenantId: 'tenant-1',
      aggregateType: 'projects.delivery_item_map', aggregateId: 'missing-map',
    }))).rejects.toThrow('is unavailable');
    expect(quantities.postSold).not.toHaveBeenCalled();
  });
});

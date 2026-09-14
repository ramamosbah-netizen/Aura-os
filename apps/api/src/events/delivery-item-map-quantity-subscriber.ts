import { Injectable, type OnModuleInit } from '@nestjs/common';
import { EventBus } from '@aura/core';
import { type DomainEvent } from '@aura/shared';
import { DeliveryItemMapService, QuantityLedgerService } from '@aura/projects';

/**
 * Connects the immutable commercial handover to execution quantities. Delivery mapping is the
 * first moment a frozen sold item has a canonical project/WBS identity, so that event posts SOLD
 * to the append-only quantity ledger. The ledger's semantic dedupe key makes relay retries safe.
 */
@Injectable()
export class DeliveryItemMapQuantitySubscriber implements OnModuleInit {
  constructor(
    private readonly bus: EventBus,
    private readonly maps: DeliveryItemMapService,
    private readonly quantities: QuantityLedgerService,
  ) {}

  onModuleInit(): void {
    this.bus.subscribe('projects.delivery_item_map.created', async (event: DomainEvent) => {
      const mapping = await this.maps.get(event.aggregateId);
      if (!mapping) throw new Error(`delivery item mapping ${event.aggregateId} is unavailable`);
      const frozen = await this.maps.validate(mapping);
      await this.quantities.postSold({
        mapping,
        soldQuantity: frozen.soldQuantity,
        unit: frozen.unit,
        companyId: event.companyId,
        createdBy: event.actorId,
        occurredAt: event.occurredAt,
      });
    });
  }
}

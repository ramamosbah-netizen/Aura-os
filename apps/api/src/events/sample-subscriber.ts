import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { EventBus } from '@aura/core';

/**
 * Demonstrates the bus by logging every event. The intelligence layer and the
 * read-model projectors will subscribe with this exact shape (read-only consumers).
 */
@Injectable()
export class SampleEventSubscriber implements OnModuleInit {
  private readonly logger = new Logger('Events');

  constructor(private readonly bus: EventBus) {}

  onModuleInit(): void {
    this.bus.subscribe('*', (e) => {
      this.logger.log(`▶ ${e.type}  (${e.aggregateType}:${e.aggregateId})  tenant=${e.tenantId}`);
    });
  }
}

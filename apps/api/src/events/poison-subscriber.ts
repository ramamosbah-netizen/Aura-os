import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { EventBus } from '@aura/core';

/**
 * TEST-ONLY fault injection — inert unless `OUTBOX_TEST_POISON=true`. Subscribes a handler
 * that always throws on the magic type `kernel.poison.test`, so the outbox relay's retry +
 * dead-letter cap can be exercised end to end. Never enable in production.
 */
@Injectable()
export class PoisonSubscriber implements OnModuleInit {
  private readonly logger = new Logger('PoisonTest');

  constructor(private readonly bus: EventBus) {}

  onModuleInit(): void {
    if (process.env.OUTBOX_TEST_POISON !== 'true') return;
    this.logger.warn('OUTBOX_TEST_POISON on — events of type `kernel.poison.test` will throw (fault injection).');
    this.bus.subscribe('kernel.poison.test', () => {
      throw new Error('poison: simulated handler failure');
    });
  }
}

import { Module } from '@nestjs/common';
import { EventBus } from './events/event-bus';
import { EVENT_STORE } from './events/event-store';
import { InMemoryEventStore } from './events/in-memory-event-store';
import { TenantContext } from './tenancy/tenant-context';

/**
 * The kernel as a Nest library. `apps/api` imports this; every business module
 * builds on it. Provides the event spine (store + bus) and the tenant context.
 * Swapping InMemoryEventStore for the Postgres/outbox impl is a one-line change here.
 */
@Module({
  providers: [
    EventBus,
    TenantContext,
    { provide: EVENT_STORE, useClass: InMemoryEventStore },
  ],
  exports: [EventBus, TenantContext, EVENT_STORE],
})
export class CoreModule {}

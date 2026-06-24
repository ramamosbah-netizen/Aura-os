import { Module } from '@nestjs/common';
import type { Pool } from 'pg';
import { EventBus } from './events/event-bus';
import { EVENT_STORE } from './events/event-store';
import { InMemoryEventStore } from './events/in-memory-event-store';
import { PostgresEventStore } from './events/postgres-event-store';
import { OutboxRelay } from './events/outbox-relay';
import { PG_POOL, createPgPool } from './events/pg-pool';
import { TenantContext } from './tenancy/tenant-context';
import { AccessService } from './identity/access.service';
import { OrgService } from './identity/org.service';

/**
 * The kernel as a Nest library. `apps/api` imports this; every business module
 * builds on it. Provides the event spine (store + bus + outbox relay), tenant
 * context, and the identity/access platform (org tree + RBAC/ABAC).
 *
 * The event store is chosen at boot from DATABASE_URL: Postgres + transactional
 * outbox when it's set, in-memory otherwise — so the API runs with or without a DB.
 */
@Module({
  providers: [
    EventBus,
    TenantContext,
    OrgService,
    AccessService,
    { provide: PG_POOL, useFactory: createPgPool },
    {
      provide: EVENT_STORE,
      inject: [PG_POOL, EventBus],
      useFactory: (pool: Pool | null, bus: EventBus) =>
        pool ? new PostgresEventStore(pool) : new InMemoryEventStore(bus),
    },
    {
      provide: OutboxRelay,
      inject: [PG_POOL, EventBus],
      useFactory: (pool: Pool | null, bus: EventBus) => new OutboxRelay(pool, bus),
    },
  ],
  exports: [EventBus, TenantContext, OrgService, AccessService, EVENT_STORE],
})
export class CoreModule {}

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
import { AiService } from './ai/ai.service';
import { DmsService } from './dms/dms.service';
import { DOCUMENT_STORE } from './dms/document-store';
import { InMemoryDocumentStore } from './dms/in-memory-document-store';
import { PostgresDocumentStore } from './dms/postgres-document-store';
import { DOCUMENT_STORAGE } from './dms/document-storage';
import { LocalDocumentStorage } from './dms/local-document-storage';

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
    AiService,
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
    { provide: DOCUMENT_STORAGE, useFactory: () => new LocalDocumentStorage() },
    {
      provide: DOCUMENT_STORE,
      inject: [PG_POOL],
      useFactory: (pool: Pool | null) =>
        pool ? new PostgresDocumentStore(pool) : new InMemoryDocumentStore(),
    },
    DmsService,
  ],
  exports: [EventBus, TenantContext, OrgService, AccessService, AiService, DmsService, EVENT_STORE],
})
export class CoreModule {}

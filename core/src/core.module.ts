import { Module } from '@nestjs/common';
import { EventBus } from './events/event-bus';
import { EVENT_STORE } from './events/event-store';
import { InMemoryEventStore } from './events/in-memory-event-store';
import { TenantContext } from './tenancy/tenant-context';
import { AccessService } from './identity/access.service';
import { OrgService } from './identity/org.service';

/**
 * The kernel as a Nest library. `apps/api` imports this; every business module
 * builds on it. Provides the event spine (store + bus), tenant context, and the
 * identity/access platform (org tree + RBAC/ABAC). Swapping the in-memory impls
 * for Postgres-backed ones is a one-line change per provider here.
 */
@Module({
  providers: [
    EventBus,
    TenantContext,
    OrgService,
    AccessService,
    { provide: EVENT_STORE, useClass: InMemoryEventStore },
  ],
  exports: [EventBus, TenantContext, OrgService, AccessService, EVENT_STORE],
})
export class CoreModule {}

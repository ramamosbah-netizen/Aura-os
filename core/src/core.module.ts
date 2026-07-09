import { Module } from '@nestjs/common';
import type { Pool } from 'pg';
import { EventBus } from './events/event-bus';
import { EVENT_STORE } from './events/event-store';
import { InMemoryEventStore } from './events/in-memory-event-store';
import { PostgresEventStore } from './events/postgres-event-store';
import { OutboxRelay } from './events/outbox-relay';
import { PG_POOL, createPgPool } from './events/pg-pool';
import { TX_RUNNER, PostgresTxRunner, NullTxRunner } from './events/tx';
import { TenantContext } from './tenancy/tenant-context';
import { AccessService } from './identity/access.service';
import { AuthService } from './identity/auth.service';
import { MfaService } from './identity/mfa.service';
import { CompaniesService } from './identity/companies.service';
import { TokenRevocationStore } from './identity/token-revocation';
import { OrgService } from './identity/org.service';
import { AiService } from './ai/ai.service';
import { DmsService } from './dms/dms.service';
import { DOCUMENT_STORE } from './dms/document-store';
import { InMemoryDocumentStore } from './dms/in-memory-document-store';
import { PostgresDocumentStore } from './dms/postgres-document-store';
import { DOCUMENT_STORAGE } from './dms/document-storage';
import { LocalDocumentStorage } from './dms/local-document-storage';
import { documentStorageFromEnv } from './dms/supabase-document-storage';
import { WORKFLOW_STORE } from './workflow/workflow-store';
import { InMemoryWorkflowStore } from './workflow/in-memory-workflow-store';
import { PostgresWorkflowStore } from './workflow/postgres-workflow-store';
import { WorkflowService } from './workflow/workflow.service';
import { WEBHOOK_STORE } from './integration/webhook-store';
import { InMemoryWebhookStore } from './integration/in-memory-webhook-store';
import { PostgresWebhookStore } from './integration/postgres-webhook-store';
import { WebhookService } from './integration/webhook.service';
import { WebhookDispatcher } from './integration/webhook-dispatcher';
import { WebhookRetryWorker } from './integration/webhook-retry-worker';
import { NumberingService } from './numbering/numbering.service';
import { AuditService } from './audit/audit.service';
import { CalendarService } from './time/calendar.service';
import { ExchangeRateService } from './finance/exchange-rate.service';
import { IdempotencyService } from './commands/idempotency.service';
import { LockService } from './commands/lock.service';
import { CommandBus } from './commands/command.bus';
import { IdempotencyInterceptor } from './commands/idempotency.interceptor';
import { PermissionsGuard } from './identity/permissions.guard';
import { SnapshotEngine } from './projections/snapshot.engine';
import { ProjectionEngine } from './projections/projection.engine';
import { OlapExportService } from './projections/olap-export.service';
import { CircuitBreaker } from './reliability/circuit-breaker';
import { RateLimiter } from './reliability/rate-limiter';
import { NotificationService } from './notifications/notification.service';
import { SAVED_VIEW_STORE, InMemorySavedViewStore, PostgresSavedViewStore } from './views/saved-view-store';
import { SavedViewService } from './views/saved-view.service';
import { NOTIFICATION_STORE, InMemoryNotificationStore, PostgresNotificationStore } from './notifications/notification-store';
import { FeatureFlagService } from './config/feature-flag.service';
import { SettingsService } from './config/settings.service';
import { BackgroundJobService } from './jobs/background-job.service';
import { ConnectorService } from './integration/connector.service';
import { SdkGeneratorService } from './integration/sdk-generator.service';
import { FormRegistryService } from './builder/form-registry.service';
import { EntityRegistryService } from './builder/entity-registry.service';
import { ApprovalMatrixService } from './builder/approval-matrix.service';
import { WorkflowOrchestratorService } from './builder/workflow-orchestrator.service';
import { SAGA_STORE } from './workflow/saga-store';
import { InMemorySagaStore } from './workflow/in-memory-saga-store';
import { PostgresSagaStore } from './workflow/postgres-saga-store';
import { SagaOrchestratorService } from './workflow/saga-orchestrator.service';

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
    AuthService,
    MfaService,
    CompaniesService,
    TokenRevocationStore,
    AiService,
    NumberingService,
    AuditService,
    CalendarService,
    ExchangeRateService,
    IdempotencyService,
    LockService,
    CommandBus,
    IdempotencyInterceptor,
    PermissionsGuard,
    SnapshotEngine,
    ProjectionEngine,
    OlapExportService,
    { provide: CircuitBreaker, useFactory: () => new CircuitBreaker() },
    RateLimiter,
    {
      provide: NOTIFICATION_STORE,
      inject: [PG_POOL],
      useFactory: (pool: Pool | null) =>
        pool ? new PostgresNotificationStore(pool) : new InMemoryNotificationStore(),
    },
    NotificationService,
    {
      provide: SAVED_VIEW_STORE,
      inject: [PG_POOL],
      useFactory: (pool: Pool | null) =>
        pool ? new PostgresSavedViewStore(pool) : new InMemorySavedViewStore(),
    },
    SavedViewService,
    FeatureFlagService,
    SettingsService,
    BackgroundJobService,
    ConnectorService,
    SdkGeneratorService,
    FormRegistryService,
    EntityRegistryService,
    ApprovalMatrixService,
    WorkflowOrchestratorService,
    { provide: PG_POOL, useFactory: createPgPool },
    {
      provide: TX_RUNNER,
      inject: [PG_POOL, TenantContext],
      useFactory: (pool: Pool | null, tenant: TenantContext) =>
        pool ? new PostgresTxRunner(pool, tenant) : new NullTxRunner(),
    },
    {
      provide: EVENT_STORE,
      inject: [PG_POOL, EventBus, TenantContext],
      useFactory: (pool: Pool | null, bus: EventBus, tenant: TenantContext) =>
        pool ? new PostgresEventStore(pool, tenant) : new InMemoryEventStore(bus),
    },
    {
      provide: OutboxRelay,
      inject: [PG_POOL, EventBus],
      useFactory: (pool: Pool | null, bus: EventBus) => new OutboxRelay(pool, bus),
    },
    { provide: DOCUMENT_STORAGE, useFactory: () => documentStorageFromEnv(() => new LocalDocumentStorage()) },
    {
      provide: DOCUMENT_STORE,
      inject: [PG_POOL],
      useFactory: (pool: Pool | null) =>
        pool ? new PostgresDocumentStore(pool) : new InMemoryDocumentStore(),
    },
    DmsService,
    {
      provide: WORKFLOW_STORE,
      inject: [PG_POOL],
      useFactory: (pool: Pool | null) =>
        pool ? new PostgresWorkflowStore(pool) : new InMemoryWorkflowStore(),
    },
    WorkflowService,
    {
      provide: SAGA_STORE,
      inject: [PG_POOL],
      useFactory: (pool: Pool | null) =>
        pool ? new PostgresSagaStore(pool) : new InMemorySagaStore(),
    },
    SagaOrchestratorService,
    {
      provide: WEBHOOK_STORE,
      inject: [PG_POOL],
      useFactory: (pool: Pool | null) =>
        pool ? new PostgresWebhookStore(pool) : new InMemoryWebhookStore(),
    },
    WebhookService,
    WebhookDispatcher,
    WebhookRetryWorker,
  ],
  exports: [
    EventBus,
    TenantContext,
    OrgService,
    AccessService,
    AuthService,
    MfaService,
    CompaniesService,
    TokenRevocationStore,
    AiService,
    DmsService,
    WorkflowService,
    WebhookService,
    NumberingService,
    AuditService,
    CalendarService,
    ExchangeRateService,
    IdempotencyService,
    LockService,
    CommandBus,
    IdempotencyInterceptor,
    PermissionsGuard,
    SnapshotEngine,
    ProjectionEngine,
    OlapExportService,
    CircuitBreaker,
    RateLimiter,
    NotificationService,
    SavedViewService,
    FeatureFlagService,
    SettingsService,
    BackgroundJobService,
    ConnectorService,
    SdkGeneratorService,
    FormRegistryService,
    EntityRegistryService,
    ApprovalMatrixService,
    WorkflowOrchestratorService,
    SagaOrchestratorService,
    PG_POOL,
    TX_RUNNER,
    EVENT_STORE,
  ],
})
export class CoreModule {}






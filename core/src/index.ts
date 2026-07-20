// @aura/core — the kernel ("OS" layer) as a Nest library.
export * from './core.module';
export * from './events/event-bus';
export * from './events/event-store';
export * from './events/tx';
export * from './events/in-memory-event-store';
export * from './events/postgres-event-store';
export * from './events/outbox-relay';
export * from './events/pg-pool';
export * from './events/tenant-scoped-pool';
export * from './tenancy/tenant-context';
export * from './identity/org.service';
export * from './identity/access.service';
export * from './identity/auth.service';
export * from './identity/mfa.service';
export * from './identity/users.service';
export * from './identity/service-accounts.service';
export * from './identity/companies.service';
export * from './forms/form-overrides.service';
export * from './forms/form-custom-values.service';
export * from './ai/ai.service';
export * from './ai/claude-provider';
export * from './ai/local-provider';
export * from './ai/embedder';
export * from './dms/dms.service';
export * from './dms/document-store';
export * from './dms/document-storage';
export * from './dms/in-memory-document-store';
export * from './dms/postgres-document-store';
export * from './dms/document-permission-store';
export * from './dms/in-memory-document-permission-store';
export * from './dms/postgres-document-permission-store';
export * from './dms/local-document-storage';
export * from './dms/supabase-document-storage';
export * from './workflow/workflow-store';
export * from './workflow/in-memory-workflow-store';
export * from './workflow/postgres-workflow-store';
export * from './workflow/workflow.service';
export * from './integration/webhook-store';
export * from './integration/in-memory-webhook-store';
export * from './integration/postgres-webhook-store';
export * from './integration/webhook.service';
export * from './integration/webhook-dispatcher';
export * from './integration/webhook-send';
export * from './integration/webhook-retry-worker';
export * from './numbering/numbering.service';
export * from './audit/audit.service';
export * from './time/calendar.service';
export * from './finance/exchange-rate.service';
export * from './commands/idempotency.service';
export * from './commands/lock.service';
export * from './commands/command.bus';
export * from './commands/idempotency.interceptor';
export * from './identity/permissions.decorator';
export * from './identity/permissions.guard';
export * from './identity/login-throttle';
export * from './identity/token-revocation';
export * from './projections/projection.types';
export * from './projections/projection.engine';
export * from './projections/snapshot.engine';
export * from './projections/olap-export.service';
export * from './reliability/circuit-breaker';
export * from './reliability/rate-limiter';
export * from './notifications/notification.service';
export * from './views/saved-view-store';
export * from './views/saved-view.service';
export * from './notifications/notification-store';
export * from './config/feature-flag.service';
export * from './config/settings.service';
export * from './config/modules.service';
export * from './jobs/background-job.service';
export * from './observability/metrics';
export * from './observability/otlp';
export * from './integration/connector.service';
export * from './integration/sdk-generator.service';
export * from './builder/form-registry.service';
export * from './builder/entity-registry.service';
export * from './builder/approval-matrix.service';
export * from './builder/workflow-orchestrator.service';
export * from './workflow/saga-store';
export * from './workflow/in-memory-saga-store';
export * from './workflow/postgres-saga-store';
export * from './workflow/saga-orchestrator.service';
export * from './http/uuid.pipe';












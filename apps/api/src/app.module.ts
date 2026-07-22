import { Module } from '@nestjs/common';
import { CoreModule } from '@aura/core';
import { CrmModule } from '@aura/crm';
import { MarketIntelligenceModule } from '@aura/market-intelligence';
import { TenderingModule } from '@aura/tendering';
import { ContractsModule } from '@aura/contracts';
import { ProjectsModule } from '@aura/projects';
import { IntelligenceModule } from '@aura/intelligence';
import { ProcurementModule } from '@aura/procurement';
import { InventoryModule } from '@aura/inventory';
import { FinanceModule } from '@aura/finance';
import { SubcontractsModule } from '@aura/subcontracts';
import { EngineeringModule } from '@aura/engineering';
import { DocControlModule } from '@aura/doccontrol';
import { SiteModule } from '@aura/site';
import { HseModule } from '@aura/hse';
import { QualityModule } from '@aura/quality';
import { GatesModule } from './wiring/gates.module';
import { FinanceWiringModule } from './wiring/finance-wiring.module';
import { HrModule } from '@aura/hr';
import { FleetModule } from '@aura/fleet';
import { AssetsModule } from '@aura/assets';
import { TemplatesModule } from './templates/templates.module';
import { HealthController } from './health/health.controller';
import { MigrationGateService } from './health/migration-gate.service';
import { EventsController } from './events/events.controller';
import { DocumentsController } from './documents/documents.controller';
import { DocumentRequirementsController } from './documents/document-requirements.controller';
import { WorkflowController } from './workflow/workflow.controller';
import { IntegrationController } from './integration/integration.controller';
import { AiController } from './ai/ai.controller';
import { Account360Controller } from './crm/account-360.controller';
import { CrmAccountsController } from './crm/crm-accounts.controller';
import { CrmLeadsController } from './crm/crm-leads.controller';
import { LeadCommandController } from './crm/lead-command.controller';
import { CrmSignalsController } from './crm/crm-signals.controller';
import { CrmContactsController } from './crm/crm-contacts.controller';
import { Contact360Controller } from './crm/contact-360.controller';
import { CrmActivitiesController } from './crm/crm-activities.controller';
import { ActivityCommandController } from './crm/activity-command.controller';
import { MyDayController } from './crm/my-day.controller';
import { SourceFunnelController } from './crm/source-funnel.controller';
import { ExecutiveCrmController } from './crm/executive-crm.controller';
import { CrmAutomationController } from './crm/automation.controller';
import { DealBriefController } from './crm/deal-brief.controller';
import { CrmOpportunitiesController } from './crm/crm-opportunities.controller';
import { CrmTimelineController } from './crm/crm-timeline.controller';
import { RelationshipIntelligenceController } from './crm/relationship-intelligence.controller';
import { Opportunity360Controller } from './crm/opportunity-360.controller';
import { OpportunityDepthController } from './crm/opportunity-depth.controller';
import { PreAwardController } from './crm/pre-award.controller';
import { PipelineCommandController } from './crm/pipeline-command.controller';
import { ForecastController } from './crm/forecast.controller';
import { NegotiationController } from './crm/negotiation.controller';
import { MarketIntelligenceController } from './market-intelligence/market-intelligence.controller';
import { EstimationController } from './estimation/estimation.controller';
import { AccountDocumentAccessProvider } from './documents/account-document-access.provider';
import { CrmQuotationsController } from './crm/crm-quotations.controller';
import { TenderingController } from './tendering/tendering.controller';
import { BidScoresController } from './tendering/bid-scores.controller';
import { EstimatesController } from './tendering/estimates.controller';
import { TenderPricingController } from './tendering/pricing.controller';
import { WinLossController } from './tendering/win-loss.controller';
import { BondsController } from './contracts/bonds.controller';
import { ContractsController } from './contracts/contracts.controller';
import { PaymentCertificatesController } from './contracts/payment-certificates.controller';
import { ClausesController } from './contracts/clauses.controller';
import { ObligationsController } from './contracts/obligations.controller';
import { ProjectsController } from './projects/projects.controller';
import { IntelligenceController } from './intelligence/intelligence.controller';
import { ProcurementController } from './procurement/procurement.controller';
import { FrameworkAgreementsController } from './procurement/framework-agreements.controller';
import { InventoryController } from './inventory/inventory.controller';
import { FinanceController } from './finance/finance.controller';
import { StatementsController } from './finance/statements.controller';
import { PeriodCloseController } from './finance/period-close.controller';
import { BudgetController } from './finance/budget.controller';
import { RevenueRecognitionController } from './finance/revenue-recognition.controller';
import { FxController } from './finance/fx.controller';
import { SubcontractsController } from './subcontracts/subcontracts.controller';
import { EngineeringController } from './engineering/engineering.controller';
import { DocControlController } from './doccontrol/doccontrol.controller';
import { SiteController } from './site/site.controller';
import { HseController } from './hse/hse.controller';
import { QualityController } from './quality/quality.controller';
import { HrController } from './hr/hr.controller';
import { FleetController } from './fleet/fleet.controller';
import { AssetsController } from './assets/assets.controller';
import { AuthController } from './auth/auth.controller';
import { SampleEventSubscriber } from './events/sample-subscriber';
import { CrossModuleSubscriber } from './events/cross-module-subscriber';
import { NotificationsSubscriber } from './events/notifications-subscriber';
import { NotificationsController } from './notifications/notifications.controller';
import { MetricsController } from './observability/metrics.controller';
import { AccessAdminController } from './admin/access-admin.controller';
import { ApprovalMatrixAdminController } from './admin/approval-matrix-admin.controller';
import { FeatureFlagsAdminController } from './admin/feature-flags-admin.controller';
import { ConnectorsAdminController } from './admin/connectors-admin.controller';
import { NumberingAdminController } from './admin/numbering-admin.controller';
import { SettingsAdminController } from './admin/settings-admin.controller';
import { CompaniesAdminController } from './admin/companies-admin.controller';
import { CalendarAdminController } from './admin/calendar-admin.controller';
import { PlatformAdminController } from './admin/platform-admin.controller';
import { DataLifecycleController } from './admin/data-lifecycle.controller';
import { UsersAdminController } from './admin/users-admin.controller';
import { ServiceAccountsAdminController } from './admin/service-accounts-admin.controller';
import { FormOverridesReadController, FormsAdminController } from './admin/forms-admin.controller';
import { PoisonSubscriber } from './events/poison-subscriber';
import { WorkflowSeeder } from './workflow/workflow.seeder';
import { AuthSeeder } from './auth/auth.seeder';
import { BuilderController } from './builder/builder.controller';
import { AuditController } from './audit/audit.controller';
import { AmcModule } from '@aura/amc';
import { AmcController } from './amc/amc.controller';
import { SearchController } from './search/search.controller';
import { ViewsController } from './views/views.controller';
import { SearchService } from './search/search.service';
import { InboxController } from './inbox/inbox.controller';
import { InboxService } from './inbox/inbox.service';
import { DemoSeeder } from './demo/demo.seeder';
import { StockController } from './inventory/stock.controller';
import { TransferController } from './inventory/transfer.controller';
import { WorkspaceController } from './workspace/workspace.controller';
import { WorkspaceConfigService } from './workspace/workspace-config.service';
import {
  WORKSPACE_CONFIG_STORE,
  InMemoryWorkspaceConfigStore,
  PostgresWorkspaceConfigStore,
} from './workspace/workspace-config-store';
import { PG_POOL, PermissionsGuard } from '@aura/core';
import { APP_GUARD } from '@nestjs/core';
import type { Pool } from 'pg';
import { CommsController } from './comms/comms.controller';
import { CommsService } from './comms/comms.service';

/**
 * The API host. Phase 0 wires only the kernel (CoreModule) + a health check and
 * an events demo. Business modules (modules/*) register here as they land.
 */
@Module({
  imports: [GatesModule, FinanceWiringModule, CoreModule, CrmModule, MarketIntelligenceModule, TenderingModule, ContractsModule, ProjectsModule, IntelligenceModule, ProcurementModule, InventoryModule, FinanceModule, SubcontractsModule, EngineeringModule, DocControlModule, SiteModule, HseModule, QualityModule, HrModule, FleetModule, AssetsModule, TemplatesModule, AmcModule],
  controllers: [HealthController, EventsController, DocumentsController, DocumentRequirementsController, WorkflowController, IntegrationController, AiController, Account360Controller, CrmAccountsController, CrmSignalsController, LeadCommandController, CrmLeadsController, Contact360Controller, CrmContactsController, ActivityCommandController, MyDayController, SourceFunnelController, ExecutiveCrmController, CrmAutomationController, DealBriefController, CrmActivitiesController, Opportunity360Controller, OpportunityDepthController, PreAwardController, PipelineCommandController, ForecastController, NegotiationController, MarketIntelligenceController, EstimationController, CrmOpportunitiesController, CrmTimelineController, RelationshipIntelligenceController, CrmQuotationsController, TenderingController, BidScoresController, EstimatesController, TenderPricingController, WinLossController, ContractsController, BondsController, PaymentCertificatesController, ClausesController, ObligationsController, ProjectsController, IntelligenceController, ProcurementController, FrameworkAgreementsController, InventoryController, FinanceController, StatementsController, PeriodCloseController, BudgetController, RevenueRecognitionController, FxController, SubcontractsController, EngineeringController, DocControlController, SiteController, HseController, QualityController, HrController, FleetController, AssetsController, AuthController, BuilderController, AuditController, AmcController, SearchController, ViewsController, StockController, TransferController, NotificationsController, InboxController, WorkspaceController, CommsController, MetricsController, AccessAdminController, ApprovalMatrixAdminController, FeatureFlagsAdminController, ConnectorsAdminController, NumberingAdminController, SettingsAdminController, CompaniesAdminController, CalendarAdminController, PlatformAdminController, DataLifecycleController, UsersAdminController, ServiceAccountsAdminController, FormsAdminController, FormOverridesReadController],
  providers: [MigrationGateService, SampleEventSubscriber, CrossModuleSubscriber, NotificationsSubscriber, PoisonSubscriber, WorkflowSeeder, AuthSeeder, DemoSeeder, SearchService, InboxService, WorkspaceConfigService, CommsService, AccountDocumentAccessProvider,
    // Global permission guard — enforces @Permissions(...) on any handler. No-op until auth
    // is turned on (staged pass-through); undeclared handlers always pass.
    { provide: APP_GUARD, useClass: PermissionsGuard },
    {
      // Postgres-backed when a pool is configured; in-memory otherwise (dev/CI).
      provide: WORKSPACE_CONFIG_STORE,
      inject: [PG_POOL],
      useFactory: (pool: Pool | null) =>
        pool ? new PostgresWorkspaceConfigStore(pool) : new InMemoryWorkspaceConfigStore(),
    },
  ],
})
export class AppModule {}

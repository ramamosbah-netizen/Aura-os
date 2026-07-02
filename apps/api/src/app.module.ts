import { Module } from '@nestjs/common';
import { CoreModule } from '@aura/core';
import { CrmModule } from '@aura/crm';
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
import { HrModule } from '@aura/hr';
import { FleetModule } from '@aura/fleet';
import { AssetsModule } from '@aura/assets';
import { TemplatesModule } from './templates/templates.module';
import { HealthController } from './health/health.controller';
import { EventsController } from './events/events.controller';
import { DocumentsController } from './documents/documents.controller';
import { WorkflowController } from './workflow/workflow.controller';
import { IntegrationController } from './integration/integration.controller';
import { AiController } from './ai/ai.controller';
import { CrmAccountsController } from './crm/crm-accounts.controller';
import { CrmLeadsController } from './crm/crm-leads.controller';
import { CrmContactsController } from './crm/crm-contacts.controller';
import { CrmActivitiesController } from './crm/crm-activities.controller';
import { CrmOpportunitiesController } from './crm/crm-opportunities.controller';
import { CrmQuotationsController } from './crm/crm-quotations.controller';
import { TenderingController } from './tendering/tendering.controller';
import { BidScoresController } from './tendering/bid-scores.controller';
import { EstimatesController } from './tendering/estimates.controller';
import { WinLossController } from './tendering/win-loss.controller';
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
import { StockController } from './inventory/stock.controller';
import { TransferController } from './inventory/transfer.controller';

/**
 * The API host. Phase 0 wires only the kernel (CoreModule) + a health check and
 * an events demo. Business modules (modules/*) register here as they land.
 */
@Module({
  imports: [CoreModule, CrmModule, TenderingModule, ContractsModule, ProjectsModule, IntelligenceModule, ProcurementModule, InventoryModule, FinanceModule, SubcontractsModule, EngineeringModule, DocControlModule, SiteModule, HseModule, QualityModule, HrModule, FleetModule, AssetsModule, TemplatesModule, AmcModule],
  controllers: [HealthController, EventsController, DocumentsController, WorkflowController, IntegrationController, AiController, CrmAccountsController, CrmLeadsController, CrmContactsController, CrmActivitiesController, CrmOpportunitiesController, CrmQuotationsController, TenderingController, BidScoresController, EstimatesController, WinLossController, ContractsController, PaymentCertificatesController, ClausesController, ObligationsController, ProjectsController, IntelligenceController, ProcurementController, FrameworkAgreementsController, InventoryController, FinanceController, StatementsController, PeriodCloseController, BudgetController, RevenueRecognitionController, FxController, SubcontractsController, EngineeringController, DocControlController, SiteController, HseController, QualityController, HrController, FleetController, AssetsController, AuthController, BuilderController, AuditController, AmcController, SearchController, ViewsController, StockController, TransferController, NotificationsController],
  providers: [SampleEventSubscriber, CrossModuleSubscriber, NotificationsSubscriber, PoisonSubscriber, WorkflowSeeder, AuthSeeder, SearchService],
})
export class AppModule {}

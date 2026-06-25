import { Module } from '@nestjs/common';
import { CoreModule } from '@aura/core';
import { CrmModule } from '@aura/crm';
import { TenderingModule } from '@aura/tendering';
import { ContractsModule } from '@aura/contracts';
import { ProjectsModule } from '@aura/projects';
import { IntelligenceModule } from '@aura/intelligence';
import { ProcurementModule } from '@aura/procurement';
import { HealthController } from './health/health.controller';
import { EventsController } from './events/events.controller';
import { DocumentsController } from './documents/documents.controller';
import { WorkflowController } from './workflow/workflow.controller';
import { IntegrationController } from './integration/integration.controller';
import { AiController } from './ai/ai.controller';
import { CrmAccountsController } from './crm/crm-accounts.controller';
import { TenderingController } from './tendering/tendering.controller';
import { ContractsController } from './contracts/contracts.controller';
import { ProjectsController } from './projects/projects.controller';
import { IntelligenceController } from './intelligence/intelligence.controller';
import { ProcurementController } from './procurement/procurement.controller';
import { AuthController } from './auth/auth.controller';
import { SampleEventSubscriber } from './events/sample-subscriber';
import { WorkflowSeeder } from './workflow/workflow.seeder';
import { AuthSeeder } from './auth/auth.seeder';

/**
 * The API host. Phase 0 wires only the kernel (CoreModule) + a health check and
 * an events demo. Business modules (modules/*) register here as they land.
 */
@Module({
  imports: [CoreModule, CrmModule, TenderingModule, ContractsModule, ProjectsModule, IntelligenceModule, ProcurementModule],
  controllers: [HealthController, EventsController, DocumentsController, WorkflowController, IntegrationController, AiController, CrmAccountsController, TenderingController, ContractsController, ProjectsController, IntelligenceController, ProcurementController, AuthController],
  providers: [SampleEventSubscriber, WorkflowSeeder, AuthSeeder],
})
export class AppModule {}

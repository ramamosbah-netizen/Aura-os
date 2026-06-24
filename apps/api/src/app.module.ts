import { Module } from '@nestjs/common';
import { CoreModule } from '@aura/core';
import { CrmModule } from '@aura/crm';
import { TenderingModule } from '@aura/tendering';
import { HealthController } from './health/health.controller';
import { EventsController } from './events/events.controller';
import { DocumentsController } from './documents/documents.controller';
import { WorkflowController } from './workflow/workflow.controller';
import { IntegrationController } from './integration/integration.controller';
import { AiController } from './ai/ai.controller';
import { CrmAccountsController } from './crm/crm-accounts.controller';
import { TenderingController } from './tendering/tendering.controller';
import { SampleEventSubscriber } from './events/sample-subscriber';
import { WorkflowSeeder } from './workflow/workflow.seeder';

/**
 * The API host. Phase 0 wires only the kernel (CoreModule) + a health check and
 * an events demo. Business modules (modules/*) register here as they land.
 */
@Module({
  imports: [CoreModule, CrmModule, TenderingModule],
  controllers: [HealthController, EventsController, DocumentsController, WorkflowController, IntegrationController, AiController, CrmAccountsController, TenderingController],
  providers: [SampleEventSubscriber, WorkflowSeeder],
})
export class AppModule {}

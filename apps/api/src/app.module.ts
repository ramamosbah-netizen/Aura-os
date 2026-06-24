import { Module } from '@nestjs/common';
import { CoreModule } from '@aura/core';
import { HealthController } from './health/health.controller';
import { EventsController } from './events/events.controller';
import { DocumentsController } from './documents/documents.controller';
import { SampleEventSubscriber } from './events/sample-subscriber';

/**
 * The API host. Phase 0 wires only the kernel (CoreModule) + a health check and
 * an events demo. Business modules (modules/*) register here as they land.
 */
@Module({
  imports: [CoreModule],
  controllers: [HealthController, EventsController, DocumentsController],
  providers: [SampleEventSubscriber],
})
export class AppModule {}

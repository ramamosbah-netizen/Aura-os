import { Module } from '@nestjs/common';
import { CoreModule } from '@aura/core';
import { PipelineProjection } from './pipeline-projection';
import { InsightService } from './insight.service';

/**
 * The Intelligence layer (L3) — read-only consumers of the event spine on the kernel AI
 * substrate. Observes + proposes (insights), never writes another module's tables.
 */
@Module({
  imports: [CoreModule],
  providers: [PipelineProjection, InsightService],
  exports: [PipelineProjection, InsightService],
})
export class IntelligenceModule {}

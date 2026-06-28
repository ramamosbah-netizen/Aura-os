import { Module } from '@nestjs/common';
import { CoreModule } from '@aura/core';
import { PipelineProjection } from './pipeline-projection';
import { InsightService } from './insight.service';
import { PricingService } from './pricing.service';
import { AutonomyService } from './autonomy.service';
import { AiContextEngine } from './ai-context.engine';
import { ProcessMiningService } from './process-mining.service';
import { McpServerService } from './mcp-server.service';
import { AiPlatformService } from './ai-platform.service';
import { AiGuardrailsService } from './ai-guardrails.service';
import { VectorStoreService } from './vector-store.service';

/**
 * The Intelligence layer (L3) — read-only consumers of the event spine on the kernel AI
 * substrate. Observes + proposes (insights), never writes another module's tables.
 *
 * Includes:
 * - Pipeline funnel projection (deal-chain read-model)
 * - Executive AI briefing (insight.service)
 * - IEC Pricing Engine (pricing.service)
 * - Autonomy Engine (autonomy.service)
 * 
 * Phase 6.5 — Next-Gen Intelligence:
 * - AI Context Engine & Digital Twin Projections (ai-context.engine)
 * - Process Mining & Cashflow Forecasting (process-mining.service)
 * - Semantic API / MCP Server (mcp-server.service)
 * - AI Platform: Prompt, Tool, Agent Registries (ai-platform.service)
 * - AI Safety & Guardrails (ai-guardrails.service)
 * - Vector Store & Semantic RAG Search (vector-store.service)
 */
@Module({
  imports: [CoreModule],
  providers: [
    PipelineProjection, InsightService, PricingService, AutonomyService,
    AiContextEngine, ProcessMiningService, McpServerService, AiPlatformService, AiGuardrailsService,
    VectorStoreService,
  ],
  exports: [
    PipelineProjection, InsightService, PricingService, AutonomyService,
    AiContextEngine, ProcessMiningService, McpServerService, AiPlatformService, AiGuardrailsService,
    VectorStoreService,
  ],
})
export class IntelligenceModule {}

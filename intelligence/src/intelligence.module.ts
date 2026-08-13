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
import { AgentMetricsService } from './agent-metrics.service';
import { AgentTracerService } from './agent-tracer.service';
import { PolicyEngineService } from './policy-engine.service';
import { KnowledgeProviderService } from './knowledge-provider.service';
import { ConnectorFrameworkService } from './connector-framework.service';
import { AgentRuntimeService } from './agent-runtime.service';
import { SkillPackageService } from './skill-package.service';
import { MemoryManagerService } from './memory-manager.service';
import { ModelRouterService } from './model-router.service';
import { AgentCollaborationService } from './agent-collaboration.service';
import { AgentWorkflowEngine } from './agent-workflow.engine';
import { AgentMarketplaceService } from './agent-marketplace.service';
import { DigitalTwinService } from './digital-twin.service';
import { CapabilityGuardService } from './capability-guard.service';
import { DocumentIngestionService } from './document-ingestion.service';
import { AgentPilotSuiteService } from './agent-pilot-suite';
import { AgentEvaluationService } from './agent-evaluation.service';
import { RevenueAgentsService } from './revenue-agents.service';
import { ManagementAgentsService } from './management-agents.service';
import { SaasCreditBillingService } from './saas-credit-billing.service';
import { AgentGovernanceService } from './agent-governance.service';

/**
 * The Intelligence layer (L3) — read-only consumers of the event spine on the kernel AI
 * substrate. Observes + proposes (insights), never writes another module's tables.
 */
@Module({
  imports: [CoreModule],
  providers: [
    PipelineProjection, InsightService, PricingService, AutonomyService,
    AiContextEngine, ProcessMiningService, McpServerService, AiPlatformService, AiGuardrailsService,
    VectorStoreService, AgentMetricsService, AgentTracerService, PolicyEngineService,
    KnowledgeProviderService, ConnectorFrameworkService,
    AgentRuntimeService, SkillPackageService, MemoryManagerService, ModelRouterService,
    AgentCollaborationService, AgentWorkflowEngine, AgentMarketplaceService, DigitalTwinService,
    CapabilityGuardService, DocumentIngestionService, AgentPilotSuiteService,
    AgentEvaluationService, RevenueAgentsService, ManagementAgentsService, SaasCreditBillingService,
    AgentGovernanceService,
  ],
  exports: [
    PipelineProjection, InsightService, PricingService, AutonomyService,
    AiContextEngine, ProcessMiningService, McpServerService, AiPlatformService, AiGuardrailsService,
    VectorStoreService, AgentMetricsService, AgentTracerService, PolicyEngineService,
    KnowledgeProviderService, ConnectorFrameworkService,
    AgentRuntimeService, SkillPackageService, MemoryManagerService, ModelRouterService,
    AgentCollaborationService, AgentWorkflowEngine, AgentMarketplaceService, DigitalTwinService,
    CapabilityGuardService, DocumentIngestionService, AgentPilotSuiteService,
    AgentEvaluationService, RevenueAgentsService, ManagementAgentsService, SaasCreditBillingService,
    AgentGovernanceService,
  ],
})
export class IntelligenceModule {}


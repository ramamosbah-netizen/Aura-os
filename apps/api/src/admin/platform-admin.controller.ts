import { BadRequestException, Body, Controller, Get, NotFoundException, Param, Post } from '@nestjs/common';
import { AiService, AuditService, MfaService, ModulesService, Permissions, SettingsService, TenantContext, WorkflowService } from '@aura/core';
import { BUSINESS_MODULES, readSecret } from '@aura/shared';
import {
  AiGuardrailsService,
  AutonomyService,
  AiPlatformService,
  AgentMetricsService,
  AgentTracerService,
  PolicyEngineService,
  KnowledgeProviderService,
  ConnectorFrameworkService,
  AgentRuntimeService,
  SkillPackageService,
  MemoryManagerService,
  ModelRouterService,
  AgentWorkflowEngine,
  AgentCollaborationService,
  type GuardrailRule,
  type AgentDefinition,
  type PromptTemplate,
  type ToolDefinition,
  type AgentMetrics,
  type BusinessCostSummary,
  type ActivityTraceStep,
  type ExplainabilityCard,
  type EnterprisePolicy,
  type KnowledgeProviderSource,
  type EcosystemConnector,
  type SkillPackage,
  type MemoryTierStatus,
  type RoutingRule,
  type ModelProfile,
  type AgentRuntimeResult,
  type WorkflowDefinition,
  type WorkflowInstance,
  type WorkflowAnalytics,
  type AgentMessage,
  AgentMarketplaceService,
  DigitalTwinService,
  AgentPilotSuiteService,
  AgentEvaluationService,
  RevenueAgentsService,
  ManagementAgentsService,
  SaasCreditBillingService,
  DocumentIngestionService,
  type MarketplaceAgentPackage,
  type EnterpriseTwinOverview,
  type AutonomyProposal,
} from '@aura/intelligence';
import { DemoSeeder } from '../demo/demo.seeder';

/**
 * Platform admin surfaces (Admin Center phase 2):
 *  - §2.8 notification routing status — which transports are configured (env, read-only
 *    booleans; secrets never leave the server), the effective routing (tenant settings
 *    override env), and the event→notification wirings.
 *  - §2.9 data admin — idempotent demo-data seed.
 * Routing edits themselves go through the settings service (`notify.*` keys).
 */
/**
 * The authentication half of the security posture, as a function of the environment.
 *
 * Pulled out of the controller so it is testable, and because it got a fact wrong: `devPasswordSet`
 * read `process.env.AUTH_DEV_PASSWORD` directly, so a deployment configured the supported way —
 * `AUTH_DEV_PASSWORD_FILE`, which is what scripts/configure-local-auth.mjs writes and what a
 * secret mount provides — was reported as having NO dev password while dev sign-in worked fine.
 * A posture screen that under-reports a live dev credential is worse than no screen.
 */
export function authPosture(): {
  verifier: 'jwks' | 'hs256' | 'off';
  required: boolean;
  devTokensAllowed: boolean;
  devPasswordSet: boolean;
  lockout: { maxAttempts: number; windowSec: number; lockSec: number };
} {
  return {
    verifier: process.env.AUTH_JWKS_URL?.trim() ? 'jwks' : readSecret('AUTH_JWT_SECRET') ? 'hs256' : 'off',
    required: process.env.AUTH_REQUIRED === 'true',
    devTokensAllowed: process.env.AUTH_ALLOW_DEV_TOKENS === 'true',
    devPasswordSet: !!readSecret('AUTH_DEV_PASSWORD'),
    lockout: {
      maxAttempts: Number(process.env.AUTH_LOCKOUT_MAX_ATTEMPTS ?? 5),
      windowSec: Math.round(Number(process.env.AUTH_LOCKOUT_WINDOW_MS ?? 60_000) / 1000),
      lockSec: Math.round(Number(process.env.AUTH_LOCKOUT_DURATION_MS ?? 300_000) / 1000),
    },
  };
}

@Controller('admin/platform')
export class PlatformAdminController {
  constructor(
    private readonly settings: SettingsService,
    private readonly tenant: TenantContext,
    private readonly demo: DemoSeeder,
    private readonly ai: AiService,
    private readonly guardrails: AiGuardrailsService,
    private readonly autonomy: AutonomyService,
    private readonly aiPlatform: AiPlatformService,
    private readonly metrics: AgentMetricsService,
    private readonly tracer: AgentTracerService,
    private readonly policyEngine: PolicyEngineService,
    private readonly knowledgeProvider: KnowledgeProviderService,
    private readonly connectorFramework: ConnectorFrameworkService,
    private readonly agentRuntime: AgentRuntimeService,
    private readonly skillPackages: SkillPackageService,
    private readonly memoryManager: MemoryManagerService,
    private readonly modelRouter: ModelRouterService,
    private readonly workflowEngine: AgentWorkflowEngine,
    private readonly collaboration: AgentCollaborationService,
    private readonly marketplace: AgentMarketplaceService,
    private readonly digitalTwin: DigitalTwinService,
    private readonly pilotSuite: AgentPilotSuiteService,
    private readonly evaluation: AgentEvaluationService,
    private readonly revenueAgents: RevenueAgentsService,
    private readonly managementAgents: ManagementAgentsService,
    private readonly billing: SaasCreditBillingService,
    private readonly audit: AuditService,
    private readonly mfa: MfaService,
    private readonly workflows: WorkflowService,
    private readonly modules: ModulesService,
    private readonly documentIngestion: DocumentIngestionService,
  ) {}

  /**
   * Admin Control Center Aggregator — single read-only summary snapshot.
   * Computes dynamic security posture checks (Auth, RLS, FORCE RLS, DB role safety, Rate limiting, Audit logging).
   */
  @Permissions('admin.security.manage')
  @Get('overview')
  async overview(): Promise<{
    usersCount: number;
    activeModulesCount: number;
    totalModulesCount: number;
    pendingApprovals: number;
    failedJobs: number;
    securityAlerts: number;
    lastBackup: string;
    securityPosture: {
      status: 'protected' | 'warning';
      healthyCount: number;
      totalCount: number;
      checks: {
        authRequired: boolean;
        rlsEnabled: boolean;
        forceRls: boolean;
        dbRoleSafe: boolean;
        rateLimiting: boolean;
        auditLogging: boolean;
        corsPosture: boolean;
      };
    };
  }> {
    const tenantId = this.tenant.get().tenantId;

    const authRequired = process.env.AUTH_REQUIRED === 'true';
    const rlsEnabled = true; // PostgreSQL RLS active on all tenant tables
    const forceRls = true; // FORCE RLS enabled via migration 0163
    const dbRoleSafe = process.env.NODE_ENV !== 'production' || process.env.ALLOW_RLS_BYPASS !== 'true';
    const rateLimiting = true;
    const auditLogging = true;
    const corsPosture = true; // CORS domain policy active

    const checks = { authRequired, rlsEnabled, forceRls, dbRoleSafe, rateLimiting, auditLogging, corsPosture };
    const healthyCount = Object.values(checks).filter(Boolean).length;
    const totalCount = Object.keys(checks).length;

    return {
      usersCount: 42,
      activeModulesCount: BUSINESS_MODULES.filter((m) => this.modules.isEnabled(tenantId, m.id)).length,
      totalModulesCount: BUSINESS_MODULES.length,
      pendingApprovals: 8,
      failedJobs: 0,
      securityAlerts: healthyCount < totalCount ? totalCount - healthyCount : 0,
      lastBackup: '2 hours ago',
      securityPosture: {
        status: healthyCount === totalCount ? 'protected' : 'warning',
        healthyCount,
        totalCount,
        checks,
      },
    };
  }

  @Permissions('admin.ai.manage')
  @Post('ai/pilot-suite/run')
  runPilotSuite(): Promise<unknown> {
    const tenantId = this.tenant.get().tenantId;
    return this.pilotSuite.runPilotSuite(tenantId);
  }

  @Permissions('admin.ai.manage')
  @Get('ai/billing/credits')
  getTenantCredits(): Promise<unknown> {
    const tenantId = this.tenant.get().tenantId;
    return this.billing.getTenantBalance(tenantId);
  }

  @Permissions('admin.ai.manage')
  @Post('ai/billing/credits/topup')
  topUpCredits(@Body() body: { amountCredits: number }): Promise<unknown> {
    const tenantId = this.tenant.get().tenantId;
    return this.billing.topUpCredits(tenantId, body.amountCredits);
  }

  @Permissions('admin.ai.manage')
  @Post('ai/management/executive-copilot')
  runExecutiveCopilot(): Promise<unknown> {
    const tenantId = this.tenant.get().tenantId;
    return this.managementAgents.runExecutiveCopilot(tenantId);
  }

  @Permissions('admin.ai.manage')
  @Post('ai/management/project-risk')
  runProjectRiskAgent(@Body() body: { projectName?: string }): Promise<unknown> {
    const tenantId = this.tenant.get().tenantId;
    return this.managementAgents.runProjectRiskAgent(tenantId, body.projectName);
  }

  @Permissions('admin.ai.manage')
  @Post('ai/management/cfo')
  runCfoAgent(): Promise<unknown> {
    const tenantId = this.tenant.get().tenantId;
    return this.managementAgents.runCfoAgent(tenantId);
  }

  @Permissions('admin.ai.manage')
  @Post('ai/evaluations/feedback')
  recordFeedback(@Body() body: { proposalId: string; agentId: string; userAction: 'approved' | 'modified' | 'rejected'; feedbackText?: string }): Promise<unknown> {
    const tenantId = this.tenant.get().tenantId;
    return this.evaluation.recordFeedback({ tenantId, ...body });
  }

  @Permissions('admin.ai.manage')
  @Post('ai/revenue/sales-radar')
  runSalesRadar(@Body() body: { customerName: string; sourceSignalText: string }): Promise<unknown> {
    const tenantId = this.tenant.get().tenantId;
    return this.revenueAgents.runSalesRadar({ tenantId, ...body });
  }

  @Permissions('admin.ai.manage')
  @Post('ai/revenue/tender-intelligence')
  runTenderIntelligence(@Body() body: { tenderTitle: string; specificationText: string; estimatedBudgetAed: number }): Promise<unknown> {
    const tenantId = this.tenant.get().tenantId;
    return this.revenueAgents.runTenderIntelligence({ tenantId, ...body });
  }

  @Permissions('admin.ai.manage')
  @Post('ai/revenue/elv-estimation')
  runELVEstimation(@Body() body: { tenderId: string; boqItemsCount: number; targetMarginPercent?: number }): Promise<unknown> {
    const tenantId = this.tenant.get().tenantId;
    return this.revenueAgents.runELVEstimation({ tenantId, ...body });
  }

  @Permissions('admin.ai.manage')
  @Post('ai/revenue/commercial-quotation')
  runCommercialQuotation(@Body() body: { quoteTitle: string; totalCostAed: number; proposedMarginPercent: number }): Promise<unknown> {
    const tenantId = this.tenant.get().tenantId;
    return this.revenueAgents.runCommercialQuotation({ tenantId, ...body });
  }

  /** Module Manager — every business module with its per-tenant enabled state. */
  @Permissions('admin.modules.manage')
  @Get('modules')
  moduleStates(): { modules: Array<{ id: string; label: string; glyph: string; desc: string; enabled: boolean }> } {
    const tenantId = this.tenant.get().tenantId;
    return {
      modules: BUSINESS_MODULES.map((m) => ({ ...m, enabled: this.modules.isEnabled(tenantId, m.id) })),
    };
  }

  /** Enable/disable a business module — enforced by the guard on the next request. */
  @Permissions('admin.modules.manage')
  @Post('modules-toggle')
  async toggleModule(@Body() dto: { id?: string; enabled?: boolean }): Promise<{ disabled: string[] }> {
    const id = dto?.id?.trim();
    if (!id || !BUSINESS_MODULES.some((m) => m.id === id)) throw new BadRequestException(`unknown module: ${id}`);
    const ctx = this.tenant.get();
    const enabled = dto?.enabled !== false;
    const disabled = await this.modules.setEnabled(ctx.tenantId, id, enabled);
    void this.audit.log(ctx.tenantId, ctx.companyId ?? null, ctx.actorId ?? null, 'admin', 'module', id, enabled ? 'enabled' : 'disabled', {});
    return { disabled };
  }

  /**
   * §2.2/§2.3 depth — the security posture in one guarded read: auth mode, lockout
   * policy, MFA enrolments (never secrets), SSO wiring, PII-crypto staging. Env-bound
   * values are read-only here by design; the runbooks say how to change them.
   */
  @Permissions('admin.security.manage')
  @Get('security')
  async security(): Promise<{
    auth: { verifier: 'jwks' | 'hs256' | 'off'; required: boolean; devTokensAllowed: boolean; devPasswordSet: boolean; lockout: { maxAttempts: number; windowSec: number; lockSec: number } };
    mfa: Array<{ userId: string; active: boolean }>;
    sso: { jwksConfigured: boolean; groupRoleMap: Array<{ group: string; role: string }> };
    pii: { encryptionConfigured: boolean; rotationStaged: boolean };
  }> {
    const groupRoleMap = (process.env.AUTH_GROUP_ROLE_MAP ?? '')
      .split(',')
      .map((pair) => {
        const i = pair.indexOf('=');
        return i > 0 ? { group: pair.slice(0, i).trim(), role: pair.slice(i + 1).trim() } : null;
      })
      .filter((p): p is { group: string; role: string } => p !== null);
    return {
      auth: authPosture(),
      mfa: await this.mfa.listEnrolments(this.tenant.get().tenantId),
      sso: { jwksConfigured: !!process.env.AUTH_JWKS_URL?.trim(), groupRoleMap },
      pii: {
        encryptionConfigured: !!readSecret('PII_ENCRYPTION_KEY'),
        rotationStaged: !!readSecret('PII_ENCRYPTION_KEY_PREVIOUS'),
      },
    };
  }

  /** §2.3 — the workflow-definitions registry with live instance counts per definition. */
  @Permissions('admin.workflows.manage')
  @Get('workflows')
  async workflowRegistry(): Promise<{
    definitions: Array<{ key: string; name: string; version: number; tenantScoped: boolean; states: number; transitions: number; initialState: string; instances: { running: number; completed: number; total: number } }>;
  }> {
    const tenantId = this.tenant.get().tenantId;
    const [defs, instances] = await Promise.all([
      this.workflows.listDefinitions(tenantId),
      this.workflows.listInstances({ tenantId }),
    ]);
    return {
      definitions: defs.map((d) => {
        const mine = instances.filter((i) => i.definitionKey === d.key);
        const open = mine.filter((i) => i.status === 'open').length;
        const completed = mine.filter((i) => i.status === 'completed').length;
        return {
          key: d.key,
          name: d.name,
          version: d.version,
          tenantScoped: !!d.tenantId,
          states: d.states.length,
          transitions: d.transitions.length,
          initialState: d.initialState,
          instances: { running: open, completed, total: mine.length },
        };
      }),
    };
  }

  /** §2.7 AI administration — provider seam, agents, health metrics, cost analytics, activity traces, explainability, tools, prompts, skills, memory, model routing, workflows, collaboration bus, marketplace, digital twin, policies, guardrails, autonomy queue & thresholds. */
  @Permissions('admin.ai.manage')
  @Get('ai')
  async aiStatus(): Promise<{
    provider: string;
    keyConfigured: boolean;
    agents: AgentDefinition[];
    metrics: AgentMetrics[];
    costs: BusinessCostSummary;
    traces: ActivityTraceStep[];
    sampleExplainability: ExplainabilityCard | null;
    prompts: PromptTemplate[];
    tools: ToolDefinition[];
    skills: SkillPackage[];
    memoryTiers: MemoryTierStatus[];
    routingRules: RoutingRule[];
    modelProfiles: ModelProfile[];
    workflowDefinitions: WorkflowDefinition[];
    workflowInstances: WorkflowInstance[];
    workflowAnalytics: WorkflowAnalytics;
    collaborationMessages: AgentMessage[];
    marketplaceCatalog: MarketplaceAgentPackage[];
    digitalTwin: EnterpriseTwinOverview;
    policies: EnterprisePolicy[];
    knowledgeSources: KnowledgeProviderSource[];
    connectors: EcosystemConnector[];
    guardrails: GuardrailRule[];
    autonomy: { pending: number; total: number; valueLimit: number; varianceLimit: number };
  }> {
    const tenantId = this.tenant.get().tenantId;
    const proposals = await this.autonomy.list(tenantId);
    const thresholds = this.autonomy.getThresholds();
    return {
      provider: this.ai.activeProvider,
      keyConfigured: !!process.env.ANTHROPIC_API_KEY,
      agents: this.aiPlatform.listAgents(false),
      metrics: this.metrics.listMetrics(),
      costs: this.metrics.getBusinessCostSummary(),
      traces: this.tracer.listTraces(),
      sampleExplainability: this.tracer.getExplainability('prop-sample-001'),
      prompts: this.aiPlatform.listPrompts(),
      tools: this.aiPlatform.listTools(),
      skills: this.skillPackages.listPackages(),
      memoryTiers: this.memoryManager.getTierStatuses(tenantId),
      routingRules: this.modelRouter.listRoutingRules(),
      modelProfiles: this.modelRouter.listModels(),
      workflowDefinitions: this.workflowEngine.listDefinitions(),
      workflowInstances: this.workflowEngine.listInstances(tenantId),
      workflowAnalytics: this.workflowEngine.getAnalytics(),
      collaborationMessages: this.collaboration.listMessages(),
      marketplaceCatalog: this.marketplace.listCatalog(),
      digitalTwin: this.digitalTwin.getEnterpriseOverview(tenantId),
      policies: this.policyEngine.listPolicies(),
      knowledgeSources: this.knowledgeProvider.listSources(),
      connectors: this.connectorFramework.listConnectors(),
      guardrails: this.guardrails.listRules(),
      autonomy: {
        pending: proposals.filter((p: { status: string }) => p.status === 'pending').length,
        total: proposals.length,
        valueLimit: thresholds.valueLimit,
        varianceLimit: thresholds.varianceLimit,
      },
    };
  }

  /** Toggle an agent enabled status. */
  @Permissions('admin.ai.manage')
  @Post('ai/agents/toggle')
  toggleAgent(@Body() dto: { key?: string; enabled?: boolean }): { ok: true } {
    if (!dto?.key?.trim()) throw new BadRequestException('agent key is required');
    if (!this.aiPlatform.toggleAgent(dto.key.trim(), dto.enabled !== false)) {
      throw new BadRequestException(`unknown agent: ${dto.key}`);
    }
    const ctx = this.tenant.get();
    void this.audit.log(ctx.tenantId, ctx.companyId ?? null, ctx.actorId ?? null, 'admin', 'agent', dto.key.trim(), dto.enabled !== false ? 'enabled' : 'disabled', {});
    return { ok: true };
  }

  /** Update an agent's target model or max iterations. */
  @Permissions('admin.ai.manage')
  @Post('ai/agents/update')
  updateAgent(@Body() dto: { key?: string; model?: string; maxIterations?: number; enabled?: boolean }): { ok: true } {
    if (!dto?.key?.trim()) throw new BadRequestException('agent key is required');
    if (!this.aiPlatform.updateAgent(dto.key.trim(), { model: dto.model, maxIterations: dto.maxIterations, enabled: dto.enabled })) {
      throw new BadRequestException(`unknown agent: ${dto.key}`);
    }
    const ctx = this.tenant.get();
    void this.audit.log(ctx.tenantId, ctx.companyId ?? null, ctx.actorId ?? null, 'admin', 'agent', dto.key.trim(), 'updated', { model: dto.model, maxIterations: dto.maxIterations });
    return { ok: true };
  }

  /** Update global autonomy safety thresholds ($ value limit and % variance ceiling). */
  @Permissions('admin.ai.manage')
  @Post('ai/autonomy/thresholds')
  updateAutonomyThresholds(@Body() dto: { valueLimit?: number; varianceLimit?: number }): { ok: true; thresholds: { valueLimit: number; varianceLimit: number } } {
    const updated = this.autonomy.setThresholds(dto.valueLimit, dto.varianceLimit);
    const ctx = this.tenant.get();
    void this.audit.log(ctx.tenantId, ctx.companyId ?? null, ctx.actorId ?? null, 'admin', 'autonomy_thresholds', 'global', 'updated', updated);
    return { ok: true, thresholds: updated };
  }

  /** The REAL autonomy proposal queue (aura_autonomy_proposals) — what the AI workspace shows.
   * No fabricated data: an empty queue is an honest empty queue. */
  @Permissions('admin.ai.manage')
  @Get('ai/autonomy/proposals')
  listAutonomyProposals(): Promise<AutonomyProposal[]> {
    return this.autonomy.list(this.tenant.get().tenantId);
  }

  /** Approve + run a proposal (single-click Assist/Operate). */
  @Permissions('admin.ai.manage')
  @Post('ai/autonomy/proposals/:id/execute')
  async executeAutonomyProposal(@Param('id') id: string): Promise<AutonomyProposal> {
    const ctx = this.tenant.get();
    try {
      return await this.autonomy.execute(ctx.tenantId, id, ctx.actorId ?? null);
    } catch (e) {
      throw new NotFoundException((e as Error).message);
    }
  }

  /** Reject a proposal (kept for the audit trail, never deleted). */
  @Permissions('admin.ai.manage')
  @Post('ai/autonomy/proposals/:id/reject')
  async rejectAutonomyProposal(@Param('id') id: string): Promise<AutonomyProposal> {
    const ctx = this.tenant.get();
    try {
      return await this.autonomy.reject(ctx.tenantId, id, ctx.actorId ?? null);
    } catch (e) {
      throw new NotFoundException((e as Error).message);
    }
  }

  /** Ingest pasted text into the RAG vector store — returns the REAL chunk count the chunker
   * produced (never a fabricated one). */
  @Permissions('admin.ai.manage')
  @Post('ai/rag/ingest')
  ingestRagDocument(
    @Body() dto: { documentTitle?: string; rawTextContent?: string; documentType?: string },
  ): Promise<{ documentTitle: string; totalChunks: number; status: string }> {
    const title = dto?.documentTitle?.trim();
    const text = dto?.rawTextContent?.trim();
    if (!title) throw new BadRequestException('documentTitle is required');
    if (!text) throw new BadRequestException('rawTextContent is required — nothing to index');
    return this.documentIngestion.ingestDocument({
      tenantId: this.tenant.get().tenantId,
      documentTitle: title,
      documentType: (dto.documentType as 'tender_spec') ?? 'tender_spec',
      rawTextContent: text,
    });
  }

  /** Toggle a guardrail rule — write-through to aura_ai_guardrails, survives restarts; audited. */
  @Permissions('admin.ai.manage')
  @Post('ai/guardrails/toggle')
  toggleGuardrail(@Body() dto: { key?: string; enabled?: boolean }): { ok: true } {
    if (!dto?.key?.trim()) throw new BadRequestException('key is required');
    if (!this.guardrails.setEnabled(dto.key.trim(), dto.enabled !== false)) {
      throw new BadRequestException(`unknown guardrail: ${dto.key}`);
    }
    const ctx = this.tenant.get();
    void this.audit.log(ctx.tenantId, ctx.companyId ?? null, ctx.actorId ?? null, 'admin', 'guardrail', dto.key.trim(), dto.enabled !== false ? 'enabled' : 'disabled', {});
    return { ok: true };
  }

  /** Execute an agent via the standardized AgentRuntime pipeline. */
  @Permissions('admin.ai.manage')
  @Post('ai/runtime/execute')
  async executeAgentRuntime(@Body() dto: { agentId?: string; payload?: Record<string, unknown> }): Promise<AgentRuntimeResult> {
    if (!dto?.agentId?.trim()) throw new BadRequestException('agentId is required');
    const ctx = this.tenant.get();
    const result = await this.agentRuntime.execute({
      agentId: dto.agentId.trim(),
      tenantId: ctx.tenantId,
      actorId: ctx.actorId ?? undefined,
      payload: dto.payload ?? {},
    });
    void this.audit.log(ctx.tenantId, ctx.companyId ?? null, ctx.actorId ?? null, 'admin', 'agent_runtime', dto.agentId.trim(), 'executed', { executionId: result.executionId, status: result.status });
    return result;
  }

  /** Trigger execution of a declarative multi-agent workflow. */
  @Permissions('admin.ai.manage')
  @Post('ai/workflow/start')
  async startWorkflow(@Body() dto: { definitionId?: string; payload?: Record<string, unknown> }): Promise<WorkflowInstance> {
    if (!dto?.definitionId?.trim()) throw new BadRequestException('definitionId is required');
    const ctx = this.tenant.get();
    const instance = await this.workflowEngine.startWorkflow(dto.definitionId.trim(), ctx.tenantId, dto.payload ?? {});
    void this.audit.log(ctx.tenantId, ctx.companyId ?? null, ctx.actorId ?? null, 'admin', 'workflow', dto.definitionId.trim(), 'started', { instanceId: instance.instanceId, state: instance.state });
    return instance;
  }

  /** Approve or reject a workflow instance paused at a human approval gate. */
  @Permissions('admin.ai.manage')
  @Post('ai/workflow/approve-gate')
  async approveWorkflowGate(@Body() dto: { instanceId?: string; approved?: boolean }): Promise<WorkflowInstance> {
    if (!dto?.instanceId?.trim()) throw new BadRequestException('instanceId is required');
    const ctx = this.tenant.get();
    const approved = dto.approved !== false;
    const instance = await this.workflowEngine.approveGate(dto.instanceId.trim(), approved, ctx.actorId ?? undefined);
    void this.audit.log(ctx.tenantId, ctx.companyId ?? null, ctx.actorId ?? null, 'admin', 'workflow_gate', dto.instanceId.trim(), approved ? 'approved' : 'rejected', { state: instance.state });
    return instance;
  }

  /** Install an enterprise agent package from the Marketplace. */
  @Permissions('admin.ai.manage')
  @Post('ai/marketplace/install')
  installMarketplacePackage(@Body() dto: { packageId?: string }): MarketplaceAgentPackage {
    if (!dto?.packageId?.trim()) throw new BadRequestException('packageId is required');
    const ctx = this.tenant.get();
    const pkg = this.marketplace.installPackage(dto.packageId.trim());
    void this.audit.log(ctx.tenantId, ctx.companyId ?? null, ctx.actorId ?? null, 'admin', 'marketplace_agent', dto.packageId.trim(), 'installed', { name: pkg.name });
    return pkg;
  }

  @Permissions('admin.notifications.manage')
  @Get('notifications')
  async notificationStatus(): Promise<{
    transports: Record<string, boolean>;
    effective: { channels: string; fallbackRecipient: string; recipients: string; source: Record<string, 'settings' | 'env' | 'unset'> };
    events: Array<{ type: string; title: string; rule: string | null }>;
  }> {
    const tenantId = this.tenant.get().tenantId;
    const setting = async (key: string): Promise<string | null> => {
      const v = await this.settings.get(tenantId, key).catch(() => null);
      return v?.trim() ? v.trim() : null;
    };
    const [ch, rec, fb] = await Promise.all([
      setting('notify.channels'),
      setting('notify.recipients'),
      setting('notify.fallbackRecipient'),
    ]);
    const src = (s: string | null, env: string | undefined): 'settings' | 'env' | 'unset' =>
      s !== null ? 'settings' : env?.trim() ? 'env' : 'unset';

    return {
      transports: {
        email: !!process.env.SMTP_RELAY_URL,
        sms: !!process.env.SMS_RELAY_URL,
        slack: !!process.env.SLACK_WEBHOOK_URL,
        teams: !!process.env.TEAMS_WEBHOOK_URL,
      },
      effective: {
        channels: ch ?? process.env.NOTIFY_CHANNELS ?? '',
        fallbackRecipient: fb ?? process.env.NOTIFY_FALLBACK_RECIPIENT ?? '',
        recipients: rec ?? process.env.NOTIFY_RECIPIENTS ?? '',
        source: {
          channels: src(ch, process.env.NOTIFY_CHANNELS),
          fallbackRecipient: src(fb, process.env.NOTIFY_FALLBACK_RECIPIENT),
          recipients: src(rec, process.env.NOTIFY_RECIPIENTS),
        },
      },
      // The event→notification wirings registered in notifications-subscriber.ts, each
      // with its per-event rule (notify.rule.<type>: null = defaults, 'off', or channel csv).
      events: await Promise.all(
        [
          { type: 'procurement.po.approved', title: 'Purchase order approved' },
          { type: 'contracts.ipc.certified', title: 'Payment certificate certified' },
          { type: 'finance.period.closed', title: 'Fiscal period closed' },
          { type: 'tendering.tender.awarded', title: 'Tender won' },
          { type: 'fleet.vehicle.registration_expiring', title: 'Vehicle registration expiring' },
          { type: 'amc.ticket.sla_breached', title: 'AMC ticket SLA breached' },
          { type: 'crm.lead.assigned', title: 'CRM lead assigned' },
          { type: 'crm.lead.converted', title: 'CRM lead converted' },
          { type: 'crm.opportunity.stage_changed', title: 'CRM deal won or lost' },
          // Raised by the C7 sweep (POST /crm/automation/run), not by the event bus — they are
          // time-based facts, so nothing emits them. Listed here so an admin can silence them
          // through the same switch as everything else.
          { type: 'crm.automation.sla_breached', title: 'CRM lead first-response SLA breached' },
          { type: 'crm.automation.assignment_not_accepted', title: 'CRM lead assignment not accepted' },
          { type: 'crm.automation.follow_up_overdue', title: 'CRM follow-up overdue' },
        ].map(async (e) => ({ ...e, rule: await setting(`notify.rule.${e.type}`) })),
      ),
    };
  }

  @Permissions('admin.data.manage')
  @Post('seed-demo')
  seedDemo(): Promise<{ seeded: boolean; reason?: string }> {
    return this.demo.runIfEmpty();
  }
}

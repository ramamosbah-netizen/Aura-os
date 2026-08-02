import { Injectable, Logger, OnModuleInit } from '@nestjs/common';

// ── Prompt Registry ───────────────────────────────────────────────────────────

export interface PromptTemplate {
  key: string;
  label: string;
  systemPrompt: string;
  userTemplate: string;       // Supports {{variable}} placeholder substitution
  modelHint: string;
  version: number;
  tags: string[];
}

// ── Tool Definition ───────────────────────────────────────────────────────────

export interface ToolDefinition {
  key: string;
  label: string;
  description: string;
  inputSchema: Record<string, any>;   // JSON Schema
  outputSchema: Record<string, any>;
  handler?: (input: Record<string, any>) => Promise<any>;  // Optional in-process handler
}

// ── Agent Definition ──────────────────────────────────────────────────────────

export interface AgentDefinition {
  key: string;
  label: string;
  description: string;
  promptKey: string;
  toolKeys: string[];
  model: string;
  maxIterations: number;
  enabled: boolean;
  grantedCapabilities: string[];   // Fine-grained RBAC capabilities (e.g. 'procurement.po.create')
}

export interface AgentRunResult {
  agentKey: string;
  steps: number;
  output: any;
  tokensUsed?: number;
}

// ── AI Platform Service ───────────────────────────────────────────────────────

@Injectable()
export class AiPlatformService implements OnModuleInit {
  private readonly logger = new Logger('AiPlatformService');
  private readonly prompts = new Map<string, PromptTemplate>();
  private readonly tools = new Map<string, ToolDefinition>();
  private readonly agents = new Map<string, AgentDefinition>();

  onModuleInit(): void {
    this.seedDefaultPlatformAssets();
  }

  /**
   * Seed standard domain-specific ERP agents, prompts, and tools upon platform boot.
   */
  private seedDefaultPlatformAssets(): void {
    // 1. Prompts
    this.registerPrompt({
      key: 'procurement_audit_v1',
      label: 'Procurement Audit System Prompt',
      systemPrompt: 'You are an autonomous ERP procurement auditor analyzing purchase orders and invoices for 3-way matching anomalies.',
      userTemplate: 'Audit purchase order {{poId}} against invoice {{invoiceId}} for tenant {{tenantId}}.',
      modelHint: 'claude-3-5-sonnet',
      version: 1,
      tags: ['procurement', 'audit', 'finance'],
    });

    this.registerPrompt({
      key: 'cost_variance_v1',
      label: 'Cost Variance & Risk System Prompt',
      systemPrompt: 'You are a financial controller AI monitoring project WBS/CBS budget variances and forecasting cost overruns.',
      userTemplate: 'Evaluate cost variance for project {{projectId}} against budget baseline.',
      modelHint: 'claude-3-5-sonnet',
      version: 1,
      tags: ['projects', 'finance', 'risk'],
    });

    this.registerPrompt({
      key: 'estimation_rate_v1',
      label: 'IEC Rate Buildup Estimator Prompt',
      systemPrompt: 'You are an expert MEP/ELV estimator calibrating tender unit rates against historical PO evidence and vendor quotes.',
      userTemplate: 'Calculate calibrated rate for item {{itemCode}} with unit description "{{description}}".',
      modelHint: 'gemini-2.0-flash',
      version: 1,
      tags: ['tendering', 'pricing', 'estimation'],
    });

    this.registerPrompt({
      key: 'site_safety_v1',
      label: 'HSE Site Safety Supervisor Prompt',
      systemPrompt: 'You are a site safety supervisor scanning daily site logs, incident reports, and toolbox talks for high-risk hazards.',
      userTemplate: 'Scan site report {{reportId}} for safety violations and required corrective actions.',
      modelHint: 'gemini-2.0-flash',
      version: 1,
      tags: ['hse', 'site', 'compliance'],
    });

    // 2. Tools
    this.registerTool({
      key: 'fetch_po_matching_data',
      label: 'Fetch PO & GRN Data',
      description: 'Retrieves PO line items, GRN received quantities, and AP invoice amounts for 3-way audit.',
      inputSchema: { type: 'object', properties: { poId: { type: 'string' } } },
      outputSchema: { type: 'object' },
    });

    this.registerTool({
      key: 'query_wbs_ledger',
      label: 'Query WBS/CBS Ledger',
      description: 'Queries project work breakdown structure budget vs. committed costs.',
      inputSchema: { type: 'object', properties: { projectId: { type: 'string' } } },
      outputSchema: { type: 'object' },
    });

    this.registerTool({
      key: 'lookup_historical_pricing',
      label: 'Lookup Historical IEC Pricing',
      description: 'Queries raw PO observations and calibrated market rates for BOQ items.',
      inputSchema: { type: 'object', properties: { itemCode: { type: 'string' } } },
      outputSchema: { type: 'object' },
    });

    this.registerTool({
      key: 'scan_hse_logs',
      label: 'Scan HSE Incident Logs',
      description: 'Fetches recent site incident reports, toolbox talk logs, and safety inspections.',
      inputSchema: { type: 'object', properties: { siteId: { type: 'string' } } },
      outputSchema: { type: 'object' },
    });

    // 3. Agents
    this.registerAgent({
      key: 'procurement_auditor',
      label: 'Procurement Auditor Agent',
      description: 'Audits purchase orders and 3-way invoice matching anomalies, emitting autonomy proposals for approval or rejection.',
      promptKey: 'procurement_audit_v1',
      toolKeys: ['fetch_po_matching_data'],
      model: 'claude-3-5-sonnet',
      maxIterations: 5,
      enabled: true,
      grantedCapabilities: ['procurement.po.read', 'procurement.grn.read', 'finance.invoice.review'],
    });

    this.registerAgent({
      key: 'cost_variance_agent',
      label: 'Cost Variance & Risk Agent',
      description: 'Monitors project CBS budget variances and proposes early risk mitigations to the project manager.',
      promptKey: 'cost_variance_v1',
      toolKeys: ['query_wbs_ledger'],
      model: 'claude-3-5-sonnet',
      maxIterations: 5,
      enabled: true,
      grantedCapabilities: ['projects.wbs.read', 'projects.cbs.read', 'finance.gl.read', 'projects.risk.create'],
    });

    this.registerAgent({
      key: 'estimation_assistant',
      label: 'IEC Rate Buildup Estimator',
      description: 'Calibrates tender rate buildups against historical market pricing and vendor quotes.',
      promptKey: 'estimation_rate_v1',
      toolKeys: ['lookup_historical_pricing'],
      model: 'gemini-2.0-flash',
      maxIterations: 3,
      enabled: true,
      grantedCapabilities: ['estimation.buildup.read', 'estimation.buildup.create', 'pricing.source.read'],
    });

    this.registerAgent({
      key: 'site_safety_supervisor',
      label: 'Site Safety Supervisor Agent',
      description: 'Scans daily site reports and HSE inspections for safety violations and triggers escalation warnings.',
      promptKey: 'site_safety_v1',
      toolKeys: ['scan_hse_logs'],
      model: 'gemini-2.0-flash',
      maxIterations: 4,
      enabled: true,
      grantedCapabilities: ['hse.incident.read', 'hse.inspection.read', 'hse.violation.create', 'site.report.read'],
    });

    this.registerAgent({
      key: 'sales_radar',
      label: 'Sales Tender Radar Agent',
      description: 'Scans incoming signals, emails, and portals to identify tender opportunities and create leads.',
      promptKey: 'procurement_audit_v1',
      toolKeys: ['fetch_po_matching_data'],
      model: 'gemini-2.0-flash',
      maxIterations: 3,
      enabled: true,
      grantedCapabilities: ['crm.lead.read', 'tendering.tender.read', 'crm.lead.create'],
    });

    this.registerAgent({
      key: 'tender_analyzer',
      label: 'Tender Intelligence Analyzer',
      description: 'Parses complex tender specifications, BOQ bills, and commercial submission requirements.',
      promptKey: 'estimation_rate_v1',
      toolKeys: ['lookup_historical_pricing'],
      model: 'claude-3-5-sonnet',
      maxIterations: 4,
      enabled: true,
      grantedCapabilities: ['tendering.boq.read', 'tendering.specification.read'],
    });

    this.registerAgent({
      key: 'quotation_agent',
      label: 'Commercial Quotation Agent',
      description: 'Assembles calibrated BOQ estimates into formal client commercial proposals.',
      promptKey: 'cost_variance_v1',
      toolKeys: ['query_wbs_ledger'],
      model: 'claude-3-5-sonnet',
      maxIterations: 4,
      enabled: true,
      grantedCapabilities: ['tendering.quotation.create', 'finance.pricing.approve', 'crm.quotation.create', '*'],
    });

    this.registerAgent({
      key: 'tendering_agent',
      label: 'Tendering & BOQ Agent',
      description: 'Parses BOQ lines and checks capabilities.',
      promptKey: 'estimation_rate_v1',
      toolKeys: ['lookup_historical_pricing'],
      model: 'claude-3-5-sonnet',
      maxIterations: 4,
      enabled: true,
      grantedCapabilities: ['tendering.boq.read'],
    });

    this.registerAgent({
      key: 'executive_copilot',
      label: 'Executive Copilot Agent',
      description: 'Generates Good Morning CEO briefings and executive business summaries.',
      promptKey: 'cost_variance_v1',
      toolKeys: ['query_wbs_ledger'],
      model: 'claude-3-5-sonnet',
      maxIterations: 4,
      enabled: true,
      grantedCapabilities: ['admin.platform.manage', '*'],
    });
  }

  // ── Prompt Registry ───────────────────────────────────────────

  registerPrompt(prompt: PromptTemplate): void {
    this.prompts.set(`${prompt.key}::v${prompt.version}`, prompt);
    this.logger.log(`[AiPlatform] Prompt registered: "${prompt.key}" v${prompt.version} (model: ${prompt.modelHint})`);
  }

  getPrompt(key: string, version?: number): PromptTemplate | null {
    if (version) return this.prompts.get(`${key}::v${version}`) ?? null;
    let latest: PromptTemplate | null = null;
    for (const [, p] of this.prompts) {
      if (p.key === key && (!latest || p.version > latest.version)) latest = p;
    }
    return latest;
  }

  listPrompts(): PromptTemplate[] {
    const map = new Map<string, PromptTemplate>();
    for (const [, p] of this.prompts) {
      const existing = map.get(p.key);
      if (!existing || p.version > existing.version) {
        map.set(p.key, p);
      }
    }
    return Array.from(map.values());
  }

  /**
   * Render a prompt template by substituting {{variable}} placeholders.
   */
  renderPrompt(key: string, variables: Record<string, any>): { system: string; user: string } | null {
    const prompt = this.getPrompt(key);
    if (!prompt) return null;
    const substitute = (template: string) =>
      template.replace(/\{\{(\w+)\}\}/g, (_, v) => String(variables[v] ?? ''));
    return { system: substitute(prompt.systemPrompt), user: substitute(prompt.userTemplate) };
  }

  // ── Tool Registry ─────────────────────────────────────────────

  registerTool(tool: ToolDefinition): void {
    this.tools.set(tool.key, tool);
    this.logger.log(`[AiPlatform] Tool registered: "${tool.key}"`);
  }

  getTool(key: string): ToolDefinition | null {
    return this.tools.get(key) ?? null;
  }

  listTools(): ToolDefinition[] {
    return Array.from(this.tools.values());
  }

  // ── Agent Registry ────────────────────────────────────────────

  registerAgent(agent: AgentDefinition): void {
    this.agents.set(agent.key, agent);
    this.logger.log(`[AiPlatform] Agent registered: "${agent.key}" using prompt "${agent.promptKey}" with ${agent.toolKeys.length} tools`);
  }

  getAgent(key: string): AgentDefinition | null {
    return this.agents.get(key) ?? null;
  }

  listAgents(enabledOnly = false): AgentDefinition[] {
    return Array.from(this.agents.values()).filter((a) => !enabledOnly || a.enabled);
  }

  toggleAgent(key: string, enabled: boolean): boolean {
    const agent = this.agents.get(key);
    if (!agent) return false;
    agent.enabled = enabled;
    this.logger.log(`[AiPlatform] Agent "${key}" ${enabled ? 'enabled' : 'disabled'}`);
    return true;
  }

  updateAgent(
    key: string,
    patch: Partial<Pick<AgentDefinition, 'model' | 'maxIterations' | 'enabled'>>,
  ): boolean {
    const agent = this.agents.get(key);
    if (!agent) return false;
    if (patch.model !== undefined) agent.model = patch.model;
    if (patch.maxIterations !== undefined) agent.maxIterations = patch.maxIterations;
    if (patch.enabled !== undefined) agent.enabled = patch.enabled;
    this.logger.log(`[AiPlatform] Agent "${key}" updated: model=${agent.model}, maxIterations=${agent.maxIterations}, enabled=${agent.enabled}`);
    return true;
  }

  /**
   * Simulate an agent run (ReAct loop — mock for platform validation).
   * In production, this delegates to the LLM via the AI provider.
   */
  async runAgent(agentKey: string, input: Record<string, any>): Promise<AgentRunResult> {
    const agent = this.agents.get(agentKey);
    if (!agent) throw new Error(`Agent "${agentKey}" not found`);
    if (!agent.enabled) throw new Error(`Agent "${agentKey}" is disabled`);

    this.logger.log(`[AiPlatform] Running agent "${agentKey}" with ${agent.toolKeys.length} tools (max ${agent.maxIterations} iterations)`);

    // Mock ReAct loop: iterate calling each tool once and collect outputs
    const toolOutputs: any[] = [];
    let steps = 0;

    for (const toolKey of agent.toolKeys.slice(0, agent.maxIterations)) {
      const tool = this.tools.get(toolKey);
      if (tool?.handler) {
        const output = await tool.handler(input);
        toolOutputs.push({ tool: toolKey, output });
      }
      steps++;
    }

    return {
      agentKey,
      steps,
      output: { summary: `Agent "${agent.label}" completed ${steps} tool calls`, toolOutputs },
    };
  }
}


import { Injectable, Logger } from '@nestjs/common';

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
}

export interface AgentRunResult {
  agentKey: string;
  steps: number;
  output: any;
  tokensUsed?: number;
}

// ── AI Platform Service ───────────────────────────────────────────────────────

@Injectable()
export class AiPlatformService {
  private readonly logger = new Logger('AiPlatformService');
  private readonly prompts = new Map<string, PromptTemplate>();
  private readonly tools = new Map<string, ToolDefinition>();
  private readonly agents = new Map<string, AgentDefinition>();

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

  listAgents(enabledOnly = true): AgentDefinition[] {
    return Array.from(this.agents.values()).filter((a) => !enabledOnly || a.enabled);
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

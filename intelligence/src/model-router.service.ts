import { Injectable, Logger } from '@nestjs/common';

// ── Model Routing ─────────────────────────────────────────────────────────────
//
//  The ModelRouterService selects the optimal LLM for each agent task based on:
//    • Task complexity   (simple → flash, standard → sonnet, complex → opus)
//    • Context length    (short → flash, medium → sonnet, large → opus/gpt-4o)
//    • Target latency    (real-time → flash, standard → sonnet, batch → opus)
//    • Cost budget       (economy → flash, standard → sonnet, premium → opus)
//    • Tenant policy     (org-level model overrides or restrictions)
//    • Modality          (vision/OCR → gpt-4o, text-only → claude/gemini)
//
//  Agents do NOT choose their own model. The Router assigns one.

export type TaskComplexity = 'simple' | 'standard' | 'complex' | 'vision';
export type LatencyTarget = 'real_time' | 'standard' | 'batch';
export type CostTier = 'economy' | 'standard' | 'premium';

export interface RoutingRequest {
  agentId: string;
  taskComplexity: TaskComplexity;
  contextTokenEstimate: number;
  latencyTarget: LatencyTarget;
  costTier: CostTier;
  requiresVision: boolean;
  tenantModelOverride?: string;
}

export interface RoutingDecision {
  selectedModel: string;
  provider: string;
  reason: string;
  estimatedCostPerToken: number;
  estimatedLatencyMs: number;
}

export interface ModelProfile {
  model: string;
  provider: string;
  maxContextTokens: number;
  costPerInputToken: number;
  costPerOutputToken: number;
  avgLatencyMs: number;
  supportsVision: boolean;
  complexityRanking: number;  // 1 = simplest/fastest, 5 = most capable
}

export interface RoutingRule {
  key: string;
  name: string;
  condition: string;
  targetModel: string;
  priority: number;
  enabled: boolean;
}

@Injectable()
export class ModelRouterService {
  private readonly logger = new Logger('ModelRouterService');

  // ── Model Profiles ──────────────────────────────────────────────

  private readonly models: ModelProfile[] = [
    {
      model: 'gemini-2.0-flash',
      provider: 'google',
      maxContextTokens: 1_000_000,
      costPerInputToken: 0.000_000_075,
      costPerOutputToken: 0.000_000_3,
      avgLatencyMs: 280,
      supportsVision: true,
      complexityRanking: 1,
    },
    {
      model: 'claude-3-5-sonnet',
      provider: 'anthropic',
      maxContextTokens: 200_000,
      costPerInputToken: 0.000_003,
      costPerOutputToken: 0.000_015,
      avgLatencyMs: 850,
      supportsVision: false,
      complexityRanking: 3,
    },
    {
      model: 'gpt-4o',
      provider: 'openai',
      maxContextTokens: 128_000,
      costPerInputToken: 0.000_002_5,
      costPerOutputToken: 0.000_01,
      avgLatencyMs: 700,
      supportsVision: true,
      complexityRanking: 3,
    },
    {
      model: 'claude-3-opus',
      provider: 'anthropic',
      maxContextTokens: 200_000,
      costPerInputToken: 0.000_015,
      costPerOutputToken: 0.000_075,
      avgLatencyMs: 2400,
      supportsVision: false,
      complexityRanking: 5,
    },
  ];

  // ── Routing Rules ───────────────────────────────────────────────

  private readonly rules: RoutingRule[] = [
    { key: 'vision_tasks',     name: 'Vision & OCR Tasks → GPT-4o',                     condition: 'requiresVision === true',              targetModel: 'gpt-4o',            priority: 100, enabled: true },
    { key: 'complex_finance',  name: 'Complex Financial Reasoning → Claude Opus',        condition: 'taskComplexity === "complex"',          targetModel: 'claude-3-opus',     priority: 90,  enabled: true },
    { key: 'standard_react',   name: 'Standard ReAct Loops → Claude Sonnet',             condition: 'taskComplexity === "standard"',         targetModel: 'claude-3-5-sonnet', priority: 50,  enabled: true },
    { key: 'simple_fast',      name: 'Simple High-Throughput Tasks → Gemini Flash',      condition: 'taskComplexity === "simple"',           targetModel: 'gemini-2.0-flash',  priority: 30,  enabled: true },
    { key: 'economy_fallback', name: 'Economy Cost Tier → Gemini Flash',                 condition: 'costTier === "economy"',                targetModel: 'gemini-2.0-flash',  priority: 20,  enabled: true },
    { key: 'realtime_latency', name: 'Real-Time Latency Target → Gemini Flash',          condition: 'latencyTarget === "real_time"',         targetModel: 'gemini-2.0-flash',  priority: 80,  enabled: true },
  ];

  // ── Route ───────────────────────────────────────────────────────

  /**
   * Select the optimal model for the given task parameters.
   */
  route(request: RoutingRequest): RoutingDecision {
    // 1. Tenant-level override takes absolute precedence
    if (request.tenantModelOverride) {
      const profile = this.models.find((m) => m.model === request.tenantModelOverride);
      if (profile) {
        this.logger.log(`[ModelRouter] Tenant override → ${profile.model}`);
        return this.buildDecision(profile, 'Tenant policy override');
      }
    }

    // 2. Vision requirement
    if (request.requiresVision) {
      const profile = this.models.find((m) => m.supportsVision && m.complexityRanking >= 3) ?? this.models[2]!;
      this.logger.log(`[ModelRouter] Vision task → ${profile.model}`);
      return this.buildDecision(profile, 'Vision/OCR capability required');
    }

    // 3. Real-time latency requirement
    if (request.latencyTarget === 'real_time') {
      const fastest = [...this.models].sort((a, b) => a.avgLatencyMs - b.avgLatencyMs)[0]!;
      this.logger.log(`[ModelRouter] Real-time latency → ${fastest.model}`);
      return this.buildDecision(fastest, 'Lowest latency target');
    }

    // 4. Complexity-based selection
    if (request.taskComplexity === 'complex') {
      const best = [...this.models].sort((a, b) => b.complexityRanking - a.complexityRanking)[0]!;
      this.logger.log(`[ModelRouter] Complex reasoning → ${best.model}`);
      return this.buildDecision(best, 'Highest reasoning capability for complex task');
    }

    if (request.taskComplexity === 'simple' || request.costTier === 'economy') {
      const cheapest = [...this.models].sort((a, b) => a.costPerInputToken - b.costPerInputToken)[0]!;
      this.logger.log(`[ModelRouter] Simple/economy → ${cheapest.model}`);
      return this.buildDecision(cheapest, 'Lowest cost for simple/economy task');
    }

    // 5. Context window overflow check — pick model that fits
    const fittingModels = this.models
      .filter((m) => m.maxContextTokens >= request.contextTokenEstimate)
      .sort((a, b) => a.costPerInputToken - b.costPerInputToken);

    if (fittingModels.length > 0) {
      const selected = fittingModels[0]!;
      this.logger.log(`[ModelRouter] Context-fit selection → ${selected.model}`);
      return this.buildDecision(selected, `Best cost/context fit for ~${request.contextTokenEstimate} tokens`);
    }

    // 6. Default fallback
    const fallback = this.models.find((m) => m.model === 'claude-3-5-sonnet') ?? this.models[1]!;
    this.logger.log(`[ModelRouter] Default fallback → ${fallback.model}`);
    return this.buildDecision(fallback, 'Default standard model selection');
  }

  private buildDecision(profile: ModelProfile, reason: string): RoutingDecision {
    return {
      selectedModel: profile.model,
      provider: profile.provider,
      reason,
      estimatedCostPerToken: profile.costPerInputToken,
      estimatedLatencyMs: profile.avgLatencyMs,
    };
  }

  // ── Observability ───────────────────────────────────────────────

  listModels(): ModelProfile[] {
    return [...this.models];
  }

  listRoutingRules(): RoutingRule[] {
    return [...this.rules];
  }
}

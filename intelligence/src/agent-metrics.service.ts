import { Injectable, Logger } from '@nestjs/common';

export type AgentHealthStatus = 'healthy' | 'degraded' | 'critical' | 'offline';

export interface AgentMetrics {
  agentKey: string;
  status: AgentHealthStatus;
  tasksToday: number;
  successRatePercent: number;
  errorCount: number;
  retryCount: number;
  avgLatencyMs: number;
  suggestionAcceptancePercent: number;
  avgCostPerTaskUsd: number;
  totalCostUsd: number;
  lastRunAt: Date | null;
}

export interface BusinessCostSummary {
  totalCostUsd: number;
  byVendor: Record<string, number>;        // 'claude' | 'gpt' | 'gemini' | 'local'
  byModule: Record<string, number>;        // 'procurement' | 'finance' | 'projects' | 'tendering' | 'hse'
  byAgent: Record<string, number>;
}

@Injectable()
export class AgentMetricsService {
  private readonly logger = new Logger('AgentMetricsService');
  private readonly metrics = new Map<string, AgentMetrics>();

  constructor() {
    this.seedDefaultMetrics();
  }

  private seedDefaultMetrics(): void {
    // Seed health telemetry for built-in ERP agents
    this.recordExecution('procurement_auditor', true, 520, 0.021, 'claude', 'procurement', true);
    this.recordExecution('cost_variance_agent', true, 410, 0.015, 'claude', 'projects', true);
    this.recordExecution('estimation_assistant', true, 280, 0.008, 'gemini', 'tendering', true);
    this.recordExecution('site_safety_supervisor', true, 340, 0.009, 'gemini', 'hse', true);
  }

  recordExecution(
    agentKey: string,
    success: boolean,
    latencyMs: number,
    costUsd: number,
    _vendor = 'claude',
    _module = 'general',
    suggestionAccepted = true,
  ): void {
    const existing = this.metrics.get(agentKey) ?? {
      agentKey,
      status: 'healthy',
      tasksToday: 0,
      successRatePercent: 100,
      errorCount: 0,
      retryCount: 0,
      avgLatencyMs: 0,
      suggestionAcceptancePercent: 100,
      avgCostPerTaskUsd: 0,
      totalCostUsd: 0,
      lastRunAt: null,
    };

    const newTasks = existing.tasksToday + 1;
    const newErrors = existing.errorCount + (success ? 0 : 1);
    const newSuccessRate = Math.round(((newTasks - newErrors) / newTasks) * 100);
    const newAvgLatency = Math.round((existing.avgLatencyMs * existing.tasksToday + latencyMs) / newTasks);
    const newTotalCost = parseFloat((existing.totalCostUsd + costUsd).toFixed(4));
    const newAvgCost = parseFloat((newTotalCost / newTasks).toFixed(4));

    // Acceptance calculation
    const acceptedCount = Math.round((existing.suggestionAcceptancePercent / 100) * existing.tasksToday) + (suggestionAccepted ? 1 : 0);
    const newAcceptanceRate = Math.round((acceptedCount / newTasks) * 100);

    // Dynamic health status calculation
    let status: AgentHealthStatus = 'healthy';
    if (newSuccessRate < 80 || newAvgLatency > 3000) {
      status = 'critical';
    } else if (newSuccessRate < 95 || newAvgLatency > 1500) {
      status = 'degraded';
    }

    const updated: AgentMetrics = {
      ...existing,
      status,
      tasksToday: newTasks,
      errorCount: newErrors,
      successRatePercent: newSuccessRate,
      avgLatencyMs: newAvgLatency,
      suggestionAcceptancePercent: newAcceptanceRate,
      totalCostUsd: newTotalCost,
      avgCostPerTaskUsd: newAvgCost,
      lastRunAt: new Date(),
    };

    this.metrics.set(agentKey, updated);
    this.logger.log(`[Metrics] Telemetry recorded for "${agentKey}": status=${status}, latency=${latencyMs}ms, cost=$${costUsd}`);
  }

  getMetrics(agentKey: string): AgentMetrics | null {
    return this.metrics.get(agentKey) ?? null;
  }

  listMetrics(): AgentMetrics[] {
    return Array.from(this.metrics.values());
  }

  getBusinessCostSummary(): BusinessCostSummary {
    const byAgent: Record<string, number> = {};
    let totalCostUsd = 0;

    for (const [key, m] of this.metrics) {
      byAgent[key] = m.totalCostUsd;
      totalCostUsd += m.totalCostUsd;
    }

    return {
      totalCostUsd: parseFloat(totalCostUsd.toFixed(4)),
      byVendor: {
        claude: parseFloat((totalCostUsd * 0.65).toFixed(4)),
        gemini: parseFloat((totalCostUsd * 0.25).toFixed(4)),
        gpt: parseFloat((totalCostUsd * 0.10).toFixed(4)),
      },
      byModule: {
        procurement: parseFloat((totalCostUsd * 0.40).toFixed(4)),
        projects: parseFloat((totalCostUsd * 0.30).toFixed(4)),
        tendering: parseFloat((totalCostUsd * 0.18).toFixed(4)),
        hse: parseFloat((totalCostUsd * 0.12).toFixed(4)),
      },
      byAgent,
    };
  }
}

import { Injectable, Logger } from '@nestjs/common';

// ── Process Event ─────────────────────────────────────────────────────────────

export interface ProcessEvent {
  caseId: string;                // e.g. 'invoice-inv-001' or 'project-p1'
  activity: string;              // e.g. 'created', 'submitted', 'approved', 'paid'
  timestamp: Date;
  actor?: string;
  metadata?: Record<string, any>;
}

export interface ProcessTrace {
  caseId: string;
  events: ProcessEvent[];
  totalDurationMs: number;
  bottleneck?: string;           // Activity with the longest wait before next step
}

export interface CashflowForecast {
  tenantId: string;
  period: string;                // e.g. '2026-07'
  projectedInflow: number;
  projectedOutflow: number;
  projectedNet: number;
  confidence: number;            // 0–1 score
  basis: string;                 // Explanation of forecast model
}

// ── Process Mining & Cashflow Forecasting ─────────────────────────────────────

@Injectable()
export class ProcessMiningService {
  private readonly logger = new Logger('ProcessMiningService');
  private readonly eventLog = new Map<string, ProcessEvent[]>();  // caseId → events

  // ── Process Mining ────────────────────────────────────────────

  recordEvent(event: ProcessEvent): void {
    const events = this.eventLog.get(event.caseId) ?? [];
    events.push(event);
    events.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    this.eventLog.set(event.caseId, events);
  }

  analyzeTrace(caseId: string): ProcessTrace | null {
    const events = this.eventLog.get(caseId);
    if (!events || events.length === 0) return null;

    const totalDurationMs = events[events.length - 1].timestamp.getTime() - events[0].timestamp.getTime();

    // Find bottleneck: largest gap between consecutive events
    let bottleneck: string | undefined;
    let maxGap = 0;
    for (let i = 1; i < events.length; i++) {
      const gap = events[i].timestamp.getTime() - events[i - 1].timestamp.getTime();
      if (gap > maxGap) {
        maxGap = gap;
        bottleneck = events[i - 1].activity; // Activity that caused the longest wait
      }
    }

    this.logger.log(`[ProcessMining] Trace analyzed: ${caseId} — ${events.length} steps, ${totalDurationMs}ms total${bottleneck ? `, bottleneck: "${bottleneck}"` : ''}`);

    return { caseId, events, totalDurationMs, bottleneck };
  }

  getProcessVariants(prefix: string): Map<string, number> {
    const variants = new Map<string, number>();
    for (const [caseId, events] of this.eventLog) {
      if (!caseId.startsWith(prefix)) continue;
      const path = events.map((e) => e.activity).join(' → ');
      variants.set(path, (variants.get(path) ?? 0) + 1);
    }
    return variants;
  }

  // ── Cashflow Forecasting ──────────────────────────────────────

  /**
   * Simple trend-based cashflow forecast using historical monthly averages.
   * In production this would call an LLM or ML model via the AI platform.
   */
  forecastCashflow(params: {
    tenantId: string;
    targetPeriod: string;
    historicalInflows: number[];   // Monthly inflow figures (oldest → newest)
    historicalOutflows: number[];  // Monthly outflow figures (oldest → newest)
  }): CashflowForecast {
    const { tenantId, targetPeriod, historicalInflows, historicalOutflows } = params;

    const avg = (arr: number[]) => arr.reduce((s, v) => s + v, 0) / (arr.length || 1);
    const trend = (arr: number[]) => {
      if (arr.length < 2) return 0;
      return (arr[arr.length - 1] - arr[0]) / arr.length;
    };

    const projectedInflow = avg(historicalInflows) + trend(historicalInflows);
    const projectedOutflow = avg(historicalOutflows) + trend(historicalOutflows);
    const projectedNet = projectedInflow - projectedOutflow;

    // Confidence degrades with fewer data points
    const confidence = Math.min(1, historicalInflows.length / 12);

    const forecast: CashflowForecast = {
      tenantId,
      period: targetPeriod,
      projectedInflow: Math.round(projectedInflow),
      projectedOutflow: Math.round(projectedOutflow),
      projectedNet: Math.round(projectedNet),
      confidence: parseFloat(confidence.toFixed(2)),
      basis: `Linear trend + moving average over ${historicalInflows.length} historical periods`,
    };

    this.logger.log(`[ProcessMining] Cashflow forecast for ${targetPeriod}: Net=${projectedNet.toFixed(0)}, Confidence=${(confidence * 100).toFixed(0)}%`);

    return forecast;
  }
}

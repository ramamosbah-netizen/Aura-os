import { Injectable, Logger } from '@nestjs/common';

export interface ActivityTraceStep {
  stepId: string;
  agentKey: string;
  phase: 'trigger' | 'memory' | 'tools' | 'reasoning' | 'proposal';
  label: string;
  details: string;
  timestamp: Date;
}

export interface ExplainabilityCard {
  proposalId: string;
  agentKey: string;
  
  // 4-Part Structure
  decisionSummary: string;              // What the agent decided/proposed
  evidence: Array<{                      // Data sources, DB records, or event logs relied upon
    type: 'event' | 'document' | 'db_record' | 'rag_context';
    title: string;
    uri?: string;
  }>;
  toolsUsed: Array<{                    // Exact tools invoked with parameters
    toolKey: string;
    label: string;
    params: Record<string, any>;
    resultSummary: string;
  }>;
  confidenceAndRisk: {                  // Confidence score % + risk factors
    confidenceScorePercent: number;
    riskLevel: 'low' | 'medium' | 'high';
    identifiedRisks: string[];
  };
}

@Injectable()
export class AgentTracerService {
  private readonly logger = new Logger('AgentTracerService');
  private readonly traces: ActivityTraceStep[] = [];
  private readonly explainabilityCards = new Map<string, ExplainabilityCard>();

  constructor() {
    this.seedDefaultTraces();
  }

  private seedDefaultTraces(): void {
    const now = new Date();
    this.recordTraceStep({
      stepId: 'tr-001',
      agentKey: 'procurement_auditor',
      phase: 'trigger',
      label: 'Event Triggered',
      details: 'Event purchase_order.created received for PO-8902',
      timestamp: new Date(now.getTime() - 120_000),
    });
    this.recordTraceStep({
      stepId: 'tr-002',
      agentKey: 'procurement_auditor',
      phase: 'memory',
      label: 'Digital Twin Context Loaded',
      details: 'Fetched vendor quote history & historical PO line prices',
      timestamp: new Date(now.getTime() - 100_000),
    });
    this.recordTraceStep({
      stepId: 'tr-003',
      agentKey: 'procurement_auditor',
      phase: 'tools',
      label: 'Tool Called: fetch_po_matching_data',
      details: 'Retrieved line items for PO-8902 vs GRN-4410',
      timestamp: new Date(now.getTime() - 80_000),
    });
    this.recordTraceStep({
      stepId: 'tr-004',
      agentKey: 'procurement_auditor',
      phase: 'proposal',
      label: 'Autonomy Proposal Generated',
      details: 'Proposed 1-click approval for PO variance (0.4% discrepancy)',
      timestamp: new Date(now.getTime() - 60_000),
    });

    // Seed 4-part explainability card
    this.recordExplainability({
      proposalId: 'prop-sample-001',
      agentKey: 'procurement_auditor',
      decisionSummary: 'Recommend single-click approval for Purchase Order PO-8902 valued at AED 12,400.',
      evidence: [
        { type: 'db_record', title: 'Purchase Order PO-8902', uri: 'aura://procurement/po/8902' },
        { type: 'rag_context', title: 'Historical Vendor Unit Rate Baseline', uri: 'aura://vector/pricing/baseline-8902' },
      ],
      toolsUsed: [
        { toolKey: 'fetch_po_matching_data', label: 'Fetch PO Matching Data', params: { poId: 'PO-8902' }, resultSummary: 'Verified 3-way match: PO qty 100 == GRN qty 100.' },
      ],
      confidenceAndRisk: {
        confidenceScorePercent: 96,
        riskLevel: 'low',
        identifiedRisks: ['Price variance is 0.4% above initial estimate, within acceptable 5% policy window.'],
      },
    });
  }

  recordTraceStep(step: ActivityTraceStep): void {
    this.traces.push(step);
    if (this.traces.length > 500) this.traces.shift(); // Cap sliding buffer
    this.logger.log(`[AgentTracer] Trace recorded for ${step.agentKey} [${step.phase}]: ${step.label}`);
  }

  recordExplainability(card: ExplainabilityCard): void {
    this.explainabilityCards.set(card.proposalId, card);
  }

  listTraces(agentKey?: string): ActivityTraceStep[] {
    return this.traces.filter((t) => !agentKey || t.agentKey === agentKey);
  }

  getExplainability(proposalId: string): ExplainabilityCard | null {
    return this.explainabilityCards.get(proposalId) ?? Array.from(this.explainabilityCards.values())[0] ?? null;
  }
}

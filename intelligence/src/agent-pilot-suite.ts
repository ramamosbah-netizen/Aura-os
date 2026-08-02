import { Injectable, Logger } from '@nestjs/common';
import { AgentWorkflowEngine } from './agent-workflow.engine';
import { AgentCollaborationService } from './agent-collaboration.service';
import { AgentRuntimeService } from './agent-runtime.service';
import { CapabilityGuardService } from './capability-guard.service';
import { DocumentIngestionService } from './document-ingestion.service';

export interface PilotSuiteTestResult {
  suiteName: string;
  passed: boolean;
  durationMs: number;
  details: string;
}

@Injectable()
export class AgentPilotSuiteService {
  private readonly logger = new Logger('AgentPilotSuiteService');

  constructor(
    private readonly workflowEngine: AgentWorkflowEngine,
    private readonly collaborationService: AgentCollaborationService,
    private readonly runtimeService: AgentRuntimeService,
    private readonly capabilityGuard: CapabilityGuardService,
    private readonly ingestionService: DocumentIngestionService,
  ) {}

  /**
   * Execute complete end-to-end pilot suite verification across all platform seams.
   */
  async runPilotSuite(tenantId = 'tenant-pilot-01'): Promise<PilotSuiteTestResult[]> {
    const results: PilotSuiteTestResult[] = [];

    // 1. Document Ingestion & RAG Indexing
    const t1 = Date.now();
    try {
      const docRes = await this.ingestionService.ingestDocument({
        tenantId,
        documentTitle: 'Dubai Commercial Tower MEP Spec.pdf',
        documentType: 'boq',
        rawTextContent: 'Item 1.1 Schneider 11kV Switchgear Panel quantity 4 sets. Item 1.2 Substation Transformer 1500kVA quantity 2 units.',
      });
      results.push({
        suiteName: '1. Document Ingestion & RAG Indexing',
        passed: docRes.totalChunks > 0 && docRes.status === 'indexed_successfully',
        durationMs: Date.now() - t1,
        details: `Ingested ${docRes.totalChunks} semantic chunks for ${docRes.documentTitle}`,
      });
    } catch (err: any) {
      results.push({ suiteName: '1. Document Ingestion & RAG Indexing', passed: false, durationMs: Date.now() - t1, details: err.message });
    }

    // 2. Capability Authorization Guard Check
    const t2 = Date.now();
    try {
      const allowed = this.capabilityGuard.canExecute('tendering_agent', 'tendering.boq.read');
      const denied = !this.capabilityGuard.canExecute('tendering_agent', 'admin.super.override');
      results.push({
        suiteName: '2. Capability Authorization Guard',
        passed: allowed && denied,
        durationMs: Date.now() - t2,
        details: `Granted: ${allowed}, Denied: ${denied}`,
      });
    } catch (err: any) {
      results.push({ suiteName: '2. Capability Authorization Guard', passed: false, durationMs: Date.now() - t2, details: err.message });
    }

    // 3. Multi-Agent Workflow Engine & Human Gate Execution
    const t3 = Date.now();
    try {
      const wf = await this.workflowEngine.startWorkflow('wf_tender_to_quote', tenantId, {
        tenderTitle: 'Abu Dhabi 132kV Substation ELV Package',
        valueAmount: 750000,
      });

      const pausedAtGate = wf.state === 'waiting_approval' && wf.pendingApproval !== undefined;
      const resumed = await this.workflowEngine.approveGate(
        wf.instanceId,
        true,
        'usr-chief-estimator',
      );

      results.push({
        suiteName: '3. Multi-Agent Workflow & Human Approval Gate',
        passed: pausedAtGate && resumed.state === 'completed',
        durationMs: Date.now() - t3,
        details: `Paused at gate (> $500k AED): ${pausedAtGate}, Resumed status: ${resumed.state}`,
      });
    } catch (err: any) {
      results.push({ suiteName: '3. Multi-Agent Workflow & Human Approval Gate', passed: false, durationMs: Date.now() - t3, details: err.message });
    }

    // 4. Inter-Agent Collaboration Bus
    const t4 = Date.now();
    try {
      const msg = this.collaborationService.dispatchMessage({
        workflowInstanceId: 'wf-inst-test-101',
        fromAgent: 'sales_radar',
        toAgent: 'tender_analyzer',
        task: 'Analyze BOQ Line Items',
        context: { tenderId: 'tnd-9901' },
        output: { parsedItems: 14 },
        confidenceScorePercent: 95,
      });

      results.push({
        suiteName: '4. Inter-Agent Collaboration Bus',
        passed: msg.id !== undefined && msg.fromAgent === 'sales_radar',
        durationMs: Date.now() - t4,
        details: `Dispatched message ${msg.id} from ${msg.fromAgent} to ${msg.toAgent}`,
      });
    } catch (err: any) {
      results.push({ suiteName: '4. Inter-Agent Collaboration Bus', passed: false, durationMs: Date.now() - t4, details: err.message });
    }

    // 5. Agent Runtime Contract & 7-Step Pipeline Execution
    const t5 = Date.now();
    try {
      const runtimeRes = await this.runtimeService.execute({
        agentId: 'quotation_agent',
        tenantId,
        payload: { scope: 'HV Cable Buildup' },
        requiredCapability: 'crm.quotation.create',
      });

      results.push({
        suiteName: '5. Agent Runtime 7-Step Pipeline',
        passed: runtimeRes.executionId !== undefined && runtimeRes.status === 'proposal_generated',
        durationMs: Date.now() - t5,
        details: `Execution ${runtimeRes.executionId} generated proposal ${runtimeRes.proposalId}`,
      });
    } catch (err: any) {
      results.push({ suiteName: '5. Agent Runtime 7-Step Pipeline', passed: false, durationMs: Date.now() - t5, details: err.message });
    }

    this.logger.log(`[AgentPilotSuite] Executed 5 test suites. All passed: ${results.every((r) => r.passed)}`);
    return results;
  }
}

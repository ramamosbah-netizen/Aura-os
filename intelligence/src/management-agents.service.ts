import { Injectable, Logger } from '@nestjs/common';
import { AgentRuntimeService } from './agent-runtime.service';
import { CapabilityGuardService } from './capability-guard.service';

export interface ExecutiveBriefingResult {
  agent: string;
  greeting: string;
  pipelineSummary: string;
  projectRisksCount: number;
  pendingCollectionsAed: number;
  procurementAlertsCount: number;
  runtimeResult: any;
}

export interface ProjectRiskAnalysisResult {
  agent: string;
  projectName: string;
  riskSeverity: 'low' | 'medium' | 'high' | 'critical';
  scheduleImpactDays: number;
  recommendedMitigation: string;
  runtimeResult: any;
}

export interface CfoAnalysisResult {
  agent: string;
  tenantId: string;
  projected90DayCashflowAed: number;
  overdueIpcCollectionsAed: number;
  marginVariancePercent: number;
  runtimeResult: any;
}

@Injectable()
export class ManagementAgentsService {
  private readonly logger = new Logger('ManagementAgentsService');

  constructor(
    private readonly runtime: AgentRuntimeService,
    private readonly capabilityGuard: CapabilityGuardService,
  ) {}

  /**
   * 1. Executive Copilot — "Good Morning CEO" Executive Briefing
   */
  async runExecutiveCopilot(tenantId: string): Promise<ExecutiveBriefingResult> {
    this.capabilityGuard.assertCapability('executive_copilot', 'admin.platform.manage');
    this.logger.log(`[ExecutiveCopilot] Generating executive briefing for tenant "${tenantId}"...`);

    const result = await this.runtime.execute({
      agentId: 'executive_copilot',
      tenantId,
      requiredCapability: 'admin.platform.manage',
      payload: {
        pipelineAed: 13500000,
        activeRisksCount: 2,
        pendingCollectionsAed: 850000,
        procurementPriceIncreasesCount: 3,
      },
    });

    return {
      agent: 'Executive Copilot',
      greeting: 'Good Morning CEO',
      pipelineSummary: 'AED 13.5M Active Qualified Pipeline',
      projectRisksCount: 2,
      pendingCollectionsAed: 850000,
      procurementAlertsCount: 3,
      runtimeResult: result,
    };
  }

  /**
   * 2. Project Manager Agent — Project Progress, Schedule Variance & Risk Analysis
   */
  async runProjectRiskAgent(tenantId: string, projectName = 'Dubai Commercial Tower MEP'): Promise<ProjectRiskAnalysisResult> {
    this.capabilityGuard.assertCapability('site_safety_supervisor', 'projects.wbs.read');
    this.logger.log(`[ProjectManagerAgent] Analyzing schedule and material variance for project "${projectName}"...`);

    const result = await this.runtime.execute({
      agentId: 'site_safety_supervisor',
      tenantId,
      requiredCapability: 'projects.wbs.read',
      payload: {
        projectName,
        materialDelayDays: 12,
        wbsNode: 'Substation Transformer Installation',
        mitigation: 'Re-assign Schneider supplier shipment or engage local backup vendor',
      },
    });

    return {
      agent: 'Project Manager Agent',
      projectName,
      riskSeverity: 'medium',
      scheduleImpactDays: 8,
      recommendedMitigation: 'Alternative supplier engagement + 14-day schedule compression',
      runtimeResult: result,
    };
  }

  /**
   * 3. CFO Agent — Cashflow Prediction, IPC Collections & Margin Analysis
   */
  async runCfoAgent(tenantId: string): Promise<CfoAnalysisResult> {
    this.capabilityGuard.assertCapability('cost_variance_agent', 'finance.gl.read');
    this.logger.log(`[CfoAgent] Calculating 90-day cashflow forecast for tenant "${tenantId}"...`);

    const result = await this.runtime.execute({
      agentId: 'cost_variance_agent',
      tenantId,
      requiredCapability: 'finance.gl.read',
      payload: {
        forecastAed: 4200000,
        overdueCollectionsAed: 850000,
        grossMarginPercent: 18.2,
      },
    });

    return {
      agent: 'CFO Agent',
      tenantId,
      projected90DayCashflowAed: 4200000,
      overdueIpcCollectionsAed: 850000,
      marginVariancePercent: -1.8,
      runtimeResult: result,
    };
  }
}

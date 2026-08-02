import { Injectable, Logger } from '@nestjs/common';

export interface ProjectTwinSnapshot {
  projectId: string;
  projectName: string;
  budgetTotalUsd: number;
  committedCostUsd: number;
  actualCostUsd: number;
  physicalProgressPercent: number;
  activeRiskCount: number;
  allocatedResourcesCount: number;
  forecastedMarginPercent: number;
  health: 'healthy' | 'at_risk' | 'critical';
  lastSyncedAt: Date;
}

export interface EnterpriseTwinOverview {
  orgName: string;
  activeProjects: number;
  totalBudgetValueUsd: number;
  overallProgressPercent: number;
  openRisksCount: number;
  projectTwins: ProjectTwinSnapshot[];
}

@Injectable()
export class DigitalTwinService {
  private readonly logger = new Logger('DigitalTwinService');

  getEnterpriseOverview(tenantId: string): EnterpriseTwinOverview {
    const projectTwins: ProjectTwinSnapshot[] = [
      {
        projectId: 'proj_dubai_tower_a',
        projectName: 'Dubai Commercial Tower A (MEP Package)',
        budgetTotalUsd: 14_500_000,
        committedCostUsd: 9_200_000,
        actualCostUsd: 6_100_000,
        physicalProgressPercent: 54,
        activeRiskCount: 3,
        allocatedResourcesCount: 42,
        forecastedMarginPercent: 18.5,
        health: 'healthy',
        lastSyncedAt: new Date(),
      },
      {
        projectId: 'proj_abu_dhabi_substation',
        projectName: 'Abu Dhabi 132kV Substation ELV System',
        budgetTotalUsd: 8_200_000,
        committedCostUsd: 6_800_000,
        actualCostUsd: 5_900_000,
        physicalProgressPercent: 78,
        activeRiskCount: 5,
        allocatedResourcesCount: 28,
        forecastedMarginPercent: 12.1,
        health: 'at_risk',
        lastSyncedAt: new Date(),
      },
    ];

    const totalBudget = projectTwins.reduce((acc, p) => acc + p.budgetTotalUsd, 0);
    const avgProgress = Math.round(projectTwins.reduce((acc, p) => acc + p.physicalProgressPercent, 0) / projectTwins.length);
    const totalRisks = projectTwins.reduce((acc, p) => acc + p.activeRiskCount, 0);

    return {
      orgName: `Tenant Digital Twin (${tenantId})`,
      activeProjects: projectTwins.length,
      totalBudgetValueUsd: totalBudget,
      overallProgressPercent: avgProgress,
      openRisksCount: totalRisks,
      projectTwins,
    };
  }
}

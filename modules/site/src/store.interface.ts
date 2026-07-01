import type { TxHandle } from '@aura/core';
import type { DailyReport } from './domain/daily-report';
import type { DelayLog } from './domain/delay-log';
import type { MaterialConsumption } from './domain/material-consumption';
import type { SiteInstruction } from './domain/site-instruction';
import type { LabourAllocation } from './domain/labour-allocation';

export interface LabourAllocationStore {
  save(allocation: LabourAllocation, tx?: TxHandle): Promise<void>;
  findById(id: string, tenantId: string): Promise<LabourAllocation | null>;
  findByProject(projectId: string, tenantId: string): Promise<LabourAllocation[]>;
  findAll(tenantId: string): Promise<LabourAllocation[]>;
}

import type { Page, PageParams } from '@aura/shared';

export interface DailyReportFilter {
  tenantId?: string;
  projectId?: string;
  status?: string;
}

export interface DailyReportStore {
  save(report: DailyReport, tx?: TxHandle): Promise<void>;
  findById(id: string, tenantId: string): Promise<DailyReport | null>;
  findByProject(projectId: string, tenantId: string): Promise<DailyReport[]>;
  findAll(tenantId: string): Promise<DailyReport[]>;
  listPaged(filter: DailyReportFilter, page: PageParams): Promise<Page<DailyReport>>;
}

export interface DelayLogStore {
  save(log: DelayLog, tx?: TxHandle): Promise<void>;
  findById(id: string, tenantId: string): Promise<DelayLog | null>;
  findByProject(projectId: string, tenantId: string): Promise<DelayLog[]>;
  findAll(tenantId: string): Promise<DelayLog[]>;
}

export interface MaterialConsumptionStore {
  save(consumption: MaterialConsumption, tx?: TxHandle): Promise<void>;
  findById(id: string, tenantId: string): Promise<MaterialConsumption | null>;
  findByProject(projectId: string, tenantId: string): Promise<MaterialConsumption[]>;
  findAll(tenantId: string): Promise<MaterialConsumption[]>;
}

export interface SiteInstructionStore {
  save(instruction: SiteInstruction, tx?: TxHandle): Promise<void>;
  findById(id: string, tenantId: string): Promise<SiteInstruction | null>;
  findByProject(projectId: string, tenantId: string): Promise<SiteInstruction[]>;
  findAll(tenantId: string): Promise<SiteInstruction[]>;
}

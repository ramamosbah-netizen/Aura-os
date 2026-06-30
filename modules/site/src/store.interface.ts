import type { TxHandle } from '@aura/core';
import type { DailyReport } from './domain/daily-report';
import type { DelayLog } from './domain/delay-log';
import type { MaterialConsumption } from './domain/material-consumption';
import type { SiteInstruction } from './domain/site-instruction';

export interface DailyReportStore {
  save(report: DailyReport, tx?: TxHandle): Promise<void>;
  findById(id: string, tenantId: string): Promise<DailyReport | null>;
  findByProject(projectId: string, tenantId: string): Promise<DailyReport[]>;
  findAll(tenantId: string): Promise<DailyReport[]>;
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

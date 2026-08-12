import type { TxHandle } from '@aura/core';
import type { DailyReport } from './domain/daily-report';
import type { DelayLog } from './domain/delay-log';
import type { MaterialConsumption } from './domain/material-consumption';
import type { SiteInstruction } from './domain/site-instruction';
import type { LabourAllocation } from './domain/labour-allocation';
import type { PlantUsage } from './domain/plant-usage';
import type { InstallationRecord } from './domain/installation';
import type { SiteLabourEntry, SitePlantEntry, SiteProgressEntry, SiteDelayEntry, SiteEvidence } from './domain/daily-report-lines';

/** A report line-item store: save + list all lines for one daily report (tenant-scoped). */
export interface ReportLineStore<T> {
  save(line: T, tx?: TxHandle): Promise<void>;
  listByReport(dailyReportId: string, tenantId: string): Promise<T[]>;
}
export type SiteLabourEntryStore = ReportLineStore<SiteLabourEntry>;
export type SitePlantEntryStore = ReportLineStore<SitePlantEntry>;
export type SiteProgressEntryStore = ReportLineStore<SiteProgressEntry>;
export type SiteDelayEntryStore = ReportLineStore<SiteDelayEntry>;
export type SiteEvidenceStore = ReportLineStore<SiteEvidence>;

export interface LabourAllocationStore {
  save(allocation: LabourAllocation, tx?: TxHandle): Promise<void>;
  findById(id: string, tenantId: string): Promise<LabourAllocation | null>;
  findByProject(projectId: string, tenantId: string): Promise<LabourAllocation[]>;
  findAll(tenantId: string): Promise<LabourAllocation[]>;
}

export interface PlantUsageStore {
  save(usage: PlantUsage, tx?: TxHandle): Promise<void>;
  findById(id: string, tenantId: string): Promise<PlantUsage | null>;
  findByProject(projectId: string, tenantId: string): Promise<PlantUsage[]>;
  findAll(tenantId: string): Promise<PlantUsage[]>;
}

export interface InstallationStore {
  save(record: InstallationRecord, tx?: TxHandle): Promise<void>;
  findById(id: string, tenantId: string): Promise<InstallationRecord | null>;
  findByProject(projectId: string, tenantId: string): Promise<InstallationRecord[]>;
  findAll(tenantId: string): Promise<InstallationRecord[]>;
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

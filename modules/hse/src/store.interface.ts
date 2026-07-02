import type { TxHandle } from '@aura/core';
import type { Page, PageParams } from '@aura/shared';
import type { HseIncident } from './domain/hse-incident';
import type { PermitToWork } from './domain/permit-to-work';
import type { CapaAction } from './domain/capa-action';
import type { ToolboxTalk } from './domain/toolbox-talk';
import type { RiskAssessment } from './domain/risk-assessment';
import type { SafetyTrainingRecord } from './domain/safety-training';

export interface RiskAssessmentStore {
  save(ra: RiskAssessment, tx?: TxHandle): Promise<void>;
  findById(id: string, tenantId: string): Promise<RiskAssessment | null>;
  findByProject(projectId: string, tenantId: string): Promise<RiskAssessment[]>;
  findAll(tenantId: string): Promise<RiskAssessment[]>;
}

export interface HseIncidentStore {
  save(incident: HseIncident, tx?: TxHandle): Promise<void>;
  findById(id: string, tenantId: string): Promise<HseIncident | null>;
  findByProject(projectId: string, tenantId: string): Promise<HseIncident[]>;
  findAll(tenantId: string): Promise<HseIncident[]>;
  findAllPaged(tenantId: string, page: PageParams): Promise<Page<HseIncident>>;
}

export interface PermitToWorkStore {
  save(permit: PermitToWork, tx?: TxHandle): Promise<void>;
  findById(id: string, tenantId: string): Promise<PermitToWork | null>;
  findByProject(projectId: string, tenantId: string): Promise<PermitToWork[]>;
  findAll(tenantId: string): Promise<PermitToWork[]>;
  findAllPaged(tenantId: string, page: PageParams): Promise<Page<PermitToWork>>;
}

export interface CapaActionStore {
  save(action: CapaAction, tx?: TxHandle): Promise<void>;
  findById(id: string, tenantId: string): Promise<CapaAction | null>;
  findByProject(projectId: string, tenantId: string): Promise<CapaAction[]>;
  findAll(tenantId: string): Promise<CapaAction[]>;
}

export interface ToolboxTalkStore {
  save(talk: ToolboxTalk, tx?: TxHandle): Promise<void>;
  findById(id: string, tenantId: string): Promise<ToolboxTalk | null>;
  findByProject(projectId: string, tenantId: string): Promise<ToolboxTalk[]>;
  findAll(tenantId: string): Promise<ToolboxTalk[]>;
}

export interface SafetyTrainingStore {
  save(record: SafetyTrainingRecord, tx?: TxHandle): Promise<void>;
  findById(id: string, tenantId: string): Promise<SafetyTrainingRecord | null>;
  findByWorker(workerId: string, tenantId: string): Promise<SafetyTrainingRecord[]>;
  findAll(tenantId: string): Promise<SafetyTrainingRecord[]>;
}

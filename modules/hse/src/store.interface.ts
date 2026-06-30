import type { TxHandle } from '@aura/core';
import type { HseIncident } from './domain/hse-incident';
import type { PermitToWork } from './domain/permit-to-work';
import type { CapaAction } from './domain/capa-action';
import type { ToolboxTalk } from './domain/toolbox-talk';

export interface HseIncidentStore {
  save(incident: HseIncident, tx?: TxHandle): Promise<void>;
  findById(id: string, tenantId: string): Promise<HseIncident | null>;
  findByProject(projectId: string, tenantId: string): Promise<HseIncident[]>;
  findAll(tenantId: string): Promise<HseIncident[]>;
}

export interface PermitToWorkStore {
  save(permit: PermitToWork, tx?: TxHandle): Promise<void>;
  findById(id: string, tenantId: string): Promise<PermitToWork | null>;
  findByProject(projectId: string, tenantId: string): Promise<PermitToWork[]>;
  findAll(tenantId: string): Promise<PermitToWork[]>;
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

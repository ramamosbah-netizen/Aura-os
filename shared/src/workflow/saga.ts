import { type Id, newId } from '../domain/id';

export type SagaStatus = 'pending' | 'running' | 'completed' | 'failed' | 'compensating' | 'compensated';
export type SagaStepStatus = 'pending' | 'running' | 'completed' | 'failed' | 'compensated';

export interface SagaStep {
  id: Id;
  sagaId: Id;
  tenantId: Id;
  companyId: Id | null;
  stepName: string;
  status: SagaStepStatus;
  actionPayload: any;
  compensationPayload: any;
  errorMessage: string | null;
  executedAt: string | null;
  compensatedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SagaInstance {
  id: Id;
  tenantId: Id;
  companyId: Id | null;
  sagaType: string;
  status: SagaStatus;
  payload: any;
  createdAt: string;
  updatedAt: string;
}

export interface NewSagaInstance {
  tenantId: Id;
  companyId?: Id | null;
  sagaType: string;
  payload: any;
}

export function makeSagaInstance(input: NewSagaInstance): SagaInstance {
  const now = new Date().toISOString();
  return {
    id: newId(),
    tenantId: input.tenantId,
    companyId: input.companyId ?? null,
    sagaType: input.sagaType,
    status: 'pending',
    payload: input.payload,
    createdAt: now,
    updatedAt: now,
  };
}

export function makeSagaStep(sagaId: Id, tenantId: Id, companyId: Id | null, stepName: string, actionPayload: any = {}, compensationPayload: any = {}): SagaStep {
  const now = new Date().toISOString();
  return {
    id: newId(),
    sagaId,
    tenantId,
    companyId,
    stepName,
    status: 'pending',
    actionPayload,
    compensationPayload,
    errorMessage: null,
    executedAt: null,
    compensatedAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

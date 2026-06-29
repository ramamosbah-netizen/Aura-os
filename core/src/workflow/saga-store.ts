import type { Id, SagaInstance, SagaStep } from '@aura/shared';

export const SAGA_STORE = Symbol('SAGA_STORE');

export interface SagaStore {
  createSaga(saga: SagaInstance): Promise<void>;
  updateSagaStatus(id: Id, status: string): Promise<void>;
  getSaga(id: Id): Promise<SagaInstance | null>;
  createSagaStep(step: SagaStep): Promise<void>;
  updateSagaStep(step: SagaStep): Promise<void>;
  getSagaSteps(sagaId: Id): Promise<SagaStep[]>;
  getSagaStep(sagaId: Id, stepName: string): Promise<SagaStep | null>;
}

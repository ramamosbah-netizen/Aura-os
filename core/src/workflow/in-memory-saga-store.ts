import { Injectable } from '@nestjs/common';
import type { Id, SagaInstance, SagaStep } from '@aura/shared';
import type { SagaStore } from './saga-store';

@Injectable()
export class InMemorySagaStore implements SagaStore {
  private readonly sagas = new Map<string, SagaInstance>();
  private readonly steps = new Map<string, SagaStep[]>();

  async createSaga(saga: SagaInstance): Promise<void> {
    this.sagas.set(saga.id, { ...saga });
    this.steps.set(saga.id, []);
  }

  async updateSagaStatus(id: Id, status: any): Promise<void> {
    const saga = this.sagas.get(id);
    if (saga) {
      saga.status = status;
      saga.updatedAt = new Date().toISOString();
    }
  }

  async getSaga(id: Id): Promise<SagaInstance | null> {
    const saga = this.sagas.get(id);
    return saga ? { ...saga } : null;
  }

  async createSagaStep(step: SagaStep): Promise<void> {
    const list = this.steps.get(step.sagaId) ?? [];
    list.push({ ...step });
    this.steps.set(step.sagaId, list);
  }

  async updateSagaStep(step: SagaStep): Promise<void> {
    const list = this.steps.get(step.sagaId) ?? [];
    const index = list.findIndex((s) => s.id === step.id);
    if (index !== -1) {
      list[index] = { ...step, updatedAt: new Date().toISOString() };
    }
  }

  async getSagaSteps(sagaId: Id): Promise<SagaStep[]> {
    const list = this.steps.get(sagaId) ?? [];
    return list.map((s) => ({ ...s }));
  }

  async getSagaStep(sagaId: Id, stepName: string): Promise<SagaStep | null> {
    const list = this.steps.get(sagaId) ?? [];
    const step = list.find((s) => s.stepName === stepName);
    return step ? { ...step } : null;
  }
}

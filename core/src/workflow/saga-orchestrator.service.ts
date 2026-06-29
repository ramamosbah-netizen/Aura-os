import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  type Id,
  type SagaInstance,
  type SagaStep,
  makeSagaInstance,
  makeSagaStep,
} from '@aura/shared';
import { SAGA_STORE, type SagaStore } from './saga-store';

export interface SagaStepDefinition<TPayload = any, TResult = any> {
  name: string;
  forward: (payload: TPayload, context: any) => Promise<TResult>;
  compensate: (payload: TPayload, context: any) => Promise<void>;
}

export interface SagaDefinition {
  sagaType: string;
  steps: SagaStepDefinition[];
}

@Injectable()
export class SagaOrchestratorService {
  private readonly logger = new Logger('SagaOrchestrator');
  private readonly definitions = new Map<string, SagaDefinition>();

  constructor(@Inject(SAGA_STORE) private readonly store: SagaStore) {}

  register(definition: SagaDefinition): void {
    if (this.definitions.has(definition.sagaType)) {
      throw new Error(`Saga definition already registered for type: ${definition.sagaType}`);
    }
    this.definitions.set(definition.sagaType, definition);
    this.logger.log(`Registered Saga: ${definition.sagaType} with ${definition.steps.length} steps`);
  }

  async execute(sagaType: string, input: { tenantId: Id; companyId?: Id | null; payload: any }): Promise<SagaInstance> {
    const def = this.definitions.get(sagaType);
    if (!def) {
      throw new Error(`Saga definition not found for type: ${sagaType}`);
    }

    const saga = makeSagaInstance({
      tenantId: input.tenantId,
      companyId: input.companyId,
      sagaType,
      payload: input.payload,
    });

    await this.store.createSaga(saga);
    await this.store.updateSagaStatus(saga.id, 'running');
    saga.status = 'running';

    this.logger.log(`Starting Saga ${sagaType} (Instance: ${saga.id})`);

    const executedSteps: { stepDef: SagaStepDefinition; stepModel: SagaStep }[] = [];

    try {
      for (const stepDef of def.steps) {
        const stepModel = makeSagaStep(
          saga.id,
          saga.tenantId,
          saga.companyId,
          stepDef.name,
          input.payload,
        );

        stepModel.status = 'running';
        await this.store.createSagaStep(stepModel);

        this.logger.log(`Executing Saga Step: ${stepDef.name} for Saga ID: ${saga.id}`);

        try {
          const result = await stepDef.forward(input.payload, { sagaId: saga.id, tenantId: saga.tenantId });
          stepModel.status = 'completed';
          stepModel.actionPayload = result ?? {};
          stepModel.executedAt = new Date().toISOString();
          await this.store.updateSagaStep(stepModel);

          executedSteps.push({ stepDef, stepModel });
        } catch (stepErr: any) {
          stepModel.status = 'failed';
          stepModel.errorMessage = stepErr?.message ?? String(stepErr);
          await this.store.updateSagaStep(stepModel);
          throw stepErr; // trigger compensation
        }
      }

      await this.store.updateSagaStatus(saga.id, 'completed');
      saga.status = 'completed';
      this.logger.log(`Saga ${sagaType} completed successfully (Instance: ${saga.id})`);
      return saga;
    } catch (err: any) {
      this.logger.error(`Saga ${sagaType} failed. Initiating compensation. Error: ${err.message}`);
      await this.store.updateSagaStatus(saga.id, 'compensating');

      // Compensate completed steps in reverse order
      for (let i = executedSteps.length - 1; i >= 0; i--) {
        const { stepDef, stepModel } = executedSteps[i];
        this.logger.warn(`Compensating step: ${stepDef.name} for Saga ID: ${saga.id}`);
        try {
          await stepDef.compensate(input.payload, {
            sagaId: saga.id,
            tenantId: saga.tenantId,
            stepResult: stepModel.actionPayload,
          });
          stepModel.status = 'compensated';
          stepModel.compensatedAt = new Date().toISOString();
          await this.store.updateSagaStep(stepModel);
        } catch (compErr: any) {
          this.logger.error(
            `Compensation failed for step ${stepDef.name} in Saga ${saga.id}: ${compErr.message}`,
          );
          // Don't swallow compensation failures, but log and keep compensating other steps if possible
        }
      }

      await this.store.updateSagaStatus(saga.id, 'compensated');
      saga.status = 'compensated';
      throw err;
    }
  }

  async getSagaState(sagaId: Id): Promise<{ saga: SagaInstance | null; steps: SagaStep[] }> {
    const saga = await this.store.getSaga(sagaId);
    const steps = await this.store.getSagaSteps(sagaId);
    return { saga, steps };
  }
}

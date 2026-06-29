import { Inject, Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import type { Id, SagaInstance, SagaStep, SagaStatus, SagaStepStatus } from '@aura/shared';
import { PG_POOL } from '../events/pg-pool';
import type { SagaStore } from './saga-store';

interface SagaRow {
  id: string;
  tenant_id: string;
  company_id: string | null;
  saga_type: string;
  status: string;
  payload: any;
  created_at: Date;
  updated_at: Date;
}

interface SagaStepRow {
  id: string;
  tenant_id: string;
  company_id: string | null;
  saga_id: string;
  step_name: string;
  status: string;
  action_payload: any;
  compensation_payload: any;
  error_message: string | null;
  executed_at: Date | null;
  compensated_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

const iso = (d: Date | null): string | null => (d ? d.toISOString() : null);

function rowToSaga(r: SagaRow): SagaInstance {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    companyId: r.company_id,
    sagaType: r.saga_type,
    status: r.status as SagaStatus,
    payload: r.payload,
    createdAt: r.created_at.toISOString(),
    updatedAt: r.updated_at.toISOString(),
  };
}

function rowToStep(r: SagaStepRow): SagaStep {
  return {
    id: r.id,
    sagaId: r.saga_id,
    tenantId: r.tenant_id,
    companyId: r.company_id,
    stepName: r.step_name,
    status: r.status as SagaStepStatus,
    actionPayload: r.action_payload,
    compensationPayload: r.compensation_payload,
    errorMessage: r.error_message,
    executedAt: iso(r.executed_at),
    compensatedAt: iso(r.compensated_at),
    createdAt: r.created_at.toISOString(),
    updatedAt: r.updated_at.toISOString(),
  };
}

@Injectable()
export class PostgresSagaStore implements SagaStore {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async createSaga(saga: SagaInstance): Promise<void> {
    await this.pool.query(
      `INSERT INTO public.aura_kernel_sagas (id, tenant_id, company_id, saga_type, status, payload, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        saga.id,
        saga.tenantId,
        saga.companyId,
        saga.sagaType,
        saga.status,
        JSON.stringify(saga.payload),
        saga.createdAt,
        saga.updatedAt,
      ],
    );
  }

  async updateSagaStatus(id: Id, status: string): Promise<void> {
    await this.pool.query(
      `UPDATE public.aura_kernel_sagas SET status = $2, updated_at = now() WHERE id = $1`,
      [id, status],
    );
  }

  async getSaga(id: Id): Promise<SagaInstance | null> {
    const res = await this.pool.query<SagaRow>(
      `SELECT id, tenant_id, company_id, saga_type, status, payload, created_at, updated_at
         FROM public.aura_kernel_sagas WHERE id = $1`,
      [id],
    );
    return res.rows.length ? rowToSaga(res.rows[0]) : null;
  }

  async createSagaStep(step: SagaStep): Promise<void> {
    await this.pool.query(
      `INSERT INTO public.aura_kernel_saga_steps
         (id, tenant_id, company_id, saga_id, step_name, status, action_payload, compensation_payload, error_message, executed_at, compensated_at, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
      [
        step.id,
        step.tenantId,
        step.companyId,
        step.sagaId,
        step.stepName,
        step.status,
        JSON.stringify(step.actionPayload),
        JSON.stringify(step.compensationPayload),
        step.errorMessage,
        step.executedAt,
        step.compensatedAt,
        step.createdAt,
        step.updatedAt,
      ],
    );
  }

  async updateSagaStep(step: SagaStep): Promise<void> {
    await this.pool.query(
      `UPDATE public.aura_kernel_saga_steps
          SET status = $2, action_payload = $3, compensation_payload = $4, error_message = $5,
              executed_at = $6, compensated_at = $7, updated_at = now()
        WHERE id = $1`,
      [
        step.id,
        step.status,
        JSON.stringify(step.actionPayload),
        JSON.stringify(step.compensationPayload),
        step.errorMessage,
        step.executedAt,
        step.compensatedAt,
      ],
    );
  }

  async getSagaSteps(sagaId: Id): Promise<SagaStep[]> {
    const res = await this.pool.query<SagaStepRow>(
      `SELECT id, tenant_id, company_id, saga_id, step_name, status, action_payload, compensation_payload, error_message, executed_at, compensated_at, created_at, updated_at
         FROM public.aura_kernel_saga_steps WHERE saga_id = $1 ORDER BY created_at ASC`,
      [sagaId],
    );
    return res.rows.map(rowToStep);
  }

  async getSagaStep(sagaId: Id, stepName: string): Promise<SagaStep | null> {
    const res = await this.pool.query<SagaStepRow>(
      `SELECT id, tenant_id, company_id, saga_id, step_name, status, action_payload, compensation_payload, error_message, executed_at, compensated_at, created_at, updated_at
         FROM public.aura_kernel_saga_steps WHERE saga_id = $1 AND step_name = $2`,
      [sagaId, stepName],
    );
    return res.rows.length ? rowToStep(res.rows[0]) : null;
  }
}

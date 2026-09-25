import type { Pool, PoolClient, QueryResultRow } from 'pg';
import type { TxHandle } from '@aura/core';
import type { QualityEscalation } from './domain/escalation';
import type { EscalationStore } from './store.interface';

const COLS = `id, tenant_id, company_id, project_id, source_type, source_id, source_reference, system, description, severity,
  point_no, failing_run_no, failing_actual, failing_remarks, requested_by, requested_at, status, ncr_id, decision_reason,
  decided_by, decided_at, created_at, updated_at`;

const iso = (v: unknown): string | null => (v == null ? null : v instanceof Date ? v.toISOString() : String(v));

/** Escalations from T&C (migration 0390). A decided one is frozen by the table's own trigger. */
export class PostgresEscalationStore implements EscalationStore {
  constructor(private readonly pool: Pool) {}

  async save(e: QualityEscalation, tx?: TxHandle): Promise<void> {
    const conn = (tx as PoolClient) || this.pool;
    await conn.query(
      `insert into public.aura_quality_escalations (${COLS})
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23)
       on conflict (id) do update set
         status = excluded.status, ncr_id = excluded.ncr_id, decision_reason = excluded.decision_reason,
         decided_by = excluded.decided_by, decided_at = excluded.decided_at, updated_at = excluded.updated_at`,
      [e.id, e.tenantId, e.companyId, e.projectId, e.sourceType, e.sourceId, e.sourceReference, e.system, e.description, e.severity,
        e.pointNo, e.failingRunNo, e.failingActual, e.failingRemarks, e.requestedBy, e.requestedAt, e.status, e.ncrId, e.decisionReason,
        e.decidedBy, e.decidedAt, e.createdAt, e.updatedAt],
    );
  }

  async findById(id: string, tenantId: string): Promise<QualityEscalation | null> {
    const res = await this.pool.query(`select ${COLS} from public.aura_quality_escalations where id = $1 and tenant_id = $2`, [id, tenantId]);
    return res.rowCount === 0 ? null : toEscalation(res.rows[0]);
  }

  async findBySource(tenantId: string, sourceId: string): Promise<QualityEscalation | null> {
    const res = await this.pool.query(
      `select ${COLS} from public.aura_quality_escalations where tenant_id = $1 and source_type = 'commissioning.punch' and source_id = $2`,
      [tenantId, sourceId],
    );
    return res.rowCount === 0 ? null : toEscalation(res.rows[0]);
  }

  async listByProject(tenantId: string, projectId: string): Promise<QualityEscalation[]> {
    const res = await this.pool.query(
      `select ${COLS} from public.aura_quality_escalations where tenant_id = $1 and project_id = $2 order by requested_at asc`,
      [tenantId, projectId],
    );
    return res.rows.map(toEscalation);
  }
}

function toEscalation(r: QueryResultRow): QualityEscalation {
  return {
    id: r.id, tenantId: r.tenant_id, companyId: r.company_id ?? null, projectId: r.project_id,
    sourceType: r.source_type, sourceId: r.source_id, sourceReference: r.source_reference ?? null, system: r.system ?? null,
    description: r.description, severity: r.severity ?? null, pointNo: r.point_no ?? null,
    failingRunNo: r.failing_run_no == null ? null : Number(r.failing_run_no),
    failingActual: r.failing_actual ?? null, failingRemarks: r.failing_remarks ?? null,
    requestedBy: r.requested_by, requestedAt: iso(r.requested_at)!, status: r.status, ncrId: r.ncr_id ?? null,
    decisionReason: r.decision_reason ?? null, decidedBy: r.decided_by ?? null, decidedAt: iso(r.decided_at),
    createdAt: iso(r.created_at)!, updatedAt: iso(r.updated_at)!,
  };
}

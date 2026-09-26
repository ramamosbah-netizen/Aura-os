import type { Pool, PoolClient } from 'pg';
import type { Id } from '@aura/shared';
import type { TxHandle } from '@aura/core';
import type { PreSalesAssignment } from './domain/presales-assignment';

export const CRM_PRESALES_ASSIGNMENT_STORE = Symbol('CRM_PRESALES_ASSIGNMENT_STORE');

/** One assignment per opportunity; a reissue is a new version of the same record, never a second one. */
export interface PreSalesAssignmentStore {
  save(a: PreSalesAssignment): Promise<void>;
  saveWithClient(tx: TxHandle | null, a: PreSalesAssignment): Promise<void>;
  get(tenantId: Id, id: Id): Promise<PreSalesAssignment | null>;
  forOpportunity(tenantId: Id, opportunityId: Id): Promise<PreSalesAssignment | null>;
  /**
   * The assignments whose next act is `userId`'s: to answer or to work (the engineer), or to
   * reassign or to receive (the Sales user who assigned it).
   */
  listAwaiting(tenantId: Id, userId: Id): Promise<PreSalesAssignment[]>;
}

const awaits = (a: PreSalesAssignment, userId: Id): boolean =>
  ((a.status === 'assigned' || a.status === 'accepted') && a.assigneeId === userId)
  || (a.status === 'declined' && a.assignedBy === userId)
  || (a.status === 'completed' && !a.acknowledgedAt && a.assignedBy === userId);

export class InMemoryPreSalesAssignmentStore implements PreSalesAssignmentStore {
  private readonly rows = new Map<string, PreSalesAssignment>();
  private clone<T>(v: T): T { return JSON.parse(JSON.stringify(v)) as T; }

  async save(a: PreSalesAssignment): Promise<void> {
    const other = [...this.rows.values()].find((row) => row.tenantId === a.tenantId && row.opportunityId === a.opportunityId && row.id !== a.id);
    if (other) throw new Error(`opportunity ${a.opportunityId} already has a Pre-Sales assignment`);
    this.rows.set(a.id, this.clone(a));
  }
  async saveWithClient(_tx: TxHandle | null, a: PreSalesAssignment): Promise<void> { await this.save(a); }
  async get(tenantId: Id, id: Id): Promise<PreSalesAssignment | null> {
    const row = this.rows.get(id);
    return row && row.tenantId === tenantId ? this.clone(row) : null;
  }
  async forOpportunity(tenantId: Id, opportunityId: Id): Promise<PreSalesAssignment | null> {
    const row = [...this.rows.values()].find((a) => a.tenantId === tenantId && a.opportunityId === opportunityId);
    return row ? this.clone(row) : null;
  }
  async listAwaiting(tenantId: Id, userId: Id): Promise<PreSalesAssignment[]> {
    return [...this.rows.values()].filter((a) => a.tenantId === tenantId && awaits(a, userId)).map((a) => this.clone(a));
  }
}

type Row = {
  id: string; tenant_id: string; company_id: string | null; opportunity_id: string; version: number;
  assignee_id: string; reviewer_id: string; input_revision: string; due_date: string | Date; deliverables: string[];
  status: PreSalesAssignment['status']; decline_reason: string | null; assigned_by: string; assigned_at: Date;
  accepted_at: Date | null; declined_at: Date | null; completed_at: Date | null; study_id: string | null;
  acknowledged_at: Date | null; history: PreSalesAssignment['history']; created_at: Date; updated_at: Date;
};

const iso = (d: Date | null): string | null => (d ? d.toISOString() : null);
const day = (d: string | Date): string => (typeof d === 'string' ? d.slice(0, 10) : d.toISOString().slice(0, 10));

function fromRow(r: Row): PreSalesAssignment {
  return {
    id: r.id, tenantId: r.tenant_id, companyId: r.company_id, opportunityId: r.opportunity_id, version: r.version,
    assigneeId: r.assignee_id, reviewerId: r.reviewer_id, inputRevision: r.input_revision, dueDate: day(r.due_date),
    deliverables: r.deliverables ?? [], status: r.status, declineReason: r.decline_reason, assignedBy: r.assigned_by,
    assignedAt: r.assigned_at.toISOString(), acceptedAt: iso(r.accepted_at), declinedAt: iso(r.declined_at),
    completedAt: iso(r.completed_at), studyId: r.study_id, acknowledgedAt: iso(r.acknowledged_at),
    history: r.history ?? [], createdAt: r.created_at.toISOString(), updatedAt: r.updated_at.toISOString(),
  };
}

const COLUMNS = `id,tenant_id,company_id,opportunity_id,version,assignee_id,reviewer_id,input_revision,due_date,deliverables,
  status,decline_reason,assigned_by,assigned_at,accepted_at,declined_at,completed_at,study_id,acknowledged_at,history,created_at,updated_at`;

export class PostgresPreSalesAssignmentStore implements PreSalesAssignmentStore {
  constructor(private readonly pool: Pool) {}

  async save(a: PreSalesAssignment): Promise<void> { await this.write(this.pool, a); }
  async saveWithClient(tx: TxHandle | null, a: PreSalesAssignment): Promise<void> {
    if (tx === null) return this.save(a);
    await this.write(tx as PoolClient, a);
  }

  private async write(executor: Pool | PoolClient, a: PreSalesAssignment): Promise<void> {
    await executor.query(
      `insert into public.aura_crm_presales_assignments (${COLUMNS})
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)
       on conflict (id) do update set version=excluded.version, assignee_id=excluded.assignee_id,
         reviewer_id=excluded.reviewer_id, input_revision=excluded.input_revision, due_date=excluded.due_date,
         deliverables=excluded.deliverables, status=excluded.status, decline_reason=excluded.decline_reason,
         accepted_at=excluded.accepted_at, declined_at=excluded.declined_at, completed_at=excluded.completed_at,
         study_id=excluded.study_id, acknowledged_at=excluded.acknowledged_at, history=excluded.history,
         updated_at=excluded.updated_at`,
      [a.id, a.tenantId, a.companyId, a.opportunityId, a.version, a.assigneeId, a.reviewerId, a.inputRevision,
       a.dueDate, JSON.stringify(a.deliverables), a.status, a.declineReason, a.assignedBy, a.assignedAt,
       a.acceptedAt, a.declinedAt, a.completedAt, a.studyId, a.acknowledgedAt, JSON.stringify(a.history),
       a.createdAt, a.updatedAt],
    );
  }

  async get(tenantId: Id, id: Id): Promise<PreSalesAssignment | null> {
    const r = await this.pool.query<Row>(`select ${COLUMNS} from public.aura_crm_presales_assignments where tenant_id=$1 and id=$2`, [tenantId, id]);
    return r.rows[0] ? fromRow(r.rows[0]) : null;
  }

  async forOpportunity(tenantId: Id, opportunityId: Id): Promise<PreSalesAssignment | null> {
    const r = await this.pool.query<Row>(`select ${COLUMNS} from public.aura_crm_presales_assignments where tenant_id=$1 and opportunity_id=$2`, [tenantId, opportunityId]);
    return r.rows[0] ? fromRow(r.rows[0]) : null;
  }

  async listAwaiting(tenantId: Id, userId: Id): Promise<PreSalesAssignment[]> {
    const r = await this.pool.query<Row>(
      `select ${COLUMNS} from public.aura_crm_presales_assignments
        where tenant_id=$1
          and ((status in ('assigned','accepted') and assignee_id=$2)
            or (status='declined' and assigned_by=$2)
            or (status='completed' and acknowledged_at is null and assigned_by=$2))
        order by updated_at`,
      [tenantId, userId],
    );
    return r.rows.map(fromRow);
  }
}

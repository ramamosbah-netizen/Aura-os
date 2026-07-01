import type { Pool, PoolClient, QueryResultRow } from 'pg';
import type { TxHandle } from '@aura/core';
import type { HseIncident } from './domain/hse-incident';
import type { PermitToWork } from './domain/permit-to-work';
import type { CapaAction } from './domain/capa-action';
import type { ToolboxTalk } from './domain/toolbox-talk';
import type { RiskAssessment, RiskLine } from './domain/risk-assessment';
import type { SafetyTrainingRecord } from './domain/safety-training';
import type { HseIncidentStore, PermitToWorkStore, CapaActionStore, ToolboxTalkStore, RiskAssessmentStore, SafetyTrainingStore } from './store.interface';

export class PostgresRiskAssessmentStore implements RiskAssessmentStore {
  constructor(private readonly pool: Pool) {}

  async save(ra: RiskAssessment, tx?: TxHandle): Promise<void> {
    const conn = (tx as PoolClient) || this.pool;
    await conn.query(
      `insert into public.aura_hse_risk_assessments (
        id, tenant_id, company_id, project_id, project_name, reference, activity, assessor, hazards,
        initial_score, residual_score, residual_band, status, review_date, created_by, created_at, updated_at
      ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
      on conflict (id) do update set
        activity = excluded.activity, assessor = excluded.assessor, hazards = excluded.hazards,
        initial_score = excluded.initial_score, residual_score = excluded.residual_score,
        residual_band = excluded.residual_band, status = excluded.status, review_date = excluded.review_date,
        updated_at = excluded.updated_at`,
      [ra.id, ra.tenantId, ra.companyId, ra.projectId, ra.projectName, ra.reference, ra.activity, ra.assessor, JSON.stringify(ra.hazards),
       ra.initialScore, ra.residualScore, ra.residualBand, ra.status, ra.reviewDate, ra.createdBy, ra.createdAt, ra.updatedAt],
    );
  }

  async findById(id: string, tenantId: string): Promise<RiskAssessment | null> {
    const res = await this.pool.query(`select * from public.aura_hse_risk_assessments where id = $1 and tenant_id = $2`, [id, tenantId]);
    return res.rowCount === 0 ? null : this.mapRow(res.rows[0]);
  }

  async findByProject(projectId: string, tenantId: string): Promise<RiskAssessment[]> {
    const res = await this.pool.query(`select * from public.aura_hse_risk_assessments where project_id = $1 and tenant_id = $2 order by created_at desc`, [projectId, tenantId]);
    return res.rows.map(this.mapRow);
  }

  async findAll(tenantId: string): Promise<RiskAssessment[]> {
    const res = await this.pool.query(`select * from public.aura_hse_risk_assessments where tenant_id = $1 order by created_at desc`, [tenantId]);
    return res.rows.map(this.mapRow);
  }

  private mapRow(row: any): RiskAssessment {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      companyId: row.company_id,
      projectId: row.project_id,
      projectName: row.project_name,
      reference: row.reference,
      activity: row.activity,
      assessor: row.assessor,
      hazards: (typeof row.hazards === 'string' ? JSON.parse(row.hazards) : (row.hazards ?? [])) as RiskLine[],
      initialScore: Number(row.initial_score),
      residualScore: Number(row.residual_score),
      residualBand: row.residual_band,
      status: row.status,
      reviewDate: row.review_date instanceof Date ? row.review_date.toISOString().split('T')[0] : (row.review_date ? String(row.review_date) : null),
      createdBy: row.created_by,
      createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
      updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at),
    };
  }
}

export class PostgresHseIncidentStore implements HseIncidentStore {
  constructor(private readonly pool: Pool) {}

  async save(incident: HseIncident, tx?: TxHandle): Promise<void> {
    const conn = (tx as PoolClient) || this.pool;
    await conn.query(
      `insert into public.aura_hse_incidents (
        id, tenant_id, company_id, project_id, project_name, date, severity, description, location_detail, status, created_by, created_at, updated_at
      ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      on conflict (id) do update set
        status = excluded.status,
        updated_at = excluded.updated_at`,
      [
        incident.id,
        incident.tenantId,
        incident.companyId,
        incident.projectId,
        incident.projectName,
        incident.date,
        incident.severity,
        incident.description,
        incident.locationDetail,
        incident.status,
        incident.createdBy,
        incident.createdAt,
        incident.updatedAt,
      ],
    );
  }

  async findById(id: string, tenantId: string): Promise<HseIncident | null> {
    const res = await this.pool.query(
      `select * from public.aura_hse_incidents where id = $1 and tenant_id = $2`,
      [id, tenantId],
    );
    if (res.rowCount === 0) return null;
    return this.mapHseIncident(res.rows[0]);
  }

  async findByProject(projectId: string, tenantId: string): Promise<HseIncident[]> {
    const res = await this.pool.query(
      `select * from public.aura_hse_incidents where project_id = $1 and tenant_id = $2 order by date desc`,
      [projectId, tenantId],
    );
    return res.rows.map(this.mapHseIncident);
  }

  async findAll(tenantId: string): Promise<HseIncident[]> {
    const res = await this.pool.query(
      `select * from public.aura_hse_incidents where tenant_id = $1 order by date desc`,
      [tenantId],
    );
    return res.rows.map(this.mapHseIncident);
  }

  private mapHseIncident(row: QueryResultRow): HseIncident {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      companyId: row.company_id,
      projectId: row.project_id,
      projectName: row.project_name,
      date: row.date instanceof Date ? row.date.toISOString().split('T')[0] : String(row.date),
      severity: row.severity,
      description: row.description,
      locationDetail: row.location_detail,
      status: row.status,
      createdBy: row.created_by,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    };
  }
}

export class PostgresPermitToWorkStore implements PermitToWorkStore {
  constructor(private readonly pool: Pool) {}

  async save(permit: PermitToWork, tx?: TxHandle): Promise<void> {
    const conn = (tx as PoolClient) || this.pool;
    await conn.query(
      `insert into public.aura_hse_ptws (
        id, tenant_id, company_id, project_id, project_name, permit_type, valid_from, valid_to, description, status, approved_by, approved_at, created_by, created_at, updated_at
      ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      on conflict (id) do update set
        status = excluded.status,
        approved_by = excluded.approved_by,
        approved_at = excluded.approved_at,
        updated_at = excluded.updated_at`,
      [
        permit.id,
        permit.tenantId,
        permit.companyId,
        permit.projectId,
        permit.projectName,
        permit.permitType,
        permit.validFrom,
        permit.validTo,
        permit.description,
        permit.status,
        permit.approvedBy,
        permit.approvedAt,
        permit.createdBy,
        permit.createdAt,
        permit.updatedAt,
      ],
    );
  }

  async findById(id: string, tenantId: string): Promise<PermitToWork | null> {
    const res = await this.pool.query(
      `select * from public.aura_hse_ptws where id = $1 and tenant_id = $2`,
      [id, tenantId],
    );
    if (res.rowCount === 0) return null;
    return this.mapPermit(res.rows[0]);
  }

  async findByProject(projectId: string, tenantId: string): Promise<PermitToWork[]> {
    const res = await this.pool.query(
      `select * from public.aura_hse_ptws where project_id = $1 and tenant_id = $2 order by created_at desc`,
      [projectId, tenantId],
    );
    return res.rows.map(this.mapPermit);
  }

  async findAll(tenantId: string): Promise<PermitToWork[]> {
    const res = await this.pool.query(
      `select * from public.aura_hse_ptws where tenant_id = $1 order by created_at desc`,
      [tenantId],
    );
    return res.rows.map(this.mapPermit);
  }

  private mapPermit(row: QueryResultRow): PermitToWork {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      companyId: row.company_id,
      projectId: row.project_id,
      projectName: row.project_name,
      permitType: row.permit_type,
      validFrom: row.valid_from.toISOString(),
      validTo: row.valid_to.toISOString(),
      description: row.description,
      status: row.status,
      approvedBy: row.approved_by,
      approvedAt: row.approved_at ? row.approved_at.toISOString() : null,
      createdBy: row.created_by,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    };
  }
}

export class PostgresCapaActionStore implements CapaActionStore {
  constructor(private readonly pool: Pool) {}

  async save(action: CapaAction, tx?: TxHandle): Promise<void> {
    const conn = (tx as PoolClient) || this.pool;
    await conn.query(
      `insert into public.aura_hse_capas (
        id, tenant_id, company_id, project_id, project_name, source_type, source_id, action_required, assigned_to, due_date, status, completed_at, created_by, created_at, updated_at
      ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      on conflict (id) do update set
        status = excluded.status,
        completed_at = excluded.completed_at,
        updated_at = excluded.updated_at`,
      [
        action.id,
        action.tenantId,
        action.companyId,
        action.projectId,
        action.projectName,
        action.sourceType,
        action.sourceId,
        action.actionRequired,
        action.assignedTo,
        action.dueDate,
        action.status,
        action.completedAt,
        action.createdBy,
        action.createdAt,
        action.updatedAt,
      ],
    );
  }

  async findById(id: string, tenantId: string): Promise<CapaAction | null> {
    const res = await this.pool.query(
      `select * from public.aura_hse_capas where id = $1 and tenant_id = $2`,
      [id, tenantId],
    );
    if (res.rowCount === 0) return null;
    return this.mapCapa(res.rows[0]);
  }

  async findByProject(projectId: string, tenantId: string): Promise<CapaAction[]> {
    const res = await this.pool.query(
      `select * from public.aura_hse_capas where project_id = $1 and tenant_id = $2 order by due_date asc`,
      [projectId, tenantId],
    );
    return res.rows.map(this.mapCapa);
  }

  async findAll(tenantId: string): Promise<CapaAction[]> {
    const res = await this.pool.query(
      `select * from public.aura_hse_capas where tenant_id = $1 order by due_date asc`,
      [tenantId],
    );
    return res.rows.map(this.mapCapa);
  }

  private mapCapa(row: QueryResultRow): CapaAction {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      companyId: row.company_id,
      projectId: row.project_id,
      projectName: row.project_name,
      sourceType: row.source_type,
      sourceId: row.source_id,
      actionRequired: row.action_required,
      assignedTo: row.assigned_to,
      dueDate: row.due_date instanceof Date ? row.due_date.toISOString().split('T')[0] : String(row.due_date),
      status: row.status,
      completedAt: row.completed_at ? row.completed_at.toISOString() : null,
      createdBy: row.created_by,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    };
  }
}

const TOOLBOX_COLS =
  'id, tenant_id, company_id, project_id, project_name, topic, conducted_by, talk_date::text AS talk_date, attendee_count, notes, created_by, created_at';

export class PostgresToolboxTalkStore implements ToolboxTalkStore {
  constructor(private readonly pool: Pool) {}

  async save(talk: ToolboxTalk, tx?: TxHandle): Promise<void> {
    const conn = (tx as PoolClient) || this.pool;
    await conn.query(
      `insert into public.aura_hse_toolbox_talks (
        id, tenant_id, company_id, project_id, project_name, topic, conducted_by, talk_date, attendee_count, notes, created_by, created_at
      ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [talk.id, talk.tenantId, talk.companyId, talk.projectId, talk.projectName, talk.topic, talk.conductedBy, talk.talkDate, talk.attendeeCount, talk.notes, talk.createdBy, talk.createdAt],
    );
  }

  async findById(id: string, tenantId: string): Promise<ToolboxTalk | null> {
    const res = await this.pool.query(`select ${TOOLBOX_COLS} from public.aura_hse_toolbox_talks where id = $1 and tenant_id = $2`, [id, tenantId]);
    return res.rowCount === 0 ? null : this.mapTalk(res.rows[0]);
  }

  async findByProject(projectId: string, tenantId: string): Promise<ToolboxTalk[]> {
    const res = await this.pool.query(`select ${TOOLBOX_COLS} from public.aura_hse_toolbox_talks where project_id = $1 and tenant_id = $2 order by talk_date desc, created_at desc`, [projectId, tenantId]);
    return res.rows.map(this.mapTalk);
  }

  async findAll(tenantId: string): Promise<ToolboxTalk[]> {
    const res = await this.pool.query(`select ${TOOLBOX_COLS} from public.aura_hse_toolbox_talks where tenant_id = $1 order by talk_date desc, created_at desc`, [tenantId]);
    return res.rows.map(this.mapTalk);
  }

  private mapTalk(row: QueryResultRow): ToolboxTalk {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      companyId: row.company_id,
      projectId: row.project_id,
      projectName: row.project_name,
      topic: row.topic,
      conductedBy: row.conducted_by,
      talkDate: String(row.talk_date),
      attendeeCount: Number(row.attendee_count),
      notes: row.notes || '',
      createdBy: row.created_by,
      createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
    };
  }
}

export class PostgresSafetyTrainingStore implements SafetyTrainingStore {
  constructor(private readonly pool: Pool) {}

  async save(r: SafetyTrainingRecord, tx?: TxHandle): Promise<void> {
    const conn = (tx as PoolClient) || this.pool;
    await conn.query(
      `insert into public.aura_hse_safety_training (
        id, tenant_id, company_id, worker_name, worker_id, induction_date, card_number, card_expiry, certifications, status, created_by, created_at, updated_at
      ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11,$12,$13)
      on conflict (tenant_id, worker_id) do update set
        worker_name = excluded.worker_name,
        induction_date = excluded.induction_date,
        card_number = excluded.card_number,
        card_expiry = excluded.card_expiry,
        certifications = excluded.certifications,
        status = excluded.status,
        updated_at = excluded.updated_at`,
      [r.id, r.tenantId, r.companyId, r.workerName, r.workerId, r.inductionDate, r.cardNumber, r.cardExpiry, JSON.stringify(r.certifications), r.status, r.createdBy, r.createdAt, r.updatedAt],
    );
  }

  async findById(id: string, tenantId: string): Promise<SafetyTrainingRecord | null> {
    const res = await this.pool.query(
      `select * from public.aura_hse_safety_training where id = $1 and tenant_id = $2`,
      [id, tenantId]
    );
    if (res.rowCount === 0) return null;
    return this.mapTraining(res.rows[0]);
  }

  async findByWorker(workerId: string, tenantId: string): Promise<SafetyTrainingRecord[]> {
    const res = await this.pool.query(
      `select * from public.aura_hse_safety_training where worker_id = $1 and tenant_id = $2 order by created_at desc`,
      [workerId, tenantId]
    );
    return res.rows.map(this.mapTraining);
  }

  async findAll(tenantId: string): Promise<SafetyTrainingRecord[]> {
    const res = await this.pool.query(
      `select * from public.aura_hse_safety_training where tenant_id = $1 order by created_at desc`,
      [tenantId]
    );
    return res.rows.map(this.mapTraining);
  }

  private mapTraining(row: any): SafetyTrainingRecord {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      companyId: row.company_id,
      workerName: row.worker_name,
      workerId: row.worker_id,
      inductionDate: row.induction_date instanceof Date ? row.induction_date.toISOString().split('T')[0] : String(row.induction_date),
      cardNumber: row.card_number,
      cardExpiry: row.card_expiry instanceof Date ? row.card_expiry.toISOString().split('T')[0] : (row.card_expiry ? String(row.card_expiry) : null),
      certifications: (typeof row.certifications === 'string' ? JSON.parse(row.certifications) : (row.certifications ?? [])) as string[],
      status: row.status as 'valid' | 'expired',
      createdBy: row.created_by,
      createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
      updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at),
    };
  }
}

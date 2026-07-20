import type { Pool, PoolClient } from 'pg';
import type { Id, Lead, LeadStatus, LeadSource, LeadQualificationDimensions, ElvSector, ElvSystem, ProjectStage, Page, PageParams } from '@aura/shared';
import { makePage } from '@aura/shared';
import type { TxHandle } from '@aura/core';
import type { LeadFilter, LeadStore } from './lead-store';

interface LeadRow {
  id: string;
  tenant_id: string;
  company_id: string | null;
  name: string;
  company_name: string | null;
  email: string | null;
  phone: string | null;
  status: string;
  source: string | null;
  assigned_to: string | null;
  assigned_at: Date | null;
  accepted_at: Date | null;
  first_responded_at: Date | null;
  sla_first_response_hours: number | null;
  next_activity_due: string | null;
  converted_opportunity_id: string | null;
  converted_at: Date | null;
  signal_id: string | null;
  account_id: string | null;
  qualification_dimensions: LeadQualificationDimensions | string | null;
  qualification_notes: string | null;
  qualification_assessed_at: Date | null;
  qualification_assessed_by: string | null;
  requirement: string | null;
  systems: ElvSystem[] | string | null;
  sector: string | null;
  project_name: string | null;
  project_location: string | null;
  consultant: string | null;
  main_contractor: string | null;
  estimated_value: string | number | null;
  project_stage: string | null;
  expected_timeline: string | null;
  created_at: Date;
  updated_at: Date;
}

const COLS =
  'id, tenant_id, company_id, name, company_name, email, phone, status, source, ' +
  'assigned_to, assigned_at, accepted_at, first_responded_at, sla_first_response_hours, next_activity_due, ' +
  'converted_opportunity_id, converted_at, signal_id, ' +
  'qualification_dimensions, qualification_notes, qualification_assessed_at, qualification_assessed_by, ' +
  'requirement, systems, sector, project_name, project_location, consultant, main_contractor, ' +
  'estimated_value, project_stage, expected_timeline, ' +
  'created_at, updated_at, account_id';

function rowToLead(r: LeadRow): Lead {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    companyId: r.company_id,
    name: r.name,
    companyName: r.company_name,
    email: r.email,
    phone: r.phone,
    status: r.status as LeadStatus,
    source: r.source as LeadSource | null,
    assignedTo: r.assigned_to,
    assignedAt: r.assigned_at ? r.assigned_at.toISOString() : null,
    acceptedAt: r.accepted_at ? r.accepted_at.toISOString() : null,
    firstRespondedAt: r.first_responded_at ? r.first_responded_at.toISOString() : null,
    slaFirstResponseHours: r.sla_first_response_hours,
    nextActivityDue: r.next_activity_due,
    convertedOpportunityId: r.converted_opportunity_id,
    convertedAt: r.converted_at ? r.converted_at.toISOString() : null,
    signalId: r.signal_id,
    accountId: r.account_id ?? null,
    // jsonb comes back parsed from pg, but a text-typed column or a driver quirk yields a string —
    // the quotation store hit exactly this, so parse defensively rather than trust the shape.
    qualificationDimensions:
      typeof r.qualification_dimensions === 'string'
        ? (JSON.parse(r.qualification_dimensions) as LeadQualificationDimensions)
        : (r.qualification_dimensions ?? null),
    qualificationNotes: r.qualification_notes,
    qualificationAssessedAt: r.qualification_assessed_at ? r.qualification_assessed_at.toISOString() : null,
    qualificationAssessedBy: r.qualification_assessed_by,
    requirement: r.requirement,
    systems: typeof r.systems === 'string' ? (JSON.parse(r.systems) as ElvSystem[]) : (r.systems ?? null),
    sector: r.sector as ElvSector | null,
    projectName: r.project_name,
    projectLocation: r.project_location,
    consultant: r.consultant,
    mainContractor: r.main_contractor,
    // numeric(14,2) comes back as a STRING from pg (it preserves precision) — Number() it or
    // arithmetic downstream silently concatenates instead of adding.
    estimatedValue: r.estimated_value === null ? null : Number(r.estimated_value),
    projectStage: r.project_stage as ProjectStage | null,
    expectedTimeline: r.expected_timeline,
    createdAt: r.created_at.toISOString(),
    updatedAt: r.updated_at.toISOString(),
  };
}

export class PostgresLeadStore implements LeadStore {
  constructor(private readonly pool: Pool) {}

  async create(l: Lead): Promise<void> {
    await this.insert(this.pool, l);
  }

  async createWithClient(tx: TxHandle | null, l: Lead): Promise<void> {
    if (tx === null) return this.create(l);
    await this.insert(tx as PoolClient, l);
  }

  async update(l: Lead): Promise<void> {
    await this.updateWith(this.pool, l);
  }

  async updateWithClient(tx: TxHandle | null, l: Lead): Promise<void> {
    if (tx === null) return this.update(l);
    await this.updateWith(tx as PoolClient, l);
  }

  private updateWith(executor: Pool | PoolClient, l: Lead): Promise<unknown> {
    return executor.query(
      `UPDATE public.aura_crm_leads
          SET name = $2, company_name = $3, email = $4, phone = $5, status = $6, source = $7,
              assigned_to = $8, assigned_at = $9, accepted_at = $30, first_responded_at = $10,
              sla_first_response_hours = $11, next_activity_due = $12,
              converted_opportunity_id = $13, converted_at = $14, signal_id = $15,
              qualification_dimensions = $16, qualification_notes = $17,
              qualification_assessed_at = $18, qualification_assessed_by = $19,
              requirement = $20, systems = $21, sector = $22, project_name = $23,
              project_location = $24, consultant = $25, main_contractor = $26,
              estimated_value = $27, project_stage = $28, expected_timeline = $29,
              account_id = $31, updated_at = now()
        WHERE id = $1`,
      [l.id, l.name, l.companyName, l.email, l.phone, l.status, l.source,
       l.assignedTo, l.assignedAt, l.firstRespondedAt, l.slaFirstResponseHours, l.nextActivityDue,
       l.convertedOpportunityId, l.convertedAt, l.signalId,
       l.qualificationDimensions ? JSON.stringify(l.qualificationDimensions) : null,
       l.qualificationNotes, l.qualificationAssessedAt, l.qualificationAssessedBy,
       l.requirement, l.systems ? JSON.stringify(l.systems) : null, l.sector, l.projectName,
       l.projectLocation, l.consultant, l.mainContractor, l.estimatedValue, l.projectStage,
       l.expectedTimeline, l.acceptedAt, l.accountId],
    );
  }

  private insert(executor: Pool | PoolClient, l: Lead): Promise<unknown> {
    // The placeholders are positional against COLS — widening COLS without widening these silently
    // writes values into the wrong columns, so the two must be edited together.
    return executor.query(
      `INSERT INTO public.aura_crm_leads (${COLS})
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,
               $24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35)`,
      [l.id, l.tenantId, l.companyId, l.name, l.companyName, l.email, l.phone, l.status, l.source,
       l.assignedTo, l.assignedAt, l.acceptedAt, l.firstRespondedAt, l.slaFirstResponseHours, l.nextActivityDue,
       l.convertedOpportunityId, l.convertedAt, l.signalId,
       l.qualificationDimensions ? JSON.stringify(l.qualificationDimensions) : null,
       l.qualificationNotes, l.qualificationAssessedAt, l.qualificationAssessedBy,
       l.requirement, l.systems ? JSON.stringify(l.systems) : null, l.sector, l.projectName,
       l.projectLocation, l.consultant, l.mainContractor, l.estimatedValue, l.projectStage,
       l.expectedTimeline,
       l.createdAt, l.updatedAt, l.accountId],
    );
  }

  async get(id: Id): Promise<Lead | null> {
    const res = await this.pool.query<LeadRow>(
      `SELECT ${COLS} FROM public.aura_crm_leads WHERE id = $1`,
      [id],
    );
    return res.rows.length ? rowToLead(res.rows[0]) : null;
  }

  private buildWhere(filter: LeadFilter): { whereSql: string; params: unknown[] } {
    const where: string[] = [];
    const params: unknown[] = [];
    if (filter.tenantId) {
      params.push(filter.tenantId);
      where.push(`tenant_id = $${params.length}`);
    }
    if (filter.assignedTo) {
      params.push(filter.assignedTo);
      where.push(`assigned_to = $${params.length}`);
    }
    if (filter.status) {
      params.push(filter.status);
      where.push(`status = $${params.length}`);
    }
    return { whereSql: where.length ? `WHERE ${where.join(' AND ')}` : '', params };
  }

  async list(filter: LeadFilter = {}): Promise<Lead[]> {
    const { whereSql, params } = this.buildWhere(filter);
    params.push(filter.limit ?? 100);
    const res = await this.pool.query<LeadRow>(
      `SELECT ${COLS} FROM public.aura_crm_leads ${whereSql} ORDER BY created_at DESC LIMIT $${params.length}`,
      params,
    );
    return res.rows.map(rowToLead);
  }
  async listPaged(filter: LeadFilter, page: PageParams): Promise<Page<Lead>> {
    const { whereSql, params } = this.buildWhere(filter);
    const countRes = await this.pool.query<{ count: string }>(
      `SELECT COUNT(*)::int AS count FROM public.aura_crm_leads ${whereSql}`, params);
    const total = Number(countRes.rows[0]?.count ?? 0);
    const winParams = [...params, page.limit, page.offset];
    const res = await this.pool.query<LeadRow>(
      `SELECT ${COLS} FROM public.aura_crm_leads ${whereSql} ORDER BY created_at DESC LIMIT $${winParams.length - 1} OFFSET $${winParams.length}`,
      winParams,
    );
    return makePage(res.rows.map(rowToLead), total, page);
  }
}

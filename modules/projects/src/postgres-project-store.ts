import type { Pool, PoolClient } from 'pg';
import type { Id, Page, PageParams } from '@aura/shared';
import { makePage } from '@aura/shared';
import type { TxHandle } from '@aura/core';
import type { Project } from './domain/project';
import type { ProjectFilter, ProjectStore } from './project-store';

interface Row {
  id: string;
  tenant_id: string;
  company_id: string | null;
  title: string;
  reference: string | null;
  contract_id: string | null;
  contract_title: string | null;
  account_id: string | null;
  account_name: string | null;
  status: string;
  value: string | number;
  origin: string | null;
  handover_id: string | null;
  handover_snapshot_hash: string | null;
  handover_snapshot: Record<string, unknown> | null;
  handover_locked_at: Date | string | null;
  source_opportunity_id: string | null;
  source_tender_id: string | null;
  commercial_scope_revision_id: string | null;
  boq_revision_id: string | null;
  estimate_revision_id: string | null;
  accepted_quotation_id: string | null;
  accepted_quotation_revision_id: string | null;
  commercial_baseline_id: string | null;
  original_contract_value: string | number | null;
  currency: string | null;
  award_acceptance_type: string | null;
  award_acceptance_evidence: Record<string, unknown> | null;
  owner_id: string | null;
  created_by: string | null;
  created_at: Date | string;
}

const COLS =
  'id, tenant_id, company_id, title, reference, contract_id, contract_title, account_id, account_name, status, value, origin, handover_id, handover_snapshot_hash, handover_snapshot, handover_locked_at, source_opportunity_id, source_tender_id, commercial_scope_revision_id, boq_revision_id, estimate_revision_id, accepted_quotation_id, accepted_quotation_revision_id, commercial_baseline_id, original_contract_value, currency, award_acceptance_type, award_acceptance_evidence, owner_id, created_by, created_at';

function rowToProject(r: Row): Project {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    companyId: r.company_id,
    title: r.title,
    reference: r.reference,
    contractId: r.contract_id,
    contractTitle: r.contract_title,
    accountId: r.account_id,
    accountName: r.account_name,
    status: r.status as Project['status'],
    value: Number(r.value),
    origin: (r.origin as Project['origin']) ?? 'legacy',
    handoverId: r.handover_id,
    handoverSnapshotHash: r.handover_snapshot_hash,
    handoverSnapshot: r.handover_snapshot,
    handoverLockedAt: r.handover_locked_at ? (r.handover_locked_at instanceof Date ? r.handover_locked_at.toISOString() : String(r.handover_locked_at)) : null,
    sourceOpportunityId: r.source_opportunity_id,
    sourceTenderId: r.source_tender_id,
    commercialScopeRevisionId: r.commercial_scope_revision_id,
    boqRevisionId: r.boq_revision_id,
    estimateRevisionId: r.estimate_revision_id,
    acceptedQuotationId: r.accepted_quotation_id,
    acceptedQuotationRevisionId: r.accepted_quotation_revision_id,
    commercialBaselineId: r.commercial_baseline_id,
    originalContractValue: r.original_contract_value == null ? null : Number(r.original_contract_value),
    currency: r.currency,
    awardAcceptanceType: (r.award_acceptance_type as Project['awardAcceptanceType']) ?? null,
    awardAcceptanceEvidence: r.award_acceptance_evidence,
    ownerId: r.owner_id,
    createdBy: r.created_by,
    createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
  };
}

/** Durable projects on Postgres (`aura_projects_projects`). */
export class PostgresProjectStore implements ProjectStore {
  constructor(private readonly pool: Pool) {}

  async create(p: Project): Promise<void> {
    await this.insert(this.pool, p);
  }

  async createWithClient(tx: TxHandle | null, p: Project): Promise<void> {
    if (tx === null) return this.create(p);
    await this.insert(tx as PoolClient, p);
  }

  private insert(executor: Pool | PoolClient, p: Project): Promise<unknown> {
    return executor.query(
      `INSERT INTO public.aura_projects_projects (${COLS}) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31)`,
      [p.id, p.tenantId, p.companyId, p.title, p.reference, p.contractId, p.contractTitle, p.accountId, p.accountName, p.status, p.value, p.origin, p.handoverId, p.handoverSnapshotHash, p.handoverSnapshot ? JSON.stringify(p.handoverSnapshot) : null, p.handoverLockedAt, p.sourceOpportunityId, p.sourceTenderId, p.commercialScopeRevisionId, p.boqRevisionId, p.estimateRevisionId, p.acceptedQuotationId, p.acceptedQuotationRevisionId, p.commercialBaselineId, p.originalContractValue, p.currency, p.awardAcceptanceType, p.awardAcceptanceEvidence ? JSON.stringify(p.awardAcceptanceEvidence) : null, p.ownerId, p.createdBy, p.createdAt],
    );
  }

  async update(p: Project): Promise<void> {
    await this.upd(this.pool, p);
  }

  async updateWithClient(tx: TxHandle | null, p: Project): Promise<void> {
    if (tx === null) return this.update(p);
    await this.upd(tx as PoolClient, p);
  }

  private upd(executor: Pool | PoolClient, p: Project): Promise<unknown> {
    return executor.query(
      `UPDATE public.aura_projects_projects SET title=$2, reference=$3, contract_id=$4, contract_title=$5, account_id=$6, account_name=$7, status=$8, value=$9, owner_id=$10 WHERE id=$1`,
      [p.id, p.title, p.reference, p.contractId, p.contractTitle, p.accountId, p.accountName, p.status, p.value, p.ownerId],
    );
  }

  async get(id: Id): Promise<Project | null> {
    const res = await this.pool.query<Row>(
      `SELECT ${COLS} FROM public.aura_projects_projects WHERE id = $1`,
      [id],
    );
    return res.rows.length ? rowToProject(res.rows[0]) : null;
  }

  async list(filter: ProjectFilter = {}): Promise<Project[]> {
    const where: string[] = [];
    const params: unknown[] = [];
    const add = (col: string, val?: string): void => {
      if (val) {
        params.push(val);
        where.push(`${col} = $${params.length}`);
      }
    };
    add('tenant_id', filter.tenantId);
    add('status', filter.status);
    add('account_id', filter.accountId);
    add('contract_id', filter.contractId);
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    params.push(filter.limit ?? 100);
    const res = await this.pool.query<Row>(
      `SELECT ${COLS} FROM public.aura_projects_projects ${whereSql} ORDER BY created_at DESC LIMIT $${params.length}`,
      params,
    );
    return res.rows.map(rowToProject);
  }

  async listPaged(filter: ProjectFilter, page: PageParams): Promise<Page<Project>> {
    const where: string[] = [];
    const params: unknown[] = [];
    const add = (col: string, val?: string): void => {
      if (val) { params.push(val); where.push(`${col} = $${params.length}`); }
    };
    add('tenant_id', filter.tenantId);
    add('status', filter.status);
    add('account_id', filter.accountId);
    add('contract_id', filter.contractId);
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const countRes = await this.pool.query<{ count: string }>(
      `SELECT COUNT(*)::int AS count FROM public.aura_projects_projects ${whereSql}`, params);
    const total = Number(countRes.rows[0]?.count ?? 0);
    const winParams = [...params, page.limit, page.offset];
    const res = await this.pool.query<Row>(
      `SELECT ${COLS} FROM public.aura_projects_projects ${whereSql} ORDER BY created_at DESC LIMIT $${winParams.length - 1} OFFSET $${winParams.length}`,
      winParams,
    );
    return makePage(res.rows.map(rowToProject), total, page);
  }
}

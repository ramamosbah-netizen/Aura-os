import type { Pool, PoolClient } from 'pg';
import type { Id, Page, PageParams } from '@aura/shared';
import { makePage } from '@aura/shared';
import type { TxHandle } from '@aura/core';
import type { Contract } from './domain/contract';
import type { ContractFilter, ContractStore } from './contract-store';

interface Row {
  id: string;
  tenant_id: string;
  company_id: string | null;
  title: string;
  reference: string | null;
  tender_id: string | null;
  tender_title: string | null;
  account_id: string | null;
  account_name: string | null;
  status: string;
  value: string | number;
  source_opportunity_id: string | null;
  currency: string | null;
  commercial_scope_revision_id: string | null;
  boq_revision_id: string | null;
  estimate_revision_id: string | null;
  accepted_quotation_id: string | null;
  accepted_quotation_revision_id: string | null;
  award_acceptance_type: string | null;
  award_acceptance_evidence: Record<string, unknown> | null;
  commercial_baseline_id: string | null;
  owner_id: string | null;
  created_by: string | null;
  created_at: Date | string;
}

const COLS =
  'id, tenant_id, company_id, title, reference, tender_id, tender_title, account_id, account_name, status, value, commercial_baseline_id, source_opportunity_id, currency, commercial_scope_revision_id, boq_revision_id, estimate_revision_id, accepted_quotation_id, accepted_quotation_revision_id, award_acceptance_type, award_acceptance_evidence, owner_id, created_by, created_at';

function rowToContract(r: Row): Contract {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    companyId: r.company_id,
    title: r.title,
    reference: r.reference,
    tenderId: r.tender_id,
    tenderTitle: r.tender_title,
    accountId: r.account_id,
    accountName: r.account_name,
    status: r.status as Contract['status'],
    value: Number(r.value),
    commercialBaselineId: r.commercial_baseline_id,
    sourceOpportunityId: r.source_opportunity_id,
    currency: r.currency,
    commercialScopeRevisionId: r.commercial_scope_revision_id,
    boqRevisionId: r.boq_revision_id,
    estimateRevisionId: r.estimate_revision_id,
    acceptedQuotationId: r.accepted_quotation_id,
    acceptedQuotationRevisionId: r.accepted_quotation_revision_id,
    awardAcceptanceType: (r.award_acceptance_type as Contract['awardAcceptanceType']) ?? null,
    awardAcceptanceEvidence: r.award_acceptance_evidence,
    ownerId: r.owner_id,
    createdBy: r.created_by,
    createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
  };
}

/** Durable contracts on Postgres (`aura_contracts_contracts`). */
export class PostgresContractStore implements ContractStore {
  constructor(private readonly pool: Pool) {}

  async create(c: Contract): Promise<void> {
    await this.insert(this.pool, c);
  }

  async createWithClient(tx: TxHandle | null, c: Contract): Promise<void> {
    if (tx === null) return this.create(c);
    await this.insert(tx as PoolClient, c);
  }

  private insert(executor: Pool | PoolClient, c: Contract): Promise<unknown> {
    return executor.query(
      `INSERT INTO public.aura_contracts_contracts (${COLS}) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24)`,
      [c.id, c.tenantId, c.companyId, c.title, c.reference, c.tenderId, c.tenderTitle, c.accountId, c.accountName, c.status, c.value, c.commercialBaselineId, c.sourceOpportunityId, c.currency, c.commercialScopeRevisionId, c.boqRevisionId, c.estimateRevisionId, c.acceptedQuotationId, c.acceptedQuotationRevisionId, c.awardAcceptanceType, c.awardAcceptanceEvidence ? JSON.stringify(c.awardAcceptanceEvidence) : null, c.ownerId, c.createdBy, c.createdAt],
    );
  }

  async update(c: Contract): Promise<void> {
    await this.upd(this.pool, c);
  }

  async updateWithClient(tx: TxHandle | null, c: Contract): Promise<void> {
    if (tx === null) return this.update(c);
    await this.upd(tx as PoolClient, c);
  }

  private upd(executor: Pool | PoolClient, c: Contract): Promise<unknown> {
    return executor.query(
      `UPDATE public.aura_contracts_contracts SET title=$2, reference=$3, tender_id=$4, tender_title=$5, account_id=$6, account_name=$7, status=$8, value=$9, owner_id=$10 WHERE id=$1`,
      [c.id, c.title, c.reference, c.tenderId, c.tenderTitle, c.accountId, c.accountName, c.status, c.value, c.ownerId],
    );
  }

  async get(id: Id): Promise<Contract | null> {
    const res = await this.pool.query<Row>(
      `SELECT ${COLS} FROM public.aura_contracts_contracts WHERE id = $1`,
      [id],
    );
    return res.rows.length ? rowToContract(res.rows[0]) : null;
  }

  async list(filter: ContractFilter = {}): Promise<Contract[]> {
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
    add('tender_id', filter.tenderId);
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    params.push(filter.limit ?? 100);
    const res = await this.pool.query<Row>(
      `SELECT ${COLS} FROM public.aura_contracts_contracts ${whereSql} ORDER BY created_at DESC LIMIT $${params.length}`,
      params,
    );
    return res.rows.map(rowToContract);
  }

  async listPaged(filter: ContractFilter, page: PageParams): Promise<Page<Contract>> {
    const where: string[] = [];
    const params: unknown[] = [];
    const add = (col: string, val?: string): void => {
      if (val) { params.push(val); where.push(`${col} = $${params.length}`); }
    };
    add('tenant_id', filter.tenantId);
    add('status', filter.status);
    add('account_id', filter.accountId);
    add('tender_id', filter.tenderId);
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const countRes = await this.pool.query<{ count: string }>(
      `SELECT COUNT(*)::int AS count FROM public.aura_contracts_contracts ${whereSql}`, params);
    const total = Number(countRes.rows[0]?.count ?? 0);
    const winParams = [...params, page.limit, page.offset];
    const res = await this.pool.query<Row>(
      `SELECT ${COLS} FROM public.aura_contracts_contracts ${whereSql} ORDER BY created_at DESC LIMIT $${winParams.length - 1} OFFSET $${winParams.length}`,
      winParams,
    );
    return makePage(res.rows.map(rowToContract), total, page);
  }
}

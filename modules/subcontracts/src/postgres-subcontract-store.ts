import type { Pool } from 'pg';
import type { Id, Page, PageParams } from '@aura/shared';
import { makePage } from '@aura/shared';
import type { Subcontract } from './domain/subcontract';
import type { Claim } from './domain/claim';
import type { SubcontractVariation } from './domain/variation';
import type { BackCharge, BackChargeCategory, BackChargeStatus } from './domain/back-charge';
import type { SubcontractFilter, ClaimFilter, VariationFilter, BackChargeFilter, SubcontractStore } from './subcontract-store';

interface SubcontractRow {
  id: string;
  tenant_id: string;
  project_id: string;
  project_name: string | null;
  title: string;
  subcontractor_name: string;
  status: string;
  value: string | number;
  retention_percentage: string | number;
  created_at: Date | string;
}

interface ClaimRow {
  id: string;
  tenant_id: string;
  subcontract_id: string;
  claim_number: number;
  status: string;
  work_completed_value: string | number;
  previously_certified_value: string | number;
  this_period_gross_value: string | number;
  retention_withheld: string | number;
  net_certified_value: string | number;
  is_retention_release: boolean;
  retention_released: string | number;
  certified_at: Date | string | null;
  certified_by: string | null;
  created_at: Date | string;
}

interface BackChargeRow {
  id: string;
  tenant_id: string;
  subcontract_id: string;
  subcontractor_name: string | null;
  reference: string;
  category: string;
  description: string;
  gross_amount: string | number;
  markup_percent: string | number;
  markup_amount: string | number;
  recoverable_amount: string | number;
  recovered_amount: string | number;
  outstanding_amount: string | number;
  status: string;
  raised_at: Date | string;
  agreed_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

const SUB_COLS = 'id, tenant_id, project_id, project_name, title, subcontractor_name, status, value, retention_percentage, created_at';
const CLAIM_COLS = 'id, tenant_id, subcontract_id, claim_number, status, work_completed_value, previously_certified_value, this_period_gross_value, retention_withheld, net_certified_value, is_retention_release, retention_released, certified_at, certified_by, created_at';
const BC_COLS = 'id, tenant_id, subcontract_id, subcontractor_name, reference, category, description, gross_amount, markup_percent, markup_amount, recoverable_amount, recovered_amount, outstanding_amount, status, raised_at, agreed_at, created_at, updated_at';
const VAR_COLS = 'id, tenant_id, subcontract_id, reference, type, amount, description, status, approved_by, created_at';

interface VariationRow {
  id: string;
  tenant_id: string;
  subcontract_id: string;
  reference: string;
  type: string;
  amount: string | number;
  description: string;
  status: string;
  approved_by: string | null;
  created_at: Date | string;
}

function rowToVariation(r: VariationRow): SubcontractVariation {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    subcontractId: r.subcontract_id,
    reference: r.reference,
    type: r.type as SubcontractVariation['type'],
    amount: Number(r.amount),
    description: r.description || '',
    status: r.status as SubcontractVariation['status'],
    approvedBy: r.approved_by,
    createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
  };
}

function rowToSubcontract(r: SubcontractRow): Subcontract {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    projectId: r.project_id,
    projectName: r.project_name,
    title: r.title,
    subcontractorName: r.subcontractor_name,
    status: r.status as Subcontract['status'],
    value: Number(r.value),
    retentionPercentage: Number(r.retention_percentage),
    createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
  };
}

function rowToClaim(r: ClaimRow): Claim {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    subcontractId: r.subcontract_id,
    claimNumber: r.claim_number,
    status: r.status as Claim['status'],
    workCompletedValue: Number(r.work_completed_value),
    previouslyCertifiedValue: Number(r.previously_certified_value),
    thisPeriodGrossValue: Number(r.this_period_gross_value),
    retentionWithheld: Number(r.retention_withheld),
    netCertifiedValue: Number(r.net_certified_value),
    isRetentionRelease: !!r.is_retention_release,
    retentionReleased: Number(r.retention_released),
    certifiedAt: r.certified_at instanceof Date ? r.certified_at.toISOString() : r.certified_at ? String(r.certified_at) : null,
    certifiedBy: r.certified_by,
    createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
  };
}

function toIso(v: Date | string): string {
  return v instanceof Date ? v.toISOString() : String(v);
}

function rowToBackCharge(r: BackChargeRow): BackCharge {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    subcontractId: r.subcontract_id,
    subcontractorName: r.subcontractor_name,
    reference: r.reference,
    category: r.category as BackChargeCategory,
    description: r.description,
    grossAmount: Number(r.gross_amount),
    markupPercent: Number(r.markup_percent),
    markupAmount: Number(r.markup_amount),
    recoverableAmount: Number(r.recoverable_amount),
    recoveredAmount: Number(r.recovered_amount),
    outstandingAmount: Number(r.outstanding_amount),
    status: r.status as BackChargeStatus,
    raisedAt: toIso(r.raised_at),
    agreedAt: r.agreed_at ? toIso(r.agreed_at) : null,
    createdAt: toIso(r.created_at),
    updatedAt: toIso(r.updated_at),
  };
}

export class PostgresSubcontractStore implements SubcontractStore {
  constructor(private readonly pool: Pool) {}

  async createSubcontract(s: Subcontract): Promise<void> {
    await this.pool.query(
      `INSERT INTO public.aura_subcontracts (${SUB_COLS}) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [
        s.id,
        s.tenantId,
        s.projectId,
        s.projectName,
        s.title,
        s.subcontractorName,
        s.status,
        s.value,
        s.retentionPercentage,
        s.createdAt,
      ],
    );
  }

  async updateSubcontract(s: Subcontract): Promise<void> {
    await this.pool.query(
      `UPDATE public.aura_subcontracts SET title=$2, subcontractor_name=$3, status=$4, value=$5, retention_percentage=$6 WHERE id=$1`,
      [s.id, s.title, s.subcontractorName, s.status, s.value, s.retentionPercentage],
    );
  }

  async getSubcontract(id: Id): Promise<Subcontract | null> {
    const res = await this.pool.query<SubcontractRow>(
      `SELECT ${SUB_COLS} FROM public.aura_subcontracts WHERE id = $1`,
      [id],
    );
    return res.rows.length ? rowToSubcontract(res.rows[0]) : null;
  }

  async listSubcontracts(filter: SubcontractFilter = {}): Promise<Subcontract[]> {
    const where: string[] = [];
    const params: unknown[] = [];
    const add = (col: string, val?: string): void => {
      if (val) {
        params.push(val);
        where.push(`${col} = $${params.length}`);
      }
    };
    add('tenant_id', filter.tenantId);
    add('project_id', filter.projectId);
    add('status', filter.status);

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const res = await this.pool.query<SubcontractRow>(
      `SELECT ${SUB_COLS} FROM public.aura_subcontracts ${whereSql} ORDER BY created_at DESC`,
      params,
    );
    return res.rows.map(rowToSubcontract);
  }

  async listSubcontractsPaged(filter: SubcontractFilter, page: PageParams): Promise<Page<Subcontract>> {
    const where: string[] = [];
    const params: unknown[] = [];
    const add = (col: string, val?: string): void => {
      if (val) { params.push(val); where.push(`${col} = $${params.length}`); }
    };
    add('tenant_id', filter.tenantId);
    add('project_id', filter.projectId);
    add('status', filter.status);
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const countRes = await this.pool.query<{ count: string }>(
      `SELECT COUNT(*)::int AS count FROM public.aura_subcontracts ${whereSql}`, params);
    const total = Number(countRes.rows[0]?.count ?? 0);
    const winParams = [...params, page.limit, page.offset];
    const res = await this.pool.query<SubcontractRow>(
      `SELECT ${SUB_COLS} FROM public.aura_subcontracts ${whereSql} ORDER BY created_at DESC LIMIT $${winParams.length - 1} OFFSET $${winParams.length}`,
      winParams,
    );
    return makePage(res.rows.map(rowToSubcontract), total, page);
  }

  async createClaim(c: Claim): Promise<void> {
    await this.pool.query(
      `INSERT INTO public.aura_subcontracts_claims (${CLAIM_COLS}) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
      [
        c.id,
        c.tenantId,
        c.subcontractId,
        c.claimNumber,
        c.status,
        c.workCompletedValue,
        c.previouslyCertifiedValue,
        c.thisPeriodGrossValue,
        c.retentionWithheld,
        c.netCertifiedValue,
        c.isRetentionRelease,
        c.retentionReleased,
        c.certifiedAt,
        c.certifiedBy,
        c.createdAt,
      ],
    );
  }

  async updateClaim(c: Claim): Promise<void> {
    await this.pool.query(
      `UPDATE public.aura_subcontracts_claims SET status=$2, work_completed_value=$3, previously_certified_value=$4, this_period_gross_value=$5, retention_withheld=$6, net_certified_value=$7, is_retention_release=$8, retention_released=$9, certified_at=$10, certified_by=$11 WHERE id=$1`,
      [
        c.id,
        c.status,
        c.workCompletedValue,
        c.previouslyCertifiedValue,
        c.thisPeriodGrossValue,
        c.retentionWithheld,
        c.netCertifiedValue,
        c.isRetentionRelease,
        c.retentionReleased,
        c.certifiedAt,
        c.certifiedBy,
      ],
    );
  }

  async getClaim(id: Id): Promise<Claim | null> {
    const res = await this.pool.query<ClaimRow>(
      `SELECT ${CLAIM_COLS} FROM public.aura_subcontracts_claims WHERE id = $1`,
      [id],
    );
    return res.rows.length ? rowToClaim(res.rows[0]) : null;
  }

  async listClaims(filter: ClaimFilter = {}): Promise<Claim[]> {
    const where: string[] = [];
    const params: unknown[] = [];
    const add = (col: string, val?: string): void => {
      if (val) {
        params.push(val);
        where.push(`${col} = $${params.length}`);
      }
    };
    add('tenant_id', filter.tenantId);
    add('subcontract_id', filter.subcontractId);
    add('status', filter.status);

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const res = await this.pool.query<ClaimRow>(
      `SELECT ${CLAIM_COLS} FROM public.aura_subcontracts_claims ${whereSql} ORDER BY claim_number ASC`,
      params,
    );
    return res.rows.map(rowToClaim);
  }

  async createVariation(v: SubcontractVariation): Promise<void> {
    await this.pool.query(
      `INSERT INTO public.aura_subcontracts_variations (${VAR_COLS}) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [v.id, v.tenantId, v.subcontractId, v.reference, v.type, v.amount, v.description, v.status, v.approvedBy, v.createdAt],
    );
  }

  async updateVariation(v: SubcontractVariation): Promise<void> {
    await this.pool.query(
      `UPDATE public.aura_subcontracts_variations SET status=$2, approved_by=$3 WHERE id=$1`,
      [v.id, v.status, v.approvedBy],
    );
  }

  async getVariation(id: Id): Promise<SubcontractVariation | null> {
    const res = await this.pool.query<VariationRow>(`SELECT ${VAR_COLS} FROM public.aura_subcontracts_variations WHERE id = $1`, [id]);
    return res.rows.length ? rowToVariation(res.rows[0]) : null;
  }

  async listVariations(filter: VariationFilter = {}): Promise<SubcontractVariation[]> {
    const where: string[] = [];
    const params: unknown[] = [];
    const add = (col: string, val?: string): void => {
      if (val) {
        params.push(val);
        where.push(`${col} = $${params.length}`);
      }
    };
    add('tenant_id', filter.tenantId);
    add('subcontract_id', filter.subcontractId);
    add('status', filter.status);

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const res = await this.pool.query<VariationRow>(
      `SELECT ${VAR_COLS} FROM public.aura_subcontracts_variations ${whereSql} ORDER BY created_at DESC`,
      params,
    );
    return res.rows.map(rowToVariation);
  }

  async createBackCharge(b: BackCharge): Promise<void> {
    await this.pool.query(
      `INSERT INTO public.aura_subcontracts_back_charges (${BC_COLS}) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)`,
      [
        b.id,
        b.tenantId,
        b.subcontractId,
        b.subcontractorName,
        b.reference,
        b.category,
        b.description,
        b.grossAmount,
        b.markupPercent,
        b.markupAmount,
        b.recoverableAmount,
        b.recoveredAmount,
        b.outstandingAmount,
        b.status,
        b.raisedAt,
        b.agreedAt,
        b.createdAt,
        b.updatedAt,
      ],
    );
  }

  async updateBackCharge(b: BackCharge): Promise<void> {
    await this.pool.query(
      `UPDATE public.aura_subcontracts_back_charges SET status=$2, recovered_amount=$3, outstanding_amount=$4, agreed_at=$5, updated_at=$6 WHERE id=$1`,
      [b.id, b.status, b.recoveredAmount, b.outstandingAmount, b.agreedAt, b.updatedAt],
    );
  }

  async getBackCharge(id: Id): Promise<BackCharge | null> {
    const res = await this.pool.query<BackChargeRow>(
      `SELECT ${BC_COLS} FROM public.aura_subcontracts_back_charges WHERE id = $1`,
      [id],
    );
    return res.rows.length ? rowToBackCharge(res.rows[0]) : null;
  }

  async listBackCharges(filter: BackChargeFilter = {}): Promise<BackCharge[]> {
    const where: string[] = [];
    const params: unknown[] = [];
    const add = (col: string, val?: string): void => {
      if (val) {
        params.push(val);
        where.push(`${col} = $${params.length}`);
      }
    };
    add('tenant_id', filter.tenantId);
    add('subcontract_id', filter.subcontractId);
    add('status', filter.status);

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const res = await this.pool.query<BackChargeRow>(
      `SELECT ${BC_COLS} FROM public.aura_subcontracts_back_charges ${whereSql} ORDER BY created_at DESC`,
      params,
    );
    return res.rows.map(rowToBackCharge);
  }
}

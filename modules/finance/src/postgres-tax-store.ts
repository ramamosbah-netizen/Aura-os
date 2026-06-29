import type { Pool } from 'pg';
import type { Id } from '@aura/shared';
import type { TaxCode, TaxLine, TaxType, TaxReturn, TaxReturnStatus } from './domain/tax';
import type { TaxCodeFilter, TaxCodeStore, TaxLineFilter, TaxLineStore, TaxReturnStore } from './tax-store';

// ── Tax Code PG Store ──────────────────────────────────────────────────────

interface TaxCodeRow {
  id: string; tenant_id: string; code: string; description: string;
  rate: string | number; tax_type: string; is_active: boolean;
  effective_from: string; effective_to: string | null;
  created_at: Date | string;
}

function rowToTaxCode(r: TaxCodeRow): TaxCode {
  return {
    id: r.id, tenantId: r.tenant_id, code: r.code, description: r.description,
    rate: Number(r.rate), taxType: r.tax_type as TaxType, isActive: r.is_active,
    effectiveFrom: typeof r.effective_from === 'string' ? r.effective_from : String(r.effective_from),
    effectiveTo: r.effective_to,
    createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
  };
}

export class PostgresTaxCodeStore implements TaxCodeStore {
  constructor(private readonly pool: Pool) {}

  async create(c: TaxCode): Promise<void> {
    await this.pool.query(
      `INSERT INTO public.aura_finance_tax_codes
        (id, tenant_id, code, description, rate, tax_type, is_active, effective_from, effective_to, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [c.id, c.tenantId, c.code, c.description, c.rate, c.taxType,
       c.isActive, c.effectiveFrom, c.effectiveTo, c.createdAt],
    );
  }

  async update(c: TaxCode): Promise<void> {
    await this.pool.query(
      `UPDATE public.aura_finance_tax_codes
       SET description=$2, rate=$3, tax_type=$4, is_active=$5, effective_from=$6, effective_to=$7
       WHERE id=$1`,
      [c.id, c.description, c.rate, c.taxType, c.isActive, c.effectiveFrom, c.effectiveTo],
    );
  }

  async get(id: Id): Promise<TaxCode | null> {
    const r = await this.pool.query<TaxCodeRow>(
      'SELECT * FROM public.aura_finance_tax_codes WHERE id = $1', [id],
    );
    return r.rows.length ? rowToTaxCode(r.rows[0]) : null;
  }

  async getByCode(tenantId: Id, code: string): Promise<TaxCode | null> {
    const r = await this.pool.query<TaxCodeRow>(
      'SELECT * FROM public.aura_finance_tax_codes WHERE tenant_id = $1 AND code = $2', [tenantId, code],
    );
    return r.rows.length ? rowToTaxCode(r.rows[0]) : null;
  }

  async list(filter: TaxCodeFilter = {}): Promise<TaxCode[]> {
    const where: string[] = []; const params: unknown[] = [];
    if (filter.tenantId) { params.push(filter.tenantId); where.push(`tenant_id = $${params.length}`); }
    if (filter.isActive !== undefined) { params.push(filter.isActive); where.push(`is_active = $${params.length}`); }
    if (filter.taxType) { params.push(filter.taxType); where.push(`tax_type = $${params.length}`); }
    const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const r = await this.pool.query<TaxCodeRow>(
      `SELECT * FROM public.aura_finance_tax_codes ${w} ORDER BY code ASC`, params,
    );
    return r.rows.map(rowToTaxCode);
  }
}

// ── Tax Line PG Store ──────────────────────────────────────────────────────

interface TaxLineRow {
  id: string; tenant_id: string; invoice_id: string; tax_code_id: string;
  taxable_amount: string | number; tax_rate: string | number;
  tax_amount: string | number; is_inclusive: boolean;
  created_at: Date | string;
}

function rowToTaxLine(r: TaxLineRow): TaxLine {
  return {
    id: r.id, tenantId: r.tenant_id, invoiceId: r.invoice_id,
    taxCodeId: r.tax_code_id, taxableAmount: Number(r.taxable_amount),
    taxRate: Number(r.tax_rate), taxAmount: Number(r.tax_amount),
    isInclusive: r.is_inclusive,
    createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
  };
}

export class PostgresTaxLineStore implements TaxLineStore {
  constructor(private readonly pool: Pool) {}

  async create(l: TaxLine): Promise<void> {
    await this.pool.query(
      `INSERT INTO public.aura_finance_tax_lines
        (id, tenant_id, invoice_id, tax_code_id, taxable_amount, tax_rate, tax_amount, is_inclusive, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [l.id, l.tenantId, l.invoiceId, l.taxCodeId, l.taxableAmount,
       l.taxRate, l.taxAmount, l.isInclusive, l.createdAt],
    );
  }

  async list(filter: TaxLineFilter = {}): Promise<TaxLine[]> {
    const where: string[] = []; const params: unknown[] = [];
    if (filter.invoiceId) { params.push(filter.invoiceId); where.push(`invoice_id = $${params.length}`); }
    if (filter.taxCodeId) { params.push(filter.taxCodeId); where.push(`tax_code_id = $${params.length}`); }
    if (filter.tenantId) { params.push(filter.tenantId); where.push(`tenant_id = $${params.length}`); }
    const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const r = await this.pool.query<TaxLineRow>(
      `SELECT * FROM public.aura_finance_tax_lines ${w} ORDER BY created_at ASC`, params,
    );
    return r.rows.map(rowToTaxLine);
  }

  async deleteByInvoice(invoiceId: Id): Promise<void> {
    await this.pool.query('DELETE FROM public.aura_finance_tax_lines WHERE invoice_id = $1', [invoiceId]);
  }
}

// ── Tax Return PG Store ────────────────────────────────────────────────────
interface TaxReturnRow {
  id: string;
  tenant_id: string;
  period_start: string;
  period_end: string;
  total_output_tax: string | number;
  total_input_tax: string | number;
  net_tax_payable: string | number;
  status: string;
  filed_at: Date | string | null;
  filed_by: string | null;
  created_at: Date | string;
}

const isoOrNull = (v: Date | string | null): string | null => (v == null ? null : v instanceof Date ? v.toISOString() : String(v));
// period_start/end are `date` columns — pg returns a Date; format as YYYY-MM-DD.
const dateStr = (v: Date | string): string => (v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10));

function rowToTaxReturn(r: TaxReturnRow): TaxReturn {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    periodStart: dateStr(r.period_start),
    periodEnd: dateStr(r.period_end),
    totalOutputTax: Number(r.total_output_tax),
    totalInputTax: Number(r.total_input_tax),
    netTaxPayable: Number(r.net_tax_payable),
    status: r.status as TaxReturnStatus,
    filedAt: isoOrNull(r.filed_at),
    filedBy: r.filed_by,
    createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
  };
}

export class PostgresTaxReturnStore implements TaxReturnStore {
  constructor(private readonly pool: Pool) {}

  async create(t: TaxReturn): Promise<void> {
    // net_tax_payable is a GENERATED column (0048) — do not insert it.
    await this.pool.query(
      `INSERT INTO public.aura_finance_tax_returns
         (id, tenant_id, period_start, period_end, total_output_tax, total_input_tax, status, filed_at, filed_by, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [t.id, t.tenantId, t.periodStart, t.periodEnd, t.totalOutputTax, t.totalInputTax, t.status, t.filedAt, t.filedBy, t.createdAt],
    );
  }

  async update(t: TaxReturn): Promise<void> {
    await this.pool.query(
      `UPDATE public.aura_finance_tax_returns SET status=$2, filed_at=$3, filed_by=$4 WHERE id=$1`,
      [t.id, t.status, t.filedAt, t.filedBy],
    );
  }

  async get(id: Id): Promise<TaxReturn | null> {
    const r = await this.pool.query<TaxReturnRow>('SELECT * FROM public.aura_finance_tax_returns WHERE id = $1', [id]);
    return r.rows.length ? rowToTaxReturn(r.rows[0]) : null;
  }

  async list(tenantId: Id): Promise<TaxReturn[]> {
    const r = await this.pool.query<TaxReturnRow>(
      'SELECT * FROM public.aura_finance_tax_returns WHERE tenant_id = $1 ORDER BY period_start DESC',
      [tenantId],
    );
    return r.rows.map(rowToTaxReturn);
  }
}

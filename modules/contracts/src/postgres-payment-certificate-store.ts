import type { Pool, PoolClient } from 'pg';
import type { Id } from '@aura/shared';
import type { TxHandle } from '@aura/core';
import type { PaymentCertificate } from './domain/payment-certificate';
import type { CertificateFilter, PaymentCertificateStore } from './payment-certificate-store';

interface Row {
  id: string;
  tenant_id: string;
  company_id: string | null;
  contract_id: string;
  contract_title: string | null;
  contract_value: string | number;
  account_id: string | null;
  account_name: string | null;
  sequence: string | number;
  reference: string | null;
  period_start: string | null;
  period_end: string | null;
  cumulative_work_done: string | number;
  materials_on_site: string | number;
  retention_percent: string | number;
  retention_cap_percent: string | number;
  advance_recovered_to_date: string | number;
  previous_certified_net: string | number;
  gross_to_date: string | number;
  retention_to_date: string | number;
  net_certified_to_date: string | number;
  net_this_certificate: string | number;
  status: string;
  created_by: string | null;
  certified_by: string | null;
  certified_at: Date | string | null;
  created_at: Date | string;
}

// period_start/period_end are DATE columns — select them as ::text so PG returns the calendar
// string directly (avoids the toISOString() UTC day-shift drift seen elsewhere).
const COLS =
  'id, tenant_id, company_id, contract_id, contract_title, contract_value, account_id, account_name, sequence, reference, period_start::text, period_end::text, cumulative_work_done, materials_on_site, retention_percent, retention_cap_percent, advance_recovered_to_date, previous_certified_net, gross_to_date, retention_to_date, net_certified_to_date, net_this_certificate, status, created_by, certified_by, certified_at, created_at';

const iso = (v: Date | string): string => (v instanceof Date ? v.toISOString() : String(v));
const isoOrNull = (v: Date | string | null): string | null => (v == null ? null : iso(v));

function rowToCert(r: Row): PaymentCertificate {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    companyId: r.company_id,
    contractId: r.contract_id,
    contractTitle: r.contract_title,
    contractValue: Number(r.contract_value),
    accountId: r.account_id,
    accountName: r.account_name,
    sequence: Number(r.sequence),
    reference: r.reference,
    periodStart: r.period_start,
    periodEnd: r.period_end,
    cumulativeWorkDone: Number(r.cumulative_work_done),
    materialsOnSite: Number(r.materials_on_site),
    retentionPercent: Number(r.retention_percent),
    retentionCapPercent: Number(r.retention_cap_percent),
    advanceRecoveredToDate: Number(r.advance_recovered_to_date),
    previousCertifiedNet: Number(r.previous_certified_net),
    grossToDate: Number(r.gross_to_date),
    retentionToDate: Number(r.retention_to_date),
    netCertifiedToDate: Number(r.net_certified_to_date),
    netThisCertificate: Number(r.net_this_certificate),
    status: r.status as PaymentCertificate['status'],
    createdBy: r.created_by,
    certifiedBy: r.certified_by,
    certifiedAt: isoOrNull(r.certified_at),
    createdAt: iso(r.created_at),
  };
}

const INSERT_COLS =
  'id, tenant_id, company_id, contract_id, contract_title, contract_value, account_id, account_name, sequence, reference, period_start, period_end, cumulative_work_done, materials_on_site, retention_percent, retention_cap_percent, advance_recovered_to_date, previous_certified_net, gross_to_date, retention_to_date, net_certified_to_date, net_this_certificate, status, created_by, certified_by, certified_at, created_at';

/** Durable payment certificates (IPCs) on Postgres (`aura_contracts_payment_certificates`). */
export class PostgresPaymentCertificateStore implements PaymentCertificateStore {
  constructor(private readonly pool: Pool) {}

  async create(c: PaymentCertificate): Promise<void> {
    await this.insert(this.pool, c);
  }

  async createWithClient(tx: TxHandle | null, c: PaymentCertificate): Promise<void> {
    if (tx === null) return this.create(c);
    await this.insert(tx as PoolClient, c);
  }

  private insert(executor: Pool | PoolClient, c: PaymentCertificate): Promise<unknown> {
    return executor.query(
      `INSERT INTO public.aura_contracts_payment_certificates (${INSERT_COLS})
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27)`,
      [
        c.id, c.tenantId, c.companyId, c.contractId, c.contractTitle, c.contractValue, c.accountId, c.accountName,
        c.sequence, c.reference, c.periodStart, c.periodEnd, c.cumulativeWorkDone, c.materialsOnSite, c.retentionPercent,
        c.retentionCapPercent, c.advanceRecoveredToDate, c.previousCertifiedNet, c.grossToDate, c.retentionToDate,
        c.netCertifiedToDate, c.netThisCertificate, c.status, c.createdBy, c.certifiedBy, c.certifiedAt, c.createdAt,
      ],
    );
  }

  async update(c: PaymentCertificate): Promise<void> {
    await this.upd(this.pool, c);
  }

  async updateWithClient(tx: TxHandle | null, c: PaymentCertificate): Promise<void> {
    if (tx === null) return this.update(c);
    await this.upd(tx as PoolClient, c);
  }

  private upd(executor: Pool | PoolClient, c: PaymentCertificate): Promise<unknown> {
    return executor.query(
      `UPDATE public.aura_contracts_payment_certificates
       SET status=$2, certified_by=$3, certified_at=$4 WHERE id=$1`,
      [c.id, c.status, c.certifiedBy, c.certifiedAt],
    );
  }

  async get(id: Id): Promise<PaymentCertificate | null> {
    const res = await this.pool.query<Row>(
      `SELECT ${COLS} FROM public.aura_contracts_payment_certificates WHERE id = $1`,
      [id],
    );
    return res.rows.length ? rowToCert(res.rows[0]) : null;
  }

  async list(filter: CertificateFilter = {}): Promise<PaymentCertificate[]> {
    const where: string[] = [];
    const params: unknown[] = [];
    const add = (col: string, val?: string): void => {
      if (val) {
        params.push(val);
        where.push(`${col} = $${params.length}`);
      }
    };
    add('tenant_id', filter.tenantId);
    add('contract_id', filter.contractId);
    add('status', filter.status);
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    params.push(filter.limit ?? 200);
    const res = await this.pool.query<Row>(
      `SELECT ${COLS} FROM public.aura_contracts_payment_certificates ${whereSql} ORDER BY sequence DESC LIMIT $${params.length}`,
      params,
    );
    return res.rows.map(rowToCert);
  }
}

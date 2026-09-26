import type { Pool, PoolClient } from 'pg';
import type { TxHandle } from '@aura/core';
import type { ComplianceMatrixIssue, ComplianceMatrixRow, ComplianceMatrixSummary } from './domain/compliance-matrix';
import type { ComplianceMatrixStore } from './compliance-matrix-store';

interface Row {
  id: string;
  tenant_id: string;
  company_id: string | null;
  tender_id: string;
  matrix_number: string;
  revision: number;
  issued_by: string;
  issued_at: Date | string;
  reason: string | null;
  rows: ComplianceMatrixRow[];
  summary: ComplianceMatrixSummary;
  document_id: string;
  checksum: string;
  superseded_by: string | null;
  superseded_at: Date | string | null;
}

const COLS = 'id, tenant_id, company_id, tender_id, matrix_number, revision, issued_by, issued_at, reason, rows, summary, document_id, checksum, superseded_by, superseded_at';
const iso = (v: Date | string): string => (v instanceof Date ? v.toISOString() : new Date(v).toISOString());

function rowTo(r: Row): ComplianceMatrixIssue {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    companyId: r.company_id,
    tenderId: r.tender_id,
    matrixNumber: r.matrix_number,
    revision: Number(r.revision),
    issuedBy: r.issued_by,
    issuedAt: iso(r.issued_at),
    reason: r.reason,
    rows: r.rows,
    summary: r.summary,
    documentId: r.document_id,
    checksum: r.checksum,
    supersededBy: r.superseded_by,
    supersededAt: r.superseded_at ? iso(r.superseded_at) : null,
  };
}

/** Append-only: a plain INSERT (never an upsert) and the one supersede UPDATE. */
export class PostgresComplianceMatrixStore implements ComplianceMatrixStore {
  constructor(private readonly pool: Pool) {}

  async issue(tx: TxHandle | null, issue: ComplianceMatrixIssue, supersedes: ComplianceMatrixIssue | null): Promise<void> {
    const write = async (client: PoolClient | Pool) => {
      await client.query(
        `INSERT INTO public.aura_tender_compliance_matrices (${COLS})
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,NULL,NULL)`,
        [issue.id, issue.tenantId, issue.companyId, issue.tenderId, issue.matrixNumber, issue.revision, issue.issuedBy,
          issue.issuedAt, issue.reason, JSON.stringify(issue.rows), JSON.stringify(issue.summary), issue.documentId, issue.checksum],
      );
      if (supersedes) {
        const res = await client.query(
          `UPDATE public.aura_tender_compliance_matrices SET superseded_by = $1, superseded_at = $2
            WHERE tenant_id = $3 AND id = $4 AND superseded_by IS NULL`,
          [issue.id, issue.issuedAt, issue.tenantId, supersedes.id],
        );
        if (res.rowCount !== 1) throw new Error(`${supersedes.matrixNumber} Rev ${supersedes.revision} is already superseded`);
      }
    };
    if (tx) return write(tx as PoolClient);
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await write(client);
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  async listByTender(tenantId: string, tenderId: string): Promise<ComplianceMatrixIssue[]> {
    const res = await this.pool.query<Row>(
      `SELECT ${COLS} FROM public.aura_tender_compliance_matrices WHERE tenant_id = $1 AND tender_id = $2 ORDER BY revision DESC`,
      [tenantId, tenderId],
    );
    return res.rows.map(rowTo);
  }

  async get(tenantId: string, id: string): Promise<ComplianceMatrixIssue | null> {
    const res = await this.pool.query<Row>(`SELECT ${COLS} FROM public.aura_tender_compliance_matrices WHERE tenant_id = $1 AND id = $2`, [tenantId, id]);
    return res.rows.length ? rowTo(res.rows[0]) : null;
  }
}

import { newId } from '@aura/shared';

/**
 * THE TECHNICAL COMPLIANCE MATRIX — EST-12, the owner's decision of 2026-09-25 ("select (b)"):
 *
 *   "Build a separate server-generated, controlled Technical Compliance Matrix under Technical
 *    Manager authority. Include supplier, relevant quotation revision and line, BOQ/PR-line lineage,
 *    technical verdict, rationale, deviations, evaluator and date. Keep commercial prices out of this
 *    technical document. File it in the internal tender dossier; do not automatically include it in
 *    the client submission pack."
 *
 * An ISSUE is a frozen, numbered revision of the matrix: the rows are copied from the verdicts at the
 * moment the Technical Manager issues it, so a verdict amended afterwards changes the NEXT revision and
 * never this one. Revisions are append-only — a re-issue says why, and the one before it is superseded,
 * not rewritten.
 */

export type ComplianceVerdict = 'compliant' | 'compliant_with_deviation' | 'non_compliant';

export interface ComplianceMatrixRow {
  /** BOQ lineage — the tender item this requirement prices. */
  boqItemId: string | null;
  boqItemCode: string | null;
  boqDescription: string | null;
  /** Requisition lineage — the requirement the supplier was asked to answer. */
  prId: string;
  prLineId: string;
  prLineNo: number;
  materialCode: string;
  materialName: string;
  requested: { quantity: number; uom: string; specification: string | null; manufacturer: string | null; model: string | null };
  /** The supplier, their quotation revision and the line in it. */
  supplierName: string;
  supplierQuotationRef: string | null;
  offerLabel: string | null;
  revisionId: string;
  revisionNo: number;
  supplierRevisionRef: string | null;
  quotationLineId: string;
  response: 'quoted' | 'no_bid';
  offered: { description: string | null; manufacturer: string | null; model: string | null; partNumber: string | null; quantity: number | null; uom: string | null };
  complianceClaim: string | null;
  deviations: string | null;
  exclusions: string | null;
  /** The Technical Manager's verdict (SUP-13, ADR-0022) with its rationale, evaluator and date. */
  verdict: ComplianceVerdict | null;
  rationale: string | null;
  evaluatedBy: string | null;
  evaluatedAt: string | null;
  amendmentReason: string | null;
}

export interface ComplianceMatrixSummary {
  requirements: number;
  offers: number;
  compliant: number;
  compliantWithDeviation: number;
  nonCompliant: number;
  noBid: number;
}

export interface ComplianceMatrixIssue {
  id: string;
  tenantId: string;
  companyId: string | null;
  tenderId: string;
  matrixNumber: string;
  revision: number;
  issuedBy: string;
  issuedAt: string;
  /** Why this revision replaced the last. Null only for Rev 0. */
  reason: string | null;
  rows: ComplianceMatrixRow[];
  summary: ComplianceMatrixSummary;
  /** The controlled document filed in the tender's internal dossier, and its content hash. */
  documentId: string;
  checksum: string;
  supersededBy: string | null;
  supersededAt: string | null;
}

/**
 * Keys that would make this a commercial document. Checked recursively on every issue, so a row
 * shape that grows a price field later is refused here rather than printed.
 */
export const COMMERCIAL_KEYS = [
  'unitPrice', 'price', 'amount', 'lineTotal', 'total', 'subtotal', 'discount', 'lineDiscount',
  'currency', 'vat', 'vatRate', 'cost', 'directCost', 'sellingRate', 'freightAmount', 'taxRatePct',
] as const;

export function assertNoCommercialFigures(value: unknown, path = 'rows'): void {
  if (Array.isArray(value)) {
    value.forEach((v, i) => assertNoCommercialFigures(v, `${path}[${i}]`));
    return;
  }
  if (value && typeof value === 'object') {
    for (const [key, v] of Object.entries(value)) {
      if ((COMMERCIAL_KEYS as readonly string[]).includes(key)) {
        throw new Error(`validation: a technical compliance matrix must carry no commercial figures — ${path}.${key} is a price field`);
      }
      assertNoCommercialFigures(v, `${path}.${key}`);
    }
  }
}

export function summariseMatrix(rows: readonly ComplianceMatrixRow[]): ComplianceMatrixSummary {
  return {
    requirements: new Set(rows.map((r) => r.prLineId)).size,
    offers: rows.length,
    compliant: rows.filter((r) => r.verdict === 'compliant').length,
    compliantWithDeviation: rows.filter((r) => r.verdict === 'compliant_with_deviation').length,
    nonCompliant: rows.filter((r) => r.verdict === 'non_compliant').length,
    noBid: rows.filter((r) => r.response === 'no_bid').length,
  };
}

/** The matrix's controlled number: one per tender, the revision carried beside it. */
export function complianceMatrixNumber(tender: { id: string; reference: string | null }): string {
  const ref = tender.reference?.trim();
  return `TCM-${ref && ref.length > 0 ? ref : tender.id.slice(0, 8).toUpperCase()}`;
}

/**
 * The rows that still need the Technical Manager: a QUOTED line with no verdict. A no-bid has nothing
 * to judge (SUP-13 refuses to evaluate a decline), so it is listed and never waited on.
 */
export function awaitingVerdict(rows: readonly ComplianceMatrixRow[]): ComplianceMatrixRow[] {
  return rows.filter((r) => r.response === 'quoted' && !r.verdict);
}

export function makeComplianceMatrixIssue(input: {
  tenantId: string;
  companyId?: string | null;
  tender: { id: string; reference: string | null };
  previous: ComplianceMatrixIssue | null;
  rows: ComplianceMatrixRow[];
  issuedBy: string | null;
  reason?: string | null;
  documentId: string;
  checksum: string;
  issuedAt?: string;
  id?: string;
}): ComplianceMatrixIssue {
  const issuedBy = input.issuedBy?.trim();
  if (!issuedBy) throw new Error('validation: issuing the matrix requires an authenticated Technical Manager');
  if (input.rows.length === 0) {
    throw new Error(
      "validation: a technical compliance matrix requires at least one supplier offer on the tender's pricing requisition — " +
        "raise the requisition and record the suppliers' quotations first",
    );
  }
  const waiting = awaitingVerdict(input.rows);
  if (waiting.length > 0) {
    const named = waiting.map((r) => `${r.supplierName} — ${r.materialCode} (line ${r.prLineNo})`).join('; ');
    throw new Error(`validation: every quoted supplier line requires the Technical Manager's verdict before the matrix is issued — awaiting: ${named}`);
  }
  if (input.previous?.supersededBy) {
    throw new Error(`${input.previous.matrixNumber} Rev ${input.previous.revision} is already superseded — only the current revision can be re-issued`);
  }
  const reason = input.reason?.trim() || null;
  if (input.previous && !reason) {
    throw new Error(
      `validation: re-issuing the matrix requires a reason — ${input.previous.matrixNumber} Rev ${input.previous.revision} stays on record, and the next revision must say why it changed`,
    );
  }
  assertNoCommercialFigures(input.rows);
  return {
    id: input.id ?? newId(),
    tenantId: input.tenantId,
    companyId: input.companyId ?? null,
    tenderId: input.tender.id,
    matrixNumber: input.previous?.matrixNumber ?? complianceMatrixNumber(input.tender),
    revision: input.previous ? input.previous.revision + 1 : 0,
    issuedBy,
    issuedAt: input.issuedAt ?? new Date().toISOString(),
    reason: input.previous ? reason : null,
    rows: input.rows,
    summary: summariseMatrix(input.rows),
    documentId: input.documentId,
    checksum: input.checksum,
    supersededBy: null,
    supersededAt: null,
  };
}

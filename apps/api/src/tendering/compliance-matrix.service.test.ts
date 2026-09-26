import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { makeComplianceMatrixIssue, type ComplianceMatrixRow } from '@aura/tendering';
import { renderComplianceWorkbook } from './compliance-matrix.service';

/**
 * EST-12 — the controlled workbook says what the owner asked it to say, from the FROZEN issue, and
 * carries no commercial column: supplier, quotation revision and line, BOQ and PR-line lineage,
 * verdict, rationale, deviations, evaluator and date.
 */
const row: ComplianceMatrixRow = {
  boqItemId: 'boq-1', boqItemCode: 'C-01', boqDescription: 'IP camera, 4MP dome',
  prId: 'pr-1', prLineId: 'prl-1', prLineNo: 1, materialCode: 'CAM-4MP', materialName: '4MP dome camera',
  requested: { quantity: 60, uom: 'no', specification: '4MP, IR 30 m', manufacturer: null, model: null },
  supplierName: 'Al Noor Security', supplierQuotationRef: 'ANS-Q-118', offerLabel: null,
  revisionId: 'rev-1', revisionNo: 1, supplierRevisionRef: 'R1', quotationLineId: 'ql-1', response: 'quoted',
  offered: { description: '4MP dome', manufacturer: 'Hikvision', model: 'DS-2CD2143', partNumber: null, quantity: 60, uom: 'no' },
  complianceClaim: 'comply_with_deviation', deviations: 'IR range 25 m', exclusions: null,
  verdict: 'compliant_with_deviation', rationale: 'Deviation acceptable for indoor use', evaluatedBy: 'u-e2e-techmgr',
  evaluatedAt: '2026-09-25T10:00:00.000Z', amendmentReason: null,
};

describe('EST-12 — the controlled workbook', () => {
  it('prints the issue, the lineage and the verdict — and no commercial column', () => {
    const issue = makeComplianceMatrixIssue({
      tenantId: 't1', tender: { id: 'tender-1', reference: 'TND-7' }, previous: null, rows: [row],
      issuedBy: 'u-e2e-techmgr', documentId: 'pending', checksum: 'pending',
    });
    const book = XLSX.read(renderComplianceWorkbook(issue, { title: 'Creek Harbour ELV', reference: 'TND-7' }), { type: 'buffer' });
    expect(book.SheetNames).toEqual(['Issue', 'Matrix']);

    const head = XLSX.utils.sheet_to_json<string[]>(book.Sheets.Issue, { header: 1 });
    const text = head.map((r) => r.join(' | ')).join('\n');
    expect(text).toContain('TECHNICAL COMPLIANCE MATRIX');
    expect(text).toContain('Matrix | TCM-TND-7');
    expect(text).toContain('Revision | 0');
    expect(text).toContain('Issued by | u-e2e-techmgr');
    expect(text).toContain('Not part of the client submission');

    const [printed] = XLSX.utils.sheet_to_json<Record<string, string | number>>(book.Sheets.Matrix);
    expect(printed).toMatchObject({
      'BOQ item': 'C-01', 'PR line': 1, Supplier: 'Al Noor Security', 'Supplier quotation': 'ANS-Q-118',
      'Quotation revision': 'Rev 1 · supplier ref R1', 'Quotation line': 'ql-1', Deviations: 'IR range 25 m',
      Verdict: 'Compliant with deviation', Rationale: 'Deviation acceptable for indoor use',
      'Evaluated by': 'u-e2e-techmgr', 'Evaluated at': '2026-09-25T10:00:00.000Z',
    });
    for (const column of Object.keys(printed)) {
      expect(column, 'a technical document has no commercial column').not.toMatch(/price|amount|total|cost|discount|currency|vat/i);
    }
  });
});

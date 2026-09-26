import type { ComplianceMatrixRow } from './domain/compliance-matrix';

/** One judged supplier line — the shape the matrix freezes (EST-12 tests). */
export const row = (over: Partial<ComplianceMatrixRow> = {}): ComplianceMatrixRow => ({
  boqItemId: 'boq-1', boqItemCode: 'C-01', boqDescription: 'IP camera, 4MP dome',
  prId: 'pr-1', prLineId: 'prl-1', prLineNo: 1, materialCode: 'CAM-4MP', materialName: '4MP dome camera',
  requested: { quantity: 60, uom: 'no', specification: '4MP, IR 30 m', manufacturer: null, model: null },
  supplierName: 'Al Noor Security', supplierQuotationRef: 'ANS-Q-118', offerLabel: null,
  revisionId: 'rev-1', revisionNo: 1, supplierRevisionRef: 'R1', quotationLineId: 'ql-1', response: 'quoted',
  offered: { description: '4MP dome', manufacturer: 'Hikvision', model: 'DS-2CD2143', partNumber: null, quantity: 60, uom: 'no' },
  complianceClaim: 'comply', deviations: null, exclusions: null,
  verdict: 'compliant', rationale: 'Meets the 4MP and IR range requirement', evaluatedBy: 'u-e2e-techmgr', evaluatedAt: '2026-09-25T10:00:00.000Z',
  amendmentReason: null,
  ...over,
});

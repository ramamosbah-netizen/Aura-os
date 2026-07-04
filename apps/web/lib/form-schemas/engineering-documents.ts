// Per-docType field schemas for Engineering Documents (ADR-0011 point-6, ADR-0006 forms-are-JSON).
// One EngineeringDocument aggregate, many docTypes — each docType's *type-specific* fields are a
// FormSchema here. Adding a new document type = adding a schema below, not new code. These drive
// only the `fields` jsonb payload; the common fields (project/code/title/discipline) are captured
// by the Documents tab's outer form. `endpoint` is unused (the tab submits via its own handler).

import type { FormSchema } from '@aura/shared';

const schema = (id: string, entity: string, fields: FormSchema['fields']): FormSchema => ({
  id: `engineering.${id}`, entity, endpoint: '', version: 1, fields,
});

export const DOC_TYPE_FIELD_SCHEMAS: Record<string, FormSchema> = {
  method_statement: schema('method_statement', 'Method Statement', [
    { name: 'scope', label: 'Scope of works', kind: 'textarea', span: 2, placeholder: 'What this method statement covers' },
    { name: 'sequence', label: 'Work sequence', kind: 'textarea', span: 2, placeholder: '1. … 2. … 3. …' },
    { name: 'ppe', label: 'Required PPE', kind: 'text', placeholder: 'e.g. harness, hard hat, gloves' },
    { name: 'equipment', label: 'Plant & equipment', kind: 'text', placeholder: 'e.g. mobile crane, scaffold' },
  ]),
  risk_assessment: schema('risk_assessment', 'Risk Assessment', [
    { name: 'activity', label: 'Activity', kind: 'text', span: 2, placeholder: 'e.g. Working at height' },
    { name: 'hazard', label: 'Primary hazard', kind: 'text', placeholder: 'e.g. Fall from height' },
    { name: 'likelihood', label: 'Likelihood (1–5)', kind: 'select', options: ['1', '2', '3', '4', '5'].map((v) => ({ value: v, label: v })) },
    { name: 'severity', label: 'Severity (1–5)', kind: 'select', options: ['1', '2', '3', '4', '5'].map((v) => ({ value: v, label: v })) },
    { name: 'controls', label: 'Control measures', kind: 'textarea', span: 2, placeholder: 'Mitigations that reduce the residual risk' },
  ]),
  specification: schema('specification', 'Specification', [
    { name: 'referenceStandard', label: 'Reference standard', kind: 'text', placeholder: 'e.g. BS EN 1090, ASTM A36' },
    { name: 'requirements', label: 'Requirements', kind: 'textarea', span: 2 },
  ]),
  calc_sheet: schema('calc_sheet', 'Calculation Sheet', [
    { name: 'designCode', label: 'Design code', kind: 'text', placeholder: 'e.g. ACI 318, Eurocode 2' },
    { name: 'summary', label: 'Calculation summary', kind: 'textarea', span: 2 },
  ]),
  test_report: schema('test_report', 'Test Report', [
    { name: 'testType', label: 'Test type', kind: 'text', placeholder: 'e.g. Concrete cube, cable megger' },
    { name: 'result', label: 'Result', kind: 'select', options: [{ value: 'pass', label: 'Pass' }, { value: 'fail', label: 'Fail' }] },
    { name: 'remarks', label: 'Remarks', kind: 'textarea', span: 2 },
  ]),
  work_procedure: schema('work_procedure', 'Work Procedure', [
    { name: 'purpose', label: 'Purpose', kind: 'textarea', span: 2 },
    { name: 'steps', label: 'Procedure steps', kind: 'textarea', span: 2 },
  ]),
};

export function docTypeFieldSchema(docType: string): FormSchema | undefined {
  return DOC_TYPE_FIELD_SCHEMAS[docType];
}

export interface LinkedDocument {
  id: string;
  aggregateType: string;
  aggregateId: string;
  status?: 'active' | 'archived';
}

export interface DocumentOwnerTarget {
  label: string;
  href: string;
}

export interface DocumentSubmissionTarget extends DocumentOwnerTarget {
  method: 'POST' | 'PUT';
  endpoint: string;
}

type TargetBuilder = (id: string) => DocumentSubmissionTarget;

const sourceId = (id: string): string => encodeURIComponent(id);

// This is an allow-list, not a generic workflow bridge. Each entry points at an existing BFF
// command whose source module re-checks identity, tenant/company, permission and record state.
// Adding a new aggregate here therefore requires a real source-domain submit endpoint first.
const SUBMISSION_TARGETS: Readonly<Record<string, TargetBuilder>> = {
  'engineering.drawing': (id) => ({
    label: 'Engineering drawing',
    href: `/engineering/drawings/${sourceId(id)}`,
    method: 'POST',
    endpoint: `/api/engineering/drawings/${sourceId(id)}/submit`,
  }),
  'procurement.po': (id) => ({
    label: 'Purchase order',
    href: `/procurement/purchase-orders/${sourceId(id)}`,
    method: 'POST',
    endpoint: `/api/procurement/purchase-orders/${sourceId(id)}/submit`,
  }),
  'doccontrol.submittal': (id) => ({
    label: 'Document-control submittal',
    href: `/doccontrol/submittals?record=${sourceId(id)}`,
    method: 'PUT',
    endpoint: `/api/doccontrol/submittals/${sourceId(id)}/submit`,
  }),
  'quality.material_approval': (id) => ({
    label: 'Material approval',
    href: `/quality/material-approvals?record=${sourceId(id)}`,
    method: 'PUT',
    endpoint: `/api/quality/material-approvals/${sourceId(id)}/submit`,
  }),
  'site.daily_report': (id) => ({
    label: 'Site daily report',
    href: `/site/daily-reports?record=${sourceId(id)}`,
    method: 'PUT',
    endpoint: `/api/site/daily-reports/${sourceId(id)}/submit`,
  }),
  'commissioning.handover': (id) => ({
    label: 'Handover package',
    href: `/handover?record=${sourceId(id)}`,
    method: 'PUT',
    endpoint: `/api/commissioning/handovers/${sourceId(id)}/submit`,
  }),
};

const OWNER_TARGETS: Readonly<Record<string, (id: string) => DocumentOwnerTarget>> = {
  ...SUBMISSION_TARGETS,
  'crm.quotation': (id) => ({ label: 'Quotation', href: `/crm/quotations/${sourceId(id)}` }),
  'doccontrol.document': (id) => ({ label: 'Document register', href: `/documents/control?record=${sourceId(id)}` }),
};

export function resolveDocumentOwner(document: LinkedDocument): DocumentOwnerTarget | null {
  return OWNER_TARGETS[document.aggregateType]?.(document.aggregateId) ?? null;
}

export function resolveDocumentSubmission(document: LinkedDocument): DocumentSubmissionTarget | null {
  if (document.status === 'archived') return null;
  return SUBMISSION_TARGETS[document.aggregateType]?.(document.aggregateId) ?? null;
}

export function isPdfContentType(contentType: string): boolean {
  return contentType.split(';', 1)[0]?.trim().toLowerCase() === 'application/pdf';
}

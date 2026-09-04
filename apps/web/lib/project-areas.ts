// Project 360 context — delivery records remain owned by Delivery Operations and are linked here.
// A single config drives both the shell nav and the generic area register, so adding an area is a
// one-object change. Every listed endpoint returns records that carry a `projectId`, which is how
// the workspace scopes each list to the project it belongs to.

export interface AreaColumn {
  key: string;
  label: string;
  /** How to render the cell: a monospace code, a status badge, an ISO date (shown as YYYY-MM-DD), or plain text. */
  kind?: 'code' | 'status' | 'date' | 'text';
}

export interface ProjectArea {
  slug: string;
  label: string;
  icon: string;
  /** BFF list endpoint returning `Array<{ projectId, ... }>`. */
  endpoint: string;
  /** Singular noun for the empty state. */
  entity: string;
  /** The field summarised on the overview (status breakdown). */
  statusKey: string;
  columns: AreaColumn[];
  /** When set, each row links to `${rowHref}/${id}` (an existing 360). Omitted where no per-record page exists. */
  rowHref?: string;
  description: string;
  actions: Array<{ label: string; href: string; description: string }>;
}

type ProjectAreaRow = Record<string, unknown>;

const normaliseLensValue = (value: unknown): string =>
  String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');

/**
 * Apply the cross-module discipline lens without hiding records that are genuinely
 * project-wide. A row with an explicit discipline/system must match the selected
 * lens; a row with no such field remains visible because it applies to the whole
 * project (for example a general permit or daily report).
 */
export function filterAreaRows<T extends ProjectAreaRow>(rows: T[], disciplineId?: string | null): T[] {
  const selected = normaliseLensValue(disciplineId);
  if (!selected) return rows;

  return rows.filter((row) => {
    const explicit = [row.discipline, row.system, row.systemType]
      .map(normaliseLensValue)
      .filter(Boolean);
    return explicit.length === 0 || explicit.some((value) => value === selected);
  });
}

export const PROJECT_AREAS: ProjectArea[] = [
  {
    slug: 'engineering',
    label: 'Engineering',
    icon: '📐',
    endpoint: '/api/engineering/drawings',
    entity: 'drawing',
    statusKey: 'status',
    rowHref: '/engineering/drawings',
    description: 'Controlled technical information, approvals and engineering decisions for this project.',
    actions: [
      { label: 'Drawings', href: '/engineering/drawings', description: 'Review controlled drawings and revisions' },
      { label: 'RFIs', href: '/engineering', description: 'Track technical questions and responses' },
      { label: 'Submittals', href: '/engineering', description: 'Manage technical submissions' },
    ],
    columns: [
      { key: 'code', label: 'Code', kind: 'code' },
      { key: 'title', label: 'Title' },
      { key: 'revision', label: 'Rev' },
      { key: 'discipline', label: 'Discipline' },
      { key: 'status', label: 'Status', kind: 'status' },
    ],
  },
  {
    slug: 'site',
    label: 'Site',
    icon: '🏗️',
    endpoint: '/api/site/daily-reports',
    entity: 'daily report',
    statusKey: 'status',
    rowHref: '/site/execution',
    description: 'Field work, daily reporting and installed progress in the project context.',
    actions: [
      { label: 'Work instructions', href: '/site/instructions', description: 'Issue and track site instructions' },
      { label: 'Daily reports', href: '/site/daily-reports', description: 'Record work, manpower and evidence' },
      { label: 'Progress', href: '/site/execution', description: 'Review active work and quantities' },
    ],
    columns: [
      { key: 'date', label: 'Date', kind: 'date' },
      { key: 'workDescription', label: 'Work' },
      { key: 'manpowerCount', label: 'Manpower' },
      { key: 'status', label: 'Status', kind: 'status' },
    ],
  },
  {
    slug: 'quality',
    label: 'Quality',
    icon: '✅',
    endpoint: '/api/quality/ncrs',
    entity: 'NCR',
    statusKey: 'status',
    rowHref: '/quality/ncrs',
    description: 'Inspections, NCRs and acceptance records owned by the canonical Quality authority.',
    actions: [
      { label: 'Inspections', href: '/quality/inspection-requests', description: 'Review inspection requests' },
      { label: 'NCRs', href: '/quality/ncrs', description: 'Resolve non-conformance records' },
      { label: 'Snags & ITP', href: '/quality/snags', description: 'Track punch items and test points' },
    ],
    columns: [
      { key: 'ncrNumber', label: 'NCR', kind: 'code' },
      { key: 'description', label: 'Description' },
      { key: 'severity', label: 'Severity' },
      { key: 'status', label: 'Status', kind: 'status' },
    ],
  },
  {
    slug: 'hse',
    label: 'HSE',
    icon: '🦺',
    endpoint: '/api/hse/ptws',
    entity: 'permit',
    statusKey: 'status',
    description: 'Permits, observations and safe-work controls for the project site.',
    actions: [
      { label: 'Permits', href: '/hse/permits', description: 'Review active permits to work' },
      { label: 'Risk assessments', href: '/hse/risk-assessments', description: 'Review approved risk controls' },
      { label: 'Toolbox talks', href: '/hse/toolbox-talks', description: 'Track site safety briefings' },
    ],
    columns: [
      { key: 'permitType', label: 'Type' },
      { key: 'validFrom', label: 'Valid from', kind: 'date' },
      { key: 'validTo', label: 'Valid to', kind: 'date' },
      { key: 'status', label: 'Status', kind: 'status' },
    ],
  },
  {
    slug: 'commissioning',
    label: 'Commissioning',
    icon: '🧪',
    endpoint: '/api/commissioning/records',
    entity: 'system',
    statusKey: 'status',
    rowHref: '/commissioning',
    description: 'System testing, failed/retest actions and commissioning readiness.',
    actions: [
      { label: 'Systems & tests', href: '/commissioning', description: 'Open commissioning records' },
      { label: 'Handover', href: '/handover', description: 'Review acceptance and closeout readiness' },
    ],
    columns: [
      { key: 'code', label: 'Code', kind: 'code' },
      { key: 'system', label: 'System' },
      { key: 'status', label: 'Status', kind: 'status' },
    ],
  },
  {
    slug: 'documents',
    label: 'Documents',
    icon: '📄',
    endpoint: '/api/doccontrol/register',
    entity: 'document',
    statusKey: 'status',
    description: 'Controlled project evidence with revision and document-control context.',
    actions: [
      { label: 'Document register', href: '/doccontrol/register', description: 'Open the controlled register' },
      { label: 'Documents', href: '/documents', description: 'View and download project evidence' },
    ],
    columns: [
      { key: 'documentNumber', label: 'Doc No', kind: 'code' },
      { key: 'title', label: 'Title' },
      { key: 'currentRevision', label: 'Rev' },
      { key: 'discipline', label: 'Discipline' },
      { key: 'status', label: 'Status', kind: 'status' },
    ],
  },
];

export function findArea(slug: string): ProjectArea | undefined {
  return PROJECT_AREAS.find((a) => a.slug === slug);
}

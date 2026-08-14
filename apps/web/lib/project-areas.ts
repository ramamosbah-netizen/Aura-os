// Project Delivery Workspace — the delivery areas that make up one project's workspace (slice P3).
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

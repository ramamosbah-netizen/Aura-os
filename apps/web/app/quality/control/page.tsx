import type { CSSProperties } from 'react';
import { getJson } from '@/lib/api';
import QualityControlClient from '../../../components/quality-control-client';
import DeliveryOperationsWorkspaceHeader from '../../../components/delivery-operations-workspace-header';
import DeliveryWorkspaceSummary, { type WorkspaceAttention, type WorkspaceMetric } from '../../../components/delivery-workspace-summary';

export const dynamic = 'force-dynamic';

interface Project {
  id: string;
  title: string;
}

interface Ncr {
  id: string;
  tenantId: string;
  companyId: string | null;
  projectId: string;
  projectName: string | null;
  ncrNumber: string;
  description: string;
  rootCause: string | null;
  proposedCorrection: string | null;
  severity: 'minor' | 'major';
  status: 'raised' | 'corrected' | 'closed';
  raisedBy: string | null;
  assignedTo: string | null;
  createdAt: string;
  updatedAt: string;
}

interface InspectionRequest {
  id: string;
  tenantId: string;
  companyId: string | null;
  projectId: string;
  projectName: string | null;
  irNumber: string;
  discipline: 'civil' | 'mechanical' | 'electrical' | 'plumbing';
  locationDetail: string;
  inspectionDate: string;
  status: 'requested' | 'approved' | 'rejected';
  inspectedBy: string | null;
  comments: string | null;
  createdAt: string;
  updatedAt: string;
}

interface Snag {
  id: string;
  tenantId: string;
  companyId: string | null;
  projectId: string;
  projectName: string | null;
  description: string;
  locationDetail: string;
  severity: 'low' | 'medium' | 'high';
  status: 'open' | 'resolved' | 'closed';
  assignedTo: string | null;
  resolvedAt: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

interface ChecklistItem {
  question: string;
  standard: string;
  status: 'pending' | 'compliant' | 'non_compliant' | 'not_applicable';
  findings: string | null;
  ncrId: string | null;
}

interface AuditSchedule {
  id: string;
  tenantId: string;
  companyId: string | null;
  projectId: string;
  projectName: string | null;
  auditNumber: string;
  auditType: string;
  scheduledDate: string;
  auditorName: string;
  status: 'scheduled' | 'in_progress' | 'completed' | 'cancelled';
  checklist: ChecklistItem[];
  createdAt: string;
  updatedAt: string;
}

export default async function QualityControlPage() {
  const [ncrs, inspections, snags, projects, audits] = await Promise.all([
    getJson<Ncr[]>('/api/quality/ncrs'),
    getJson<InspectionRequest[]>('/api/quality/irs'),
    getJson<Snag[]>('/api/quality/snags'),
    getJson<Project[]>('/api/projects/projects'),
    getJson<AuditSchedule[]>('/api/quality/audits'),
  ]);

  const open = <T extends { status?: string }>(rows: T[] | null, closed: string[]) => rows === null ? null : rows.filter((row) => !closed.includes((row.status ?? '').toLowerCase())).length;
  const metrics: WorkspaceMetric[] = [
    { label: 'Needs action', value: [ncrs, inspections, snags].some((rows) => rows === null) ? null : (open(ncrs, ['closed', 'corrected']) ?? 0) + (open(inspections, ['approved', 'rejected']) ?? 0) + (open(snags, ['closed', 'resolved']) ?? 0), hint: 'Open quality decisions', tone: 'critical' },
    { label: 'Inspections today', value: inspections === null ? null : inspections.filter((row) => row.inspectionDate.slice(0, 10) === new Date().toISOString().slice(0, 10) && row.status !== 'rejected').length, hint: 'Scheduled inspection requests', tone: 'accent' },
    { label: 'Open NCR', value: open(ncrs, ['closed', 'corrected']), hint: 'Non-conformance records', tone: 'warning' },
    { label: 'Open snags', value: open(snags, ['closed', 'resolved']), hint: 'Outstanding close-out items', tone: 'warning' },
  ];
  const attention: WorkspaceAttention[] | null = [ncrs, inspections, snags].some((rows) => rows === null) ? null : [
    ...(ncrs ?? []).filter((row) => !['closed', 'corrected'].includes(row.status)).slice(0, 2).map((row) => ({ label: `${row.projectName ?? 'Project'} · ${row.ncrNumber}`, detail: `${row.severity.toUpperCase()} NCR · corrective action open`, href: '/quality/ncrs', tone: row.severity === 'major' ? 'critical' as const : 'warning' as const })),
    ...(inspections ?? []).filter((row) => row.inspectionDate.slice(0, 10) === new Date().toISOString().slice(0, 10) && row.status === 'requested').slice(0, 2).map((row) => ({ label: `${row.projectName ?? 'Project'} · ${row.irNumber}`, detail: 'Inspection scheduled today', href: '/quality/inspection-requests', tone: 'warning' as const })),
    ...(snags ?? []).filter((row) => !['closed', 'resolved'].includes(row.status)).slice(0, 2).map((row) => ({ label: `${row.projectName ?? 'Project'} · snag`, detail: `${row.severity.toUpperCase()} · closure evidence required`, href: '/quality/snags', tone: 'warning' as const })),
  ];

  return (
    <div style={st.page}>
      <DeliveryOperationsWorkspaceHeader active="quality" title="Quality control workspace" description="Plan inspections, manage NCRs and snags, and close corrective actions with auditable evidence across projects." />

      <DeliveryWorkspaceSummary eyebrow="QUALITY OPERATIONS" title="Quality operating picture" description="See the exceptions that can affect execution, then open the canonical inspection or NCR workflow to act." metrics={metrics} attention={attention} emptyMessage="No quality exceptions are open for the available records." />

      <QualityControlClient
        initialNcrs={ncrs ?? []}
        initialInspections={inspections ?? []}
        initialSnags={snags ?? []}
        projects={projects ?? []}
        initialAudits={audits ?? []}
      />
    </div>
  );
}

const st = {
  page: { maxWidth: 1020, margin: '0 auto', padding: '28px 28px 64px' } as CSSProperties,
  h1: { fontSize: 28, margin: '0 0 6px', letterSpacing: -0.5 } as CSSProperties,
  sub: { color: 'var(--muted)', margin: '0 0 22px', maxWidth: 640, lineHeight: 1.5 } as CSSProperties,
};

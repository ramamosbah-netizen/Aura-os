import type { CSSProperties } from 'react';
import { getJson } from '@/lib/api';
import HseControlClient from '../../../components/hse-control-client';
import DeliveryOperationsWorkspaceHeader from '../../../components/delivery-operations-workspace-header';
import DeliveryWorkspaceSummary, { type WorkspaceAttention, type WorkspaceMetric } from '../../../components/delivery-workspace-summary';

export const dynamic = 'force-dynamic';

interface Project {
  id: string;
  title: string;
}

interface HseIncident {
  id: string;
  tenantId: string;
  companyId: string | null;
  projectId: string;
  projectName: string | null;
  date: string;
  severity: 'near_miss' | 'minor' | 'major' | 'fatal';
  description: string;
  locationDetail: string;
  status: 'reported' | 'investigating' | 'closed';
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

interface PermitToWork {
  id: string;
  tenantId: string;
  companyId: string | null;
  projectId: string;
  projectName: string | null;
  permitType: 'hot_work' | 'confined_space' | 'height_work' | 'electrical' | 'excavation';
  validFrom: string;
  validTo: string;
  description: string;
  status: 'draft' | 'requested' | 'approved' | 'expired' | 'closed';
  approvedBy: string | null;
  approvedAt: string | null;
  closedBy: string | null;
  closedAt: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

interface CapaAction {
  id: string;
  tenantId: string;
  companyId: string | null;
  projectId: string;
  projectName: string | null;
  sourceType: 'incident' | 'audit' | 'inspection';
  sourceId: string | null;
  actionRequired: string;
  assignedTo: string | null;
  dueDate: string;
  status: 'pending' | 'in_progress' | 'completed';
  completedAt: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

interface SafetyTrainingRecord {
  id: string;
  tenantId: string;
  companyId: string | null;
  workerName: string;
  workerId: string;
  inductionDate: string;
  cardNumber: string | null;
  cardExpiry: string | null;
  certifications: string[];
  status: 'valid' | 'expired';
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

interface RiskAssessmentLite {
  id: string;
  reference: string;
  activity: string;
  status: string;
}

export default async function HseControlPage() {
  const [incidents, permits, capas, trainingRecords, projects, riskAssessments] = await Promise.all([
    getJson<HseIncident[]>('/api/hse/incidents'),
    getJson<PermitToWork[]>('/api/hse/ptws'),
    getJson<CapaAction[]>('/api/hse/capas'),
    getJson<SafetyTrainingRecord[]>('/api/hse/training'),
    getJson<Project[]>('/api/projects/projects'),
    // Only APPROVED assessments can authorise a permit, so only those are offerable.
    getJson<RiskAssessmentLite[]>('/api/hse/risk-assessments'),
  ]);

  const open = <T extends { status?: string }>(rows: T[] | null, closed: string[]) => rows === null ? null : rows.filter((row) => !closed.includes((row.status ?? '').toLowerCase())).length;
  const metrics: WorkspaceMetric[] = [
    { label: 'Needs action', value: [incidents, permits, capas].some((rows) => rows === null) ? null : (open(incidents, ['closed']) ?? 0) + (open(permits, ['closed', 'expired']) ?? 0) + (open(capas, ['completed']) ?? 0), hint: 'Open safety decisions', tone: 'critical' },
    { label: 'Active permits', value: open(permits, ['closed', 'expired']), hint: 'Permits currently in force', tone: 'accent' },
    { label: 'Expiring today', value: permits === null ? null : permits.filter((row) => row.validTo.slice(0, 10) === new Date().toISOString().slice(0, 10) && row.status !== 'closed').length, hint: 'Permit expiry evidence', tone: 'warning' },
    { label: 'Critical actions', value: capas === null ? null : capas.filter((row) => row.status !== 'completed').length, hint: 'Corrective actions in progress', tone: 'warning' },
  ];
  const attention: WorkspaceAttention[] | null = [incidents, permits, capas].some((rows) => rows === null) ? null : [
    ...(permits ?? []).filter((row) => row.status !== 'closed' && row.validTo.slice(0, 10) <= new Date().toISOString().slice(0, 10)).slice(0, 2).map((row) => ({ label: `${row.projectName ?? 'Project'} · permit`, detail: `Expires ${row.validTo.slice(0, 10)}`, href: '/hse/permits', tone: 'critical' as const })),
    ...(capas ?? []).filter((row) => row.status !== 'completed').slice(0, 2).map((row) => ({ label: `${row.projectName ?? 'Project'} · corrective action`, detail: `${row.dueDate} · ${row.actionRequired}`, href: '/hse/control', tone: 'warning' as const })),
    ...(incidents ?? []).filter((row) => row.status !== 'closed').slice(0, 2).map((row) => ({ label: `${row.projectName ?? 'Project'} · safety event`, detail: `${row.severity.toUpperCase()} · investigation open`, href: '/hse/control', tone: row.severity === 'fatal' || row.severity === 'major' ? 'critical' as const : 'warning' as const })),
  ];

  return (
    <div style={st.page}>
      <DeliveryOperationsWorkspaceHeader active="hse" title="HSE control workspace" description="Keep field activities safe through permits, risk controls, incidents, observations, training and corrective actions." />

      <DeliveryWorkspaceSummary eyebrow="HSE OPERATIONS" title="Safety operating picture" description="See permits, incidents and corrective actions that need attention. Safety records remain owned by HSE." metrics={metrics} attention={attention} emptyMessage="No HSE exceptions are open for the available records." />

      <HseControlClient
        initialIncidents={incidents ?? []}
        initialPermits={permits ?? []}
        initialCapas={capas ?? []}
        initialTrainingRecords={trainingRecords ?? []}
        projects={projects ?? []}
        riskAssessments={(riskAssessments ?? []).filter((r) => r.status === 'approved')}
      />
    </div>
  );
}

const st = {
  page: { maxWidth: 1020, margin: '0 auto', padding: '28px 28px 64px' } as CSSProperties,
  h1: { fontSize: 28, margin: '0 0 6px', letterSpacing: -0.5 } as CSSProperties,
  sub: { color: 'var(--muted)', margin: '0 0 22px', maxWidth: 640, lineHeight: 1.5 } as CSSProperties,
};

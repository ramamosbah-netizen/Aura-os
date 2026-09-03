import type { CSSProperties } from 'react';
import { getJson } from '@/lib/api';
import CommissioningClient from '../../components/commissioning-client';
import DeliveryOperationsWorkspaceHeader from '../../components/delivery-operations-workspace-header';
import DeliveryWorkspaceSummary, { type WorkspaceAttention, type WorkspaceMetric } from '../../components/delivery-workspace-summary';

export const dynamic = 'force-dynamic';

interface Project {
  id: string;
  title: string;
}

interface CommissioningRecord {
  id: string;
  projectId: string;
  projectName: string | null;
  code: string;
  title: string;
  system: string;
  location: string | null;
  status: 'pending' | 'in_progress' | 'tested' | 'commissioned' | 'failed';
  pointsTotal: number;
  pointsPassed: number;
  testDate: string | null;
  remarks: string | null;
  commissionedAt: string | null;
  commissionedBy: string | null;
  witnessedBy: string | null;
  createdAt: string;
}

export default async function CommissioningPage() {
  const [records, projects] = await Promise.all([
    getJson<CommissioningRecord[]>('/api/commissioning/records'),
    getJson<Project[]>('/api/projects/projects'),
  ]);

  const metrics: WorkspaceMetric[] = [
    { label: 'Ready to test', value: records === null ? null : records.filter((row) => row.status === 'pending').length, hint: 'Systems awaiting first test', tone: 'accent' },
    { label: 'Testing', value: records === null ? null : records.filter((row) => row.status === 'in_progress' || row.status === 'tested').length, hint: 'Tests in progress or witnessed', tone: 'warning' },
    { label: 'Failed / retest', value: records === null ? null : records.filter((row) => row.status === 'failed').length, hint: 'Records requiring resolution', tone: 'critical' },
    { label: 'Commissioned', value: records === null ? null : records.filter((row) => row.status === 'commissioned').length, hint: 'Systems with witnessed sign-off', tone: 'good' },
  ];
  const attention: WorkspaceAttention[] | null = records === null ? null : records.filter((row) => row.status === 'failed').slice(0, 4).map((row) => ({ label: `${row.projectName ?? 'Project'} · ${row.code}`, detail: `${row.title} · retest required`, href: '/commissioning', tone: 'critical' as const }));

  return (
    <div style={st.page}>
      <DeliveryOperationsWorkspaceHeader active="commissioning" title="Testing & commissioning workspace" owner="Commissioning" description="Turn installed systems into accepted systems through test plans, point results, witnessed sign-off and commissioning evidence." />
      <DeliveryWorkspaceSummary eyebrow="TESTING & COMMISSIONING" title="Commissioning operating picture" description="Move systems from ready to test through witnessed testing, retest and final commissioning." metrics={metrics} attention={attention} emptyMessage="No failed or overdue commissioning records are open." />
      <CommissioningClient initialRecords={records ?? []} projects={projects ?? []} />
    </div>
  );
}

const st = {
  page: { maxWidth: 1100, margin: '0 auto', padding: '28px 28px 64px' } as CSSProperties,
  h1: { fontSize: 28, margin: '0 0 6px', letterSpacing: -0.5 } as CSSProperties,
  sub: { color: 'var(--muted)', margin: '0 0 22px', maxWidth: 680, lineHeight: 1.5 } as CSSProperties,
};

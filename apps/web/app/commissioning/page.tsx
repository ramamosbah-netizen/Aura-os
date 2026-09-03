import type { CSSProperties } from 'react';
import { getJson } from '@/lib/api';
import CommissioningClient from '../../components/commissioning-client';
import DeliveryOperationsWorkspaceHeader from '../../components/delivery-operations-workspace-header';

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

  return (
    <div style={st.page}>
      <DeliveryOperationsWorkspaceHeader active="commissioning" title="Testing & commissioning workspace" owner="Commissioning" description="Turn installed systems into accepted systems through test plans, point results, witnessed sign-off and commissioning evidence." />
      <CommissioningClient initialRecords={records ?? []} projects={projects ?? []} />
    </div>
  );
}

const st = {
  page: { maxWidth: 1100, margin: '0 auto', padding: '28px 28px 64px' } as CSSProperties,
  h1: { fontSize: 28, margin: '0 0 6px', letterSpacing: -0.5 } as CSSProperties,
  sub: { color: 'var(--muted)', margin: '0 0 22px', maxWidth: 680, lineHeight: 1.5 } as CSSProperties,
};

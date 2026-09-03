import type { CSSProperties } from 'react';
import { getJson } from '@/lib/api';
import HandoverClient from '../../components/handover-client';
import DeliveryOperationsWorkspaceHeader from '../../components/delivery-operations-workspace-header';
import DeliveryWorkspaceSummary, { type WorkspaceAttention, type WorkspaceMetric } from '../../components/delivery-workspace-summary';

export const dynamic = 'force-dynamic';

interface Project { id: string; title: string }

interface HandoverPackage {
  id: string;
  projectId: string;
  projectName: string | null;
  code: string;
  title: string;
  status: 'draft' | 'submitted' | 'accepted' | 'rejected';
  checklist: {
    omManuals: boolean; asBuilts: boolean; testCertificates: boolean;
    warrantyDocs: boolean; training: boolean; spares: boolean;
  };
  submittedAt: string | null;
  acceptedAt: string | null;
  clientRepresentative: string | null;
  warrantyStartDate: string | null;
  warrantyMonths: number | null;
  remarks: string | null;
  systemsTotal: number;
  systemsCommissioned: number;
}

export default async function HandoverPage() {
  const [packages, projects] = await Promise.all([
    getJson<HandoverPackage[]>('/api/commissioning/handovers'),
    getJson<Project[]>('/api/projects/projects'),
  ]);

  const metrics: WorkspaceMetric[] = [
    { label: 'In handover', value: packages === null ? null : packages.filter((row) => row.status === 'submitted' || row.status === 'draft').length, hint: 'Packages being compiled', tone: 'accent' },
    { label: 'Blocked', value: packages === null ? null : packages.filter((row) => row.status === 'draft' && !(row.checklist.omManuals && row.checklist.asBuilts && row.checklist.testCertificates)).length, hint: 'Core evidence still open', tone: 'critical' },
    { label: 'Needs action', value: packages === null ? null : packages.filter((row) => row.status === 'submitted' || row.status === 'rejected').length, hint: 'Client or internal decision', tone: 'warning' },
    { label: 'Accepted', value: packages === null ? null : packages.filter((row) => row.status === 'accepted').length, hint: 'Accepted packages', tone: 'good' },
  ];
  const attention: WorkspaceAttention[] | null = packages === null ? null : packages.filter((row) => row.status !== 'accepted').slice(0, 4).map((row) => ({ label: `${row.projectName ?? 'Project'} · ${row.code}`, detail: row.status === 'submitted' ? 'Awaiting client acceptance' : row.status === 'rejected' ? 'Returned for correction' : 'Evidence package is still open', href: '/handover', tone: row.status === 'rejected' ? 'critical' as const : 'warning' as const }));

  return (
    <div style={st.page}>
      <DeliveryOperationsWorkspaceHeader active="handover" title="Handover workspace" owner="Handover" description="Assemble the acceptance package, track outstanding deliverables and record the governed client handover that closes delivery." />
      <DeliveryWorkspaceSummary eyebrow="HANDOVER OPERATIONS" title="Handover operating picture" description="See which acceptance packages are ready, blocked or waiting for a decision before close-out." metrics={metrics} attention={attention} emptyMessage="No handover exceptions are open for the available packages." />
      <HandoverClient initialPackages={packages ?? []} projects={projects ?? []} />
    </div>
  );
}

const st = {
  page: { maxWidth: 1100, margin: '0 auto', padding: '28px 28px 64px' } as CSSProperties,
  h1: { fontSize: 28, margin: '0 0 6px', letterSpacing: -0.5 } as CSSProperties,
  sub: { color: 'var(--muted)', margin: '0 0 22px', maxWidth: 720, lineHeight: 1.5 } as CSSProperties,
};

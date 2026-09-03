import type { CSSProperties } from 'react';
import { getJson } from '@/lib/api';
import HandoverClient from '../../components/handover-client';
import DeliveryOperationsWorkspaceHeader from '../../components/delivery-operations-workspace-header';

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

  return (
    <div style={st.page}>
      <DeliveryOperationsWorkspaceHeader active="handover" title="Handover workspace" owner="Handover" description="Assemble the acceptance package, track outstanding deliverables and record the governed client handover that closes delivery." />
      <HandoverClient initialPackages={packages ?? []} projects={projects ?? []} />
    </div>
  );
}

const st = {
  page: { maxWidth: 1100, margin: '0 auto', padding: '28px 28px 64px' } as CSSProperties,
  h1: { fontSize: 28, margin: '0 0 6px', letterSpacing: -0.5 } as CSSProperties,
  sub: { color: 'var(--muted)', margin: '0 0 22px', maxWidth: 720, lineHeight: 1.5 } as CSSProperties,
};

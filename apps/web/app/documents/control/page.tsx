import type { CSSProperties } from 'react';
import { getJson } from '@/lib/api';
import DocControlClient from '../../../components/doccontrol-client';

export const dynamic = 'force-dynamic';

interface Project {
  id: string;
  title: string;
}

interface Transmittal {
  id: string;
  tenantId: string;
  companyId: string | null;
  code: string;
  title: string;
  projectId: string;
  projectName: string | null;
  sender: string | null;
  recipient: string | null;
  status: 'draft' | 'sent' | 'received' | 'acknowledged';
  ownerId: string | null;
  createdBy: string | null;
  createdAt: string;
}

interface Correspondence {
  id: string;
  tenantId: string;
  companyId: string | null;
  code: string;
  subject: string;
  projectId: string;
  projectName: string | null;
  direction: 'inbound' | 'outbound';
  sender: string | null;
  recipient: string | null;
  status: 'logged' | 'pending_review' | 'closed';
  ownerId: string | null;
  createdBy: string | null;
  createdAt: string;
}

export default async function DocControlPage() {
  const [transmittals, correspondence, projects] = await Promise.all([
    getJson<Transmittal[]>('/api/doccontrol/transmittals'),
    getJson<Correspondence[]>('/api/doccontrol/correspondence'),
    getJson<Project[]>('/api/projects/projects'),
  ]);

  return (
    <div style={st.page}>
      <h1 style={st.h1}>Document Control</h1>
      <p style={st.sub}>
        Technical controls for engineering and construction dispatch logs. Track official transmittals to external parties and register project correspondence.
      </p>

      <DocControlClient
        initialTransmittals={transmittals ?? []}
        initialCorrespondence={correspondence ?? []}
        projects={projects ?? []}
      />
    </div>
  );
}

const st = {
  page: { maxWidth: 980, margin: '0 auto', padding: '28px 28px 64px' } as CSSProperties,
  h1: { fontSize: 28, margin: '0 0 6px', letterSpacing: -0.5 } as CSSProperties,
  sub: { color: 'var(--muted)', margin: '0 0 22px', maxWidth: 640, lineHeight: 1.5 } as CSSProperties,
};

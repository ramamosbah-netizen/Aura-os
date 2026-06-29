import type { CSSProperties } from 'react';
import { getJson } from '@/lib/api';
import EngineeringClient from '../../components/engineering-client';

export const dynamic = 'force-dynamic';

interface Project {
  id: string;
  title: string;
}

interface Drawing {
  id: string;
  projectId: string;
  projectName: string | null;
  code: string;
  title: string;
  revision: string;
  status: 'draft' | 'pending_approval' | 'approved' | 'rejected';
  createdAt: string;
}

interface Rfi {
  id: string;
  projectId: string;
  projectName: string | null;
  code: string;
  title: string;
  question: string;
  answer: string | null;
  status: 'open' | 'answered' | 'closed';
  createdAt: string;
}

interface Submittal {
  id: string;
  projectId: string;
  projectName: string | null;
  code: string;
  title: string;
  submittalType: 'material' | 'technical' | 'sample' | 'drawing';
  status: 'draft' | 'submitted' | 'approved' | 'rejected';
  createdAt: string;
}

export default async function EngineeringPage() {
  const [drawings, rfis, submittals, projects] = await Promise.all([
    getJson<Drawing[]>('/api/engineering/drawings'),
    getJson<Rfi[]>('/api/engineering/rfis'),
    getJson<Submittal[]>('/api/engineering/submittals'),
    getJson<Project[]>('/api/projects/projects'),
  ]);

  return (
    <div style={st.page}>
      <h1 style={st.h1}>Engineering</h1>
      <p style={st.sub}>
        Technical controls, compliance, and design document management. Register shop drawings,
        raise technical queries (RFIs), and process material/technical submittals.
      </p>

      <EngineeringClient
        initialDrawings={drawings ?? []}
        initialRfis={rfis ?? []}
        initialSubmittals={submittals ?? []}
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

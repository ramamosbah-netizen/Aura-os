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

interface DesignChange {
  id: string;
  projectId: string;
  projectName: string | null;
  code: string;
  title: string;
  discipline: string;
  changeType: 'addition' | 'omission';
  costImpact: boolean;
  estimatedValue: number;
  status: 'draft' | 'submitted' | 'approved' | 'rejected';
  createdAt: string;
}

interface EngineeringDocument {
  id: string;
  projectId: string;
  projectName: string | null;
  code: string;
  title: string;
  docType: string;
  ownerModule: 'engineering' | 'hse';
  discipline: string;
  status: 'draft' | 'submitted' | 'approved' | 'rejected';
  revision: string;
  createdAt: string;
}

interface DocTypeMeta {
  docType: string;
  label: string;
  ownerModule: 'engineering' | 'hse';
  formSchemaId: string;
}

export default async function EngineeringPage() {
  const [drawings, rfis, submittals, designChanges, documents, docTypes, projects] = await Promise.all([
    getJson<Drawing[]>('/api/engineering/drawings'),
    getJson<Rfi[]>('/api/engineering/rfis'),
    getJson<Submittal[]>('/api/engineering/submittals'),
    getJson<DesignChange[]>('/api/engineering/design-changes'),
    getJson<EngineeringDocument[]>('/api/engineering/documents'),
    getJson<DocTypeMeta[]>('/api/engineering/document-types'),
    getJson<Project[]>('/api/projects/projects'),
  ]);

  return (
    <div style={st.page}>
      <h1 style={st.h1}>Engineering Management</h1>
      <p style={st.sub}>
        The engineering lifecycle in one place: shop drawings, RFIs and submittals, engineering
        design changes (which raise commercial variations on approval), and controlled documents
        (method statements, risk assessments, specs) — every record tagged by discipline.
      </p>

      <EngineeringClient
        initialDrawings={drawings ?? []}
        initialRfis={rfis ?? []}
        initialSubmittals={submittals ?? []}
        initialDesignChanges={designChanges ?? []}
        initialDocuments={documents ?? []}
        docTypes={docTypes ?? []}
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

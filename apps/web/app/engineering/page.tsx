import type { CSSProperties } from 'react';
import { getJson } from '@/lib/api';
import EngineeringClient from '../../components/engineering-client';
import AuraTabAnchor from '../../components/aura-tab-anchor';
import DeliveryOperationsWorkspaceHeader from '../../components/delivery-operations-workspace-header';

export const dynamic = 'force-dynamic';

interface Project {
  id: string;
  title: string;
}

interface TenderContext {
  id: string;
  title: string;
  reference?: string | null;
  status?: string | null;
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

interface TechnicalQuery {
  id: string;
  projectId: string;
  projectName: string | null;
  code: string;
  title: string;
  query: string;
  response: string | null;
  status: 'open' | 'responded' | 'closed';
  priority: 'low' | 'medium' | 'high';
  discipline: string;
  drawingReference: string | null;
  costImpact: boolean;
  timeImpact: boolean;
  createdAt: string;
}

interface BimModel {
  id: string;
  projectId: string;
  projectName: string | null;
  code: string;
  name: string;
  discipline: string;
  format: 'ifc' | 'rvt' | 'nwd' | 'nwc' | 'dwg' | 'glb' | 'other';
  storageKey: string | null;
  fileUrl: string | null;
  version: number;
  revision: string;
  status: 'wip' | 'shared' | 'published' | 'archived';
  fileSizeBytes: number | null;
  federationGroup: string | null;
  notes: string | null;
  createdAt: string;
}

export default async function EngineeringPage() {
  const [drawings, rfis, submittals, designChanges, documents, technicalQueries, bimModels, docTypes, projects, tenders] = await Promise.all([
    getJson<Drawing[]>('/api/engineering/drawings'),
    getJson<Rfi[]>('/api/engineering/rfis'),
    getJson<Submittal[]>('/api/engineering/submittals'),
    getJson<DesignChange[]>('/api/engineering/design-changes'),
    getJson<EngineeringDocument[]>('/api/engineering/documents'),
    getJson<TechnicalQuery[]>('/api/engineering/technical-queries'),
    getJson<BimModel[]>('/api/engineering/bim-models'),
    getJson<DocTypeMeta[]>('/api/engineering/document-types'),
    getJson<Project[]>('/api/projects/projects'),
    getJson<TenderContext[]>('/api/tendering/tenders'),
  ]);

  return (
    <div style={st.page}>
      {/* The workspace keeps a tab of its own, so opening a section from the shortcut grid adds a
          tab beside it rather than replacing the way back. Same contract as the Operations overview.
          The href carries no `?section`, so it always returns to the workspace's own landing view. */}
      <AuraTabAnchor href="/engineering" title="Engineering" type="Delivery Operations" />
      <DeliveryOperationsWorkspaceHeader active="engineering" title="Engineering workspace" description="Prepare and release the technical information that enables field work: drawings, RFIs, submittals, design changes and controlled deliverables." />

      <EngineeringClient
        initialDrawings={drawings ?? []}
        initialRfis={rfis ?? []}
        initialSubmittals={submittals ?? []}
        initialDesignChanges={designChanges ?? []}
        initialDocuments={documents ?? []}
        initialTechnicalQueries={technicalQueries ?? []}
        initialBimModels={bimModels ?? []}
        docTypes={docTypes ?? []}
        projects={projects ?? []}
        tenders={tenders ?? []}
      />
    </div>
  );
}

const st = {
  // FULL WIDTH, deliberately. This was `maxWidth: 980, margin: '0 auto'`, which centred the
  // workspace in a 980px column and left the rest of the screen empty on both sides — on a wide
  // monitor most of the display showed nothing while the section cards were squeezed into four
  // narrow columns. The shortcut grid is `repeat(4, minmax(0, 1fr))`, so every pixel given back
  // goes straight into the cards.
  //
  // Engineering only, on purpose: the rest of the app is capped (720–1280) and changing those is a
  // separate decision. `sub` below keeps its own `maxWidth: 640`, so the description stays a
  // readable measure rather than stretching across the whole screen.
  page: { padding: '28px 28px 64px' } as CSSProperties,
  h1: { fontSize: 28, margin: '0 0 6px', letterSpacing: -0.5 } as CSSProperties,
  sub: { color: 'var(--muted)', margin: '0 0 22px', maxWidth: 640, lineHeight: 1.5 } as CSSProperties,
};

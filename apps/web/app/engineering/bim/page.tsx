import type { CSSProperties } from 'react';
import { getJson } from '@/lib/api';
import BimViewerClient from '../../../components/bim-viewer-client';

export const dynamic = 'force-dynamic';

interface Project {
  id: string;
  title: string;
}

interface BimModel {
  id: string;
  projectId: string;
  projectName: string | null;
  code: string;
  name: string;
  discipline: string;
  format: string;
  storageKey: string | null;
  fileUrl: string | null;
  version: number;
  revision: string;
  status: string;
  fileSizeBytes: number | null;
  createdAt: string;
}

export default async function BimViewerPage() {
  const [models, projects] = await Promise.all([
    getJson<BimModel[]>('/api/engineering/bim-models'),
    getJson<Project[]>('/api/projects/projects'),
  ]);

  return (
    <div style={st.page}>
      <h1 style={st.h1}>BIM Viewer</h1>
      <p style={st.sub}>
        Federated model registry with an in-browser IFC viewer (web-ifc/WASM + WebGL). Register
        discipline models against a project, bump revisions as designs progress, and inspect any
        IFC — from a registered file URL or straight off your machine — without desktop software.
      </p>

      <BimViewerClient initialModels={models ?? []} projects={projects ?? []} />
    </div>
  );
}

const st = {
  page: { maxWidth: 1080, margin: '0 auto', padding: '28px 28px 64px' } as CSSProperties,
  h1: { fontSize: 28, margin: '0 0 6px', letterSpacing: -0.5 } as CSSProperties,
  sub: { color: 'var(--muted)', margin: '0 0 22px', maxWidth: 720, lineHeight: 1.5 } as CSSProperties,
};

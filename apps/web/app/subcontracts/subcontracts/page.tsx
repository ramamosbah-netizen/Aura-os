import type { CSSProperties } from 'react';
import { getJson } from '@/lib/api';
import SubcontractCreate from '../../../components/subcontract-create';
import SubcontractsList from '../../../components/subcontracts-list';

export const dynamic = 'force-dynamic';

interface Project {
  id: string;
  title: string;
}

interface Subcontract {
  id: string;
  projectId: string;
  projectName: string | null;
  title: string;
  subcontractorName: string;
  status: 'draft' | 'active' | 'closed';
  value: number;
  retentionPercentage: number;
  createdAt: string;
}

interface Claim {
  id: string;
  subcontractId: string;
  claimNumber: number;
  status: 'draft' | 'submitted' | 'certified' | 'paid';
  workCompletedValue: number;
  previouslyCertifiedValue: number;
  thisPeriodGrossValue: number;
  retentionWithheld: number;
  netCertifiedValue: number;
  certifiedAt: string | null;
  certifiedBy: string | null;
  createdAt: string;
}

export default async function SubcontractsPage({
  searchParams,
}: {
  searchParams?: Promise<{ projectId?: string }>;
}) {
  const query = (await searchParams) ?? {};
  const projectId = query.projectId?.trim() || '';
  const [subcontracts, projects, claims] = await Promise.all([
    getJson<Subcontract[]>(projectId ? `/api/subcontracts?projectId=${encodeURIComponent(projectId)}` : '/api/subcontracts'),
    getJson<Project[]>('/api/projects/projects'),
    getJson<Claim[]>('/api/subcontracts/claims'),
  ]);

  const online = subcontracts !== null && projects !== null && claims !== null;
  const project = projectId ? (projects ?? []).find((item) => item.id === projectId) : null;

  return (
    <div style={st.page}>
      <h1 style={st.h1}>Subcontracts</h1>
      <p style={st.sub}>
        Manage subcontractor trade agreements, track progressive valuations, and calculate 
        retaining balances (Interim Payment Certificates) connected with Delivery.
      </p>

      {projectId && (
        <section style={st.contextPanel} aria-label="Project context">
          <div>
            <span style={st.contextKicker}>Project context</span>
            <strong>{project?.title ?? 'Selected project'}</strong>
            <span style={st.contextHint}>
              {project ? 'Showing subcontract records scoped to this project.' : 'The selected project could not be resolved.'}
            </span>
          </div>
          <a href="/subcontracts/subcontracts" style={st.clearContext}>View all subcontracts</a>
        </section>
      )}

      {!online ? (
        <section style={st.panelOffline}>
          <h2 style={{ margin: 0, fontSize: 16 }}>API offline</h2>
          <p style={{ color: 'var(--muted)', margin: '6px 0 0' }}>
            Please make sure the backend API server is running.
          </p>
        </section>
      ) : (
        <>
          <SubcontractCreate projects={projects || []} initialProjectId={projectId || undefined} />
          <SubcontractsList subcontracts={subcontracts || []} claims={claims || []} />
        </>
      )}
    </div>
  );
}

const st = {
  page: { maxWidth: 980, margin: '0 auto', padding: '28px 28px 64px' } as CSSProperties,
  h1: { fontSize: 28, margin: '0 0 6px', letterSpacing: -0.5 } as CSSProperties,
  sub: { color: 'var(--muted)', margin: '0 0 22px', maxWidth: 660, lineHeight: 1.5 } as CSSProperties,
  panelOffline: {
    background: 'var(--panel)',
    border: '1px solid var(--border)',
    borderRadius: 14,
    padding: '20px 24px',
  } as CSSProperties,
  contextPanel: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
    margin: '0 0 18px',
    padding: '12px 16px',
    borderRadius: 12,
    border: '1px solid color-mix(in srgb, var(--accent) 35%, var(--border))',
    background: 'color-mix(in srgb, var(--accent) 8%, var(--panel))',
  } as CSSProperties,
  contextKicker: { display: 'block', color: 'var(--accent)', fontSize: 11, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 3 } as CSSProperties,
  contextHint: { display: 'block', color: 'var(--muted)', fontSize: 12, marginTop: 3 } as CSSProperties,
  clearContext: { color: 'var(--accent)', fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap' } as CSSProperties,
};

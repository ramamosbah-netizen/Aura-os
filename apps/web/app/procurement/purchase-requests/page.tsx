import type { CSSProperties } from 'react';
import { getJson } from '@/lib/api';
import PrList from '../../../components/pr-list';

export const dynamic = 'force-dynamic';

interface PurchaseRequest {
  id: string;
  title: string;
  reference: string | null;
  projectId: string | null;
  projectName: string | null;
  status: 'draft' | 'approved' | 'rejected';
  value: number;
  createdAt: string;
}

interface Project {
  id: string;
  title: string;
}

export default async function PurchaseRequestsPage({ searchParams }: { searchParams: Promise<{ record?: string; projectId?: string }> }) {
  const { record, projectId } = await searchParams;
  const scopedProjectId = projectId?.trim() || '';
  const [prs, projects] = await Promise.all([
    getJson<PurchaseRequest[]>(scopedProjectId ? `/api/procurement/purchase-requests?projectId=${encodeURIComponent(scopedProjectId)}` : '/api/procurement/purchase-requests'),
    getJson<Project[]>('/api/projects/projects'),
  ]);
  const project = scopedProjectId ? projects?.find((item) => item.id === scopedProjectId) : null;

  return (
    <div style={st.page}>
      <h1 style={st.h1}>Procurement · Purchase Requests</h1>
      <p style={st.sub}>
        Raise purchase requests (PRs) for materials or services. Approving a PR automatically converts
        it into a drafted Purchase Order (PO) on the main board to commit the purchase.
      </p>

      {scopedProjectId && (
        <div style={st.context}>
          <div>
            <span style={st.contextEyebrow}>Project context</span>
            <strong>{project?.title ?? 'Project unavailable'}</strong>
            <span>{project ? 'Showing purchase requests linked to this project.' : 'This project could not be found in the current tenant.'}</span>
          </div>
          <a href={`/procurement/purchase-orders?projectId=${encodeURIComponent(scopedProjectId)}`} style={st.contextLink}>View purchase orders →</a>
        </div>
      )}

      <section style={{ marginTop: 10 }}>
        {prs === null || projects === null ? (
          <p style={st.muted}>API offline.</p>
        ) : (
          <PrList initialPrs={prs} projects={projects} focusedId={record ?? ''} initialProjectId={project ? scopedProjectId : ''} />
        )}
      </section>
    </div>
  );
}

const st = {
  page: { maxWidth: 980, margin: '0 auto', padding: '28px 28px 64px' } as CSSProperties,
  h1: { fontSize: 28, margin: '0 0 6px', letterSpacing: -0.5 } as CSSProperties,
  sub: { color: 'var(--muted)', margin: '0 0 22px', maxWidth: 680, lineHeight: 1.5 } as CSSProperties,
  muted: { color: 'var(--muted)', padding: '14px 12px', margin: 0 } as CSSProperties,
  context: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 18, background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 12, padding: '12px 14px', margin: '0 0 18px' } as CSSProperties,
  contextEyebrow: { display: 'block', color: 'var(--accent)', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.7, marginBottom: 3 } as CSSProperties,
  contextLink: { color: 'var(--accent)', fontSize: 13, whiteSpace: 'nowrap' } as CSSProperties,
};

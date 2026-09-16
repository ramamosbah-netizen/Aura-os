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

interface Company {
  id: string;
  baseCurrency: string;
}

export default async function PurchaseRequestsPage({ searchParams }: { searchParams: Promise<{ record?: string; projectId?: string }> }) {
  const { record, projectId } = await searchParams;
  const scopedProjectId = projectId?.trim() || '';
  const [prs, projects, companies] = await Promise.all([
    getJson<PurchaseRequest[]>(scopedProjectId ? `/api/procurement/purchase-requests?projectId=${encodeURIComponent(scopedProjectId)}` : '/api/procurement/purchase-requests'),
    getJson<Project[]>('/api/projects/projects'),
    getJson<Company[]>('/api/admin/companies'),
  ]);
  const project = scopedProjectId ? projects?.find((item) => item.id === scopedProjectId) : null;

  /**
   * The company's own base currency — the figure on this page used to be labelled `$` while
   * `aura_companies.base_currency` said AED (gap record J3-05).
   *
   * The fallback is AED because that column is NOT NULL DEFAULT 'AED': every company HAS a base
   * currency, and the only thing that can fail here is READING it — this endpoint is admin-scoped,
   * so a Buyer's request for it is forbidden rather than empty. Falling back to the schema's own
   * default is therefore reading a known value out of band, not inventing a missing one.
   */
  const currency = companies?.[0]?.baseCurrency?.trim() || 'AED';

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
          <PrList initialPrs={prs} projects={projects} focusedId={record ?? ''} initialProjectId={project ? scopedProjectId : ''} currency={currency} />
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

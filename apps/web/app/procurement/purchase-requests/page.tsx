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

export default async function PurchaseRequestsPage() {
  const [prs, projects] = await Promise.all([
    getJson<PurchaseRequest[]>('/api/procurement/purchase-requests'),
    getJson<Project[]>('/api/projects/projects'),
  ]);

  return (
    <div style={st.page}>
      <h1 style={st.h1}>Procurement · Purchase Requests</h1>
      <p style={st.sub}>
        Raise purchase requests (PRs) for materials or services. Approving a PR automatically converts
        it into a drafted Purchase Order (PO) on the main board to commit the purchase.
      </p>

      <section style={{ marginTop: 10 }}>
        {prs === null || projects === null ? (
          <p style={st.muted}>API offline.</p>
        ) : (
          <PrList initialPrs={prs} projects={projects} />
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
};

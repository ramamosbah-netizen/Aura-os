import type { CSSProperties } from 'react';
import { getJson } from '@/lib/api';
import PoCreate from '../../../components/po-create';
import PoList from '../../../components/po-list';

export const dynamic = 'force-dynamic';

interface PurchaseOrder {
  id: string;
  title: string;
  supplierName: string | null;
  projectName: string | null;
  status: string;
  value: number;
  createdAt: string;
}

interface ProjectLite {
  id: string;
  title: string;
}

export default async function PurchaseOrdersPage({ searchParams }: { searchParams: Promise<{ projectId?: string }> }) {
  const { projectId } = await searchParams;
  const scopedProjectId = projectId?.trim() || '';
  const [pos, projects] = await Promise.all([
    getJson<PurchaseOrder[]>(scopedProjectId ? `/api/procurement/purchase-orders?projectId=${encodeURIComponent(scopedProjectId)}` : '/api/procurement/purchase-orders'),
    getJson<ProjectLite[]>('/api/projects/projects'),
  ]);
  const project = scopedProjectId ? projects?.find((item) => item.id === scopedProjectId) : null;

  return (
    <div style={st.page}>
      <h1 style={st.h1}>Procurement · Purchase orders</h1>
      <p style={st.sub}>
        Purchase orders are raised against a delivery project and a supplier — the first step of
        the spend → receive → pay loop.
      </p>

      {scopedProjectId && (
        <div style={st.context}>
          <div>
            <span style={st.contextEyebrow}>Project context</span>
            <strong>{project?.title ?? 'Project unavailable'}</strong>
            <span>{project ? 'Showing purchase orders linked to this project.' : 'This project could not be found in the current tenant.'}</span>
          </div>
          <a href={`/procurement/purchase-requests?projectId=${encodeURIComponent(scopedProjectId)}`} style={st.contextLink}>View purchase requests →</a>
        </div>
      )}

      <PoCreate projects={(projects ?? []).map((p) => ({ id: p.id, title: p.title }))} initialProjectId={project ? scopedProjectId : ''} />

      {pos === null ? (
        <section style={st.panel}><p style={st.muted}>API offline.</p></section>
      ) : (
        <PoList initialPos={pos} />
      )}
    </div>
  );
}

const st = {
  page: { maxWidth: 980, margin: '0 auto', padding: '28px 28px 64px' } as CSSProperties,
  h1: { fontSize: 28, margin: '0 0 6px', letterSpacing: -0.5 } as CSSProperties,
  sub: { color: 'var(--muted)', margin: '0 0 22px', maxWidth: 660, lineHeight: 1.5 } as CSSProperties,
  code: {
    fontFamily: 'ui-monospace, monospace',
    fontSize: 12.5,
    background: 'var(--panel-2)',
    border: '1px solid var(--border)',
    borderRadius: 5,
    padding: '1px 5px',
  } as CSSProperties,
  panel: { background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 14, padding: '8px 8px' } as CSSProperties,
  muted: { color: 'var(--muted)', padding: '14px 12px', margin: 0 } as CSSProperties,
  context: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 18, background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 12, padding: '12px 14px', margin: '0 0 18px' } as CSSProperties,
  contextEyebrow: { display: 'block', color: 'var(--accent)', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.7, marginBottom: 3 } as CSSProperties,
  contextLink: { color: 'var(--accent)', fontSize: 13, whiteSpace: 'nowrap' } as CSSProperties,
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 13.5 } as CSSProperties,
  th: {
    textAlign: 'left',
    color: 'var(--muted)',
    fontWeight: 500,
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    padding: '10px 12px',
    borderBottom: '1px solid var(--border)',
  } as CSSProperties,
  td: { padding: '11px 12px', borderBottom: '1px solid var(--border)' } as CSSProperties,
  tdMuted: { padding: '11px 12px', borderBottom: '1px solid var(--border)', color: 'var(--muted)' } as CSSProperties,
  tag: {
    fontSize: 12,
    background: 'var(--panel-2)',
    border: '1px solid var(--border)',
    borderRadius: 6,
    padding: '2px 8px',
    textTransform: 'capitalize',
  } as CSSProperties,
};

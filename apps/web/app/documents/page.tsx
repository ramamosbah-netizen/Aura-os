import type { CSSProperties } from 'react';
import EmptyState from '@/components/ui/empty-state';
import DocumentFileLink from '@/components/document-file-link';
import type { Document } from '@aura/shared';
import { getJson } from '@/lib/api';

export const dynamic = 'force-dynamic';

function fmt(iso: string): string {
  return new Date(iso).toLocaleString();
}

export default async function DocumentsPage({ searchParams }: { searchParams: Promise<{ record?: string }> }) {
  const { record } = await searchParams;
  const docs = await getJson<Document[]>('/api/documents');
  const orderedDocs = docs ? [...docs].sort((a, b) => Number(b.id === record) - Number(a.id === record)) : null;

  return (
    <div style={st.page}>
      <h1 style={st.h1}>Documents</h1>
      <p style={st.sub}>
        Versioned documents — each linked to the record it belongs to, with a full change
        history.
      </p>
      <section style={st.panel}>
        {orderedDocs === null ? (
          <p style={st.muted}>API offline.</p>
        ) : orderedDocs.length === 0 ? (
          <EmptyState compact title="No documents yet" description="Upload or generate documents to build the register." />
        ) : (
          <table style={st.table}>
            <thead>
              <tr>
                {['Title', 'Kind', 'Ver', 'Linked to', 'Created'].map((h) => (
                  <th key={h} style={st.th}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {orderedDocs.map((d) => (
                <tr key={d.id} id={`document-${d.id}`} style={d.id === record ? st.focused : undefined}>
                  <td style={st.td}>
                    <span style={st.titleCell}><span>{d.title}</span><DocumentFileLink documentId={d.id} title={d.title} /></span>
                  </td>
                  <td style={st.td}>
                    <span style={st.tag}>{d.kind}</span>
                  </td>
                  <td style={st.td}>v{d.currentVersion}</td>
                  <td style={st.tdMuted}>
                    {d.aggregateType}:{d.aggregateId}
                  </td>
                  <td style={st.tdMuted}>{fmt(d.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

const st = {
  page: { maxWidth: 980, margin: '0 auto', padding: '28px 28px 64px' } as CSSProperties,
  h1: { fontSize: 28, margin: '0 0 6px', letterSpacing: -0.5 } as CSSProperties,
  sub: { color: 'var(--muted)', margin: '0 0 24px', maxWidth: 620, lineHeight: 1.5 } as CSSProperties,
  panel: {
    background: 'var(--panel)',
    border: '1px solid var(--border)',
    borderRadius: 14,
    padding: '8px 8px',
  } as CSSProperties,
  muted: { color: 'var(--muted)', padding: '14px 12px', margin: 0 } as CSSProperties,
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
  titleCell: { alignItems: 'center', display: 'flex', gap: 10, justifyContent: 'space-between' } as CSSProperties,
  tdMuted: { padding: '11px 12px', borderBottom: '1px solid var(--border)', color: 'var(--muted)' } as CSSProperties,
  tag: {
    fontSize: 12,
    background: 'var(--panel-2)',
    border: '1px solid var(--border)',
    borderRadius: 6,
    padding: '2px 8px',
  } as CSSProperties,
  focused: { background: 'color-mix(in srgb, var(--accent) 10%, transparent)', outline: '1px solid var(--accent)', outlineOffset: -1 } as CSSProperties,
};

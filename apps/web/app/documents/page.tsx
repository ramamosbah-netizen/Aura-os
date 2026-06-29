import type { CSSProperties } from 'react';
import type { Document } from '@aura/shared';
import { getJson } from '@/lib/api';

export const dynamic = 'force-dynamic';

function fmt(iso: string): string {
  return new Date(iso).toLocaleString();
}

export default async function DocumentsPage() {
  const docs = await getJson<Document[]>('/api/documents');

  return (
    <div style={st.page}>
      <h1 style={st.h1}>Documents</h1>
      <p style={st.sub}>
        Versioned documents in the DMS — each linked to an aggregate, every change emitted on the
        event spine.
      </p>
      <section style={st.panel}>
        {docs === null ? (
          <p style={st.muted}>API offline.</p>
        ) : docs.length === 0 ? (
          <p style={st.muted}>No documents yet.</p>
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
              {docs.map((d) => (
                <tr key={d.id}>
                  <td style={st.td}>{d.title}</td>
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
  tdMuted: { padding: '11px 12px', borderBottom: '1px solid var(--border)', color: 'var(--muted)' } as CSSProperties,
  tag: {
    fontSize: 12,
    background: 'var(--panel-2)',
    border: '1px solid var(--border)',
    borderRadius: 6,
    padding: '2px 8px',
  } as CSSProperties,
};

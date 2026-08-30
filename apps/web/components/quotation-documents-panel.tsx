'use client';

import { type CSSProperties, useEffect, useState } from 'react';
import DocumentFileLink from './document-file-link';

interface QuotationDocument {
  id: string;
  kind: string;
  title: string;
  aggregateId: string;
  createdBy: string | null;
}

/** Record-scoped DMS context. Document lifecycle, sharing and versioning remain DMS-owned; this
 * panel only shows documents attached to the quotation and links to the source document control. */
export default function QuotationDocumentsPanel({ quotationId }: { quotationId: string }) {
  const [documents, setDocuments] = useState<QuotationDocument[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void fetch(`/api/documents?aggregateType=crm.quotation&aggregateId=${encodeURIComponent(quotationId)}`, { cache: 'no-store' })
      .then(async (res) => {
        if (!res.ok) throw new Error('document service unavailable');
        const rows = await res.json();
        if (alive) setDocuments(Array.isArray(rows) ? rows : []);
      })
      .catch(() => { if (alive) { setError('Could not load quotation documents.'); setDocuments([]); } });
    return () => { alive = false; };
  }, [quotationId]);

  if (documents === null) return <p style={st.muted}>Loading quotation documents…</p>;
  return (
    <div>
      <div style={st.head}>
        <b>Documents for this quotation</b>
        <a href="/documents/control" style={st.link}>Open Document Control →</a>
      </div>
      {error && <p style={st.error}>{error}</p>}
      {documents.length === 0
        ? <p style={st.muted}>No documents are attached to this quotation yet. Attach and govern them in Document Control.</p>
        : (
          <ul style={st.list}>
            {documents.map((document) => (
              <li key={document.id} style={st.row}>
                <span><b>{document.title}</b><small style={st.kind}>{document.kind}</small></span>
                <DocumentFileLink documentId={document.id} title={document.title} />
              </li>
            ))}
          </ul>
        )}
    </div>
  );
}

const st = {
  head: { display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 12, fontSize: 13.5 } as CSSProperties,
  list: { listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 8 } as CSSProperties,
  row: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--panel-2)' } as CSSProperties,
  kind: { display: 'block', color: 'var(--muted)', fontSize: 11.5, marginTop: 3 } as CSSProperties,
  muted: { color: 'var(--muted)', fontSize: 12.5, lineHeight: 1.5 } as CSSProperties,
  error: { color: 'var(--bad)', fontSize: 12.5 } as CSSProperties,
  link: { color: 'var(--accent)', textDecoration: 'none', fontSize: 12.5 } as CSSProperties,
};

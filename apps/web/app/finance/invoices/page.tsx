import type { CSSProperties } from 'react';
import { getJson } from '../../../lib/api';
import InvoiceCreate from '../../../components/invoice-create';

export const dynamic = 'force-dynamic';

interface Invoice {
  id: string;
  title: string;
  poTitle: string | null;
  supplierName: string | null;
  projectName: string | null;
  status: string;
  value: number;
  createdAt: string;
}

interface PoLite {
  id: string;
  title: string;
  supplierName: string | null;
  projectId: string | null;
  projectName: string | null;
  value: number;
}

function money(n: number): string {
  return n ? n.toLocaleString(undefined, { maximumFractionDigits: 0 }) : '—';
}

function fmt(iso: string): string {
  return new Date(iso).toLocaleDateString();
}

export default async function InvoicesPage() {
  // Closing the operate loop: invoices from our own API, and the "against PO" options from
  // the Procurement API (status=received) — each PO carries supplier + project, so an
  // invoice inherits both (PO ← Project, no joins).
  const [invoices, pos] = await Promise.all([
    getJson<Invoice[]>('/api/finance/invoices'),
    getJson<PoLite[]>('/api/procurement/purchase-orders?status=received'),
  ]);

  return (
    <div style={st.page}>
      <h1 style={st.h1}>Finance · Invoices</h1>
      <p style={st.sub}>
        The pay step — a supplier invoice bills against a <strong>received PO</strong>, inheriting its
        supplier + project, and emits <code style={st.code}>finance.invoice.created</code> on the spine.
        Closes the operate loop: spend → receive → pay.
      </p>

      <InvoiceCreate
        pos={(pos ?? []).map((p) => ({
          id: p.id,
          title: p.title,
          supplierName: p.supplierName,
          projectId: p.projectId,
          projectName: p.projectName,
          value: p.value,
        }))}
      />

      <section style={st.panel}>
        {invoices === null ? (
          <p style={st.muted}>API offline.</p>
        ) : invoices.length === 0 ? (
          <p style={st.muted}>No invoices yet — raise one against a received PO above.</p>
        ) : (
          <table style={st.table}>
            <thead>
              <tr>
                {['Invoice', 'Against PO', 'Supplier', 'Project', 'Status', 'Value', 'Created'].map((h) => (
                  <th key={h} style={st.th}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv) => (
                <tr key={inv.id}>
                  <td style={st.td}>{inv.title}</td>
                  <td style={st.tdMuted}>{inv.poTitle ?? '—'}</td>
                  <td style={st.tdMuted}>{inv.supplierName ?? '—'}</td>
                  <td style={st.tdMuted}>{inv.projectName ?? '—'}</td>
                  <td style={st.td}>
                    <span style={st.tag}>{inv.status}</span>
                  </td>
                  <td style={st.td}>{money(inv.value)}</td>
                  <td style={st.tdMuted}>{fmt(inv.createdAt)}</td>
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
  sub: { color: 'var(--muted)', margin: '0 0 22px', maxWidth: 680, lineHeight: 1.5 } as CSSProperties,
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

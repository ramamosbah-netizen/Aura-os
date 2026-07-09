import type { CSSProperties } from 'react';
import { getJson } from '@/lib/api';
import InvoiceCreate from '../../../components/invoice-create';
import InvoicesList from '../../../components/invoices-list';

export const dynamic = 'force-dynamic';

interface Invoice {
  id: string;
  title: string;
  poId: string | null;
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
  status: string;
  supplierName: string | null;
  projectId: string | null;
  projectName: string | null;
  value: number;
}

interface GoodsReceipt {
  id: string;
  poId: string | null;
  status: string;
  value: number;
}

interface Account {
  id: string;
  code: string;
  name: string;
  type: string;
}

export default async function InvoicesPage() {
  // Closing the operate loop: invoices from our own API, and the "against PO" options from
  // the Procurement API (status=received) — each PO carries supplier + project, so an
  // invoice inherits both (PO ← Project, no joins).
  const [invoices, pos, grns, bankAccounts] = await Promise.all([
    getJson<Invoice[]>('/api/finance/invoices'),
    getJson<PoLite[]>('/api/procurement/purchase-orders'),
    getJson<GoodsReceipt[]>('/api/inventory/grns'),
    getJson<Account[]>('/api/finance/accounts?type=asset'),
  ]);

  return (
    <div style={st.page}>
      <h1 style={st.h1}>Finance · Invoices</h1>
      <p style={st.sub}>
        The pay step — a supplier invoice bills against a <strong>received PO</strong> and inherits
        its supplier and project. Closes the loop: spend → receive → pay.{' '}
        <a href="/api/finance/invoices/csv" style={{ color: 'var(--accent)', fontWeight: 700, fontSize: 12.5 }}>
          ⬇ Download CSV
        </a>
      </p>

      <InvoiceCreate
        pos={(pos ?? []).filter((p) => p.status === 'received').map((p) => ({
          id: p.id,
          title: p.title,
          supplierName: p.supplierName,
          projectId: p.projectId,
          projectName: p.projectName,
          value: p.value,
        }))}
      />

      <section style={{ marginTop: 20 }}>
        {invoices === null ? (
          <p style={st.muted}>API offline.</p>
        ) : (
          <InvoicesList
            invoices={invoices}
            bankAccounts={bankAccounts ?? []}
            pos={pos ?? []}
            grns={grns ?? []}
          />
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
  muted: { color: 'var(--muted)', padding: '14px 12px', margin: 0 } as CSSProperties,
};

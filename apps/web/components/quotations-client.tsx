'use client';

import { type CSSProperties, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import ExportButton from './export-button';
import { EntityForm } from './form-engine';

interface Line { description: string; quantity: number; unitPrice: number; vatRate: number; lineNet: number; lineVat: number }
interface Quotation {
  id: string;
  quoteNumber: string;
  customerName: string;
  issueDate: string;
  validUntil: string | null;
  subtotal: number;
  vatTotal: number;
  total: number;
  status: string;
  lines: Line[];
}

const badgeKind: Record<string, string> = { draft: 'badge', sent: 'badge badge-accent', accepted: 'badge badge-good', rejected: 'badge badge-bad', expired: 'badge badge-warn' };

export default function QuotationsClient({ initialQuotations }: { initialQuotations: Quotation[] }) {
  const router = useRouter();
  const quotes = initialQuotations;
  const [error, setError] = useState('');

  const totals = useMemo(() => {
    const open = quotes.filter((q) => q.status === 'sent').reduce((s, q) => s + q.total, 0);
    const won = quotes.filter((q) => q.status === 'accepted').reduce((s, q) => s + q.total, 0);
    return { open, won };
  }, [quotes]);

  const act = async (id: string, action: string) => {
    setError('');
    try {
      const res = await fetch(`/api/crm/quotations/${id}/status`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || data.error || 'Failed');
      router.refresh();
    } catch (e) { setError((e as Error).message); }
  };

  return (
    <>
      <div style={st.cards}>
        <div style={st.card}><div style={st.cardLabel}>Open (sent)</div><div style={st.cardVal}>{totals.open.toLocaleString()} AED</div></div>
        <div style={st.card}><div style={st.cardLabel}>Won (accepted)</div><div style={{ ...st.cardVal, color: 'var(--good)' }}>{totals.won.toLocaleString()} AED</div></div>
      </div>

      <div style={st.toolbar}>
        <EntityForm id="crm.quotation" />
        <ExportButton filename="quotations" rows={quotes as unknown as Array<Record<string, unknown>>}
          columns={[{ key: 'quoteNumber' }, { key: 'customerName' }, { key: 'issueDate' }, { key: 'total' }, { key: 'status' }]} />
        {error && <span style={st.err}>{error}</span>}
      </div>

      {quotes.length === 0 ? (
        <p style={st.muted}>No quotations yet — create the first one.</p>
      ) : (
        <section className="panel">
          <table className="data-table">
            <thead><tr><th>Date</th><th>Quote #</th><th>Customer</th><th>Total</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>
              {quotes.map((q) => (
                <tr key={q.id}>
                  <td style={{ color: 'var(--muted)' }}>{q.issueDate}</td>
                  <td style={{ fontWeight: 600 }}>{q.quoteNumber}</td>
                  <td>{q.customerName}</td>
                  <td>{q.total.toLocaleString()}</td>
                  <td><span className={badgeKind[q.status] ?? 'badge'}>{q.status}</span></td>
                  <td style={{ display: 'flex', gap: 6 }}>
                    {q.status === 'draft' && <button type="button" className="btn btn-primary" style={st.smBtn} onClick={() => act(q.id, 'send')}>Send</button>}
                    {q.status === 'sent' && <button type="button" className="btn" style={{ ...st.smBtn, color: 'var(--good)' }} onClick={() => act(q.id, 'accept')}>Accept</button>}
                    {q.status === 'sent' && <button type="button" className="btn" style={{ ...st.smBtn, color: 'var(--bad)' }} onClick={() => act(q.id, 'reject')}>Reject</button>}
                    {(q.status === 'draft' || q.status === 'sent') && <button type="button" className="btn btn-ghost" style={st.smBtn} onClick={() => act(q.id, 'expire')}>Expire</button>}
                    <EntityForm
                      id="crm.quotation"
                      mode="clone"
                      initialValues={{ quoteNumber: `${q.quoteNumber}-R`, customerName: q.customerName }}
                      initialLines={{ lines: q.lines.map((l) => ({ description: l.description, quantity: l.quantity, unitPrice: l.unitPrice, vatRate: l.vatRate })) }}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </>
  );
}

const st = {
  cards: { display: 'flex', gap: 14, marginBottom: 18 } as CSSProperties,
  card: { padding: '14px 18px', borderRadius: 12, border: '1px solid var(--border)', background: 'var(--panel)', minWidth: 180 } as CSSProperties,
  cardLabel: { fontSize: 11.5, color: 'var(--muted)', textTransform: 'uppercase' as const, letterSpacing: 0.5 } as CSSProperties,
  cardVal: { fontSize: 22, fontWeight: 700, marginTop: 4 } as CSSProperties,
  toolbar: { display: 'flex', gap: 10, alignItems: 'center', marginBottom: 16 } as CSSProperties,
  smBtn: { padding: '5px 12px', fontSize: 12.5 } as CSSProperties,
  err: { color: 'var(--bad)', fontSize: 13 } as CSSProperties,
  muted: { color: 'var(--muted)', padding: '14px 0' } as CSSProperties,
};

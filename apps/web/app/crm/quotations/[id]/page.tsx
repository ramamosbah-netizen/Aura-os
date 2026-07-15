import type { CSSProperties } from 'react';
import { getJson } from '@/lib/api';

export const dynamic = 'force-dynamic';

interface Line { description: string; quantity: number; unitPrice: number; vatRate: number; lineNet: number; lineVat: number }
interface Quotation {
  id: string; quoteNumber: string; customerName: string; accountId: string | null; contactName: string | null;
  ownerId: string | null; terms: string | null; revision: number; status: string;
  sourceTenderId: string | null; sourceOpportunityId: string | null; convertedContractId: string | null;
  issueDate: string; validUntil: string | null; lines: Line[]; subtotal: number; vatTotal: number; total: number;
  pricing: { unitCosts: number[] } | null;
}

const money = (n: number): string => `AED ${Number(n).toLocaleString('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const STATUS_TONE: Record<string, string> = {
  accepted: 'var(--good)', sent: 'var(--accent)', rejected: 'var(--bad)', expired: 'var(--bad)',
  cancelled: 'var(--muted)', revised: 'var(--muted)',
};

export default async function QuotationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const q = await getJson<Quotation>(`/api/crm/quotations/${id}`);
  if (!q) return <div style={{ padding: 40 }}>Quotation not found or API offline.</div>;
  const revisions = (await getJson<Quotation[]>(`/api/crm/quotations/${id}/revisions`)) ?? [];

  return (
    <div style={st.page}>
      <div style={st.breadcrumb}><a href="/crm/quotations" style={st.link}>Quotations</a> · {q.quoteNumber}</div>

      <header style={st.head}>
        <div>
          <h1 style={st.h1}>{q.quoteNumber} <span style={st.rev}>Rev {q.revision}</span></h1>
          <div style={st.sub}>
            {q.accountId ? <a href={`/crm/accounts/${q.accountId}`} style={st.link}>{q.customerName}</a> : q.customerName}
            {q.contactName ? ` · ${q.contactName}` : ''}
          </div>
        </div>
        <div style={st.headRight}>
          <span style={{ ...st.status, color: STATUS_TONE[q.status] ?? 'var(--fg)' }}>{q.status.replace('_', ' ')}</span>
          <div style={st.actions}>
            <a href={`/crm/quotations/${q.id}/print`} style={st.btnPrimary} target="_blank" rel="noreferrer">⭳ Export PDF</a>
            <a href={`/crm/quotations/${q.id}/pricing`} style={st.btn}>⊞ Pricing sheet</a>
          </div>
        </div>
      </header>

      <div style={st.metaRow}>
        <Meta label="Issue date" value={q.issueDate} />
        <Meta label="Valid until" value={q.validUntil ?? '—'} />
        <Meta label="Owner" value={q.ownerId ?? '—'} />
        <Meta label="Total" value={money(q.total)} strong />
        {q.sourceTenderId && <Meta label="Source" value="Tender pricing" href={`/tendering/tenders/${q.sourceTenderId}/pricing`} />}
        {q.convertedContractId && <Meta label="Contract" value="Awarded →" href={`/contracts/contracts/${q.convertedContractId}`} />}
      </div>

      {revisions.length > 1 && (
        <section style={st.card}>
          <div style={st.cardTitle}>Revision history</div>
          <div style={st.revChain}>
            {revisions.map((r) => (
              <a key={r.id} href={`/crm/quotations/${r.id}`}
                style={{ ...st.revChip, ...(r.id === q.id ? st.revChipActive : {}), color: r.id === q.id ? 'var(--accent)' : 'var(--fg)' }}>
                <b>Rev {r.revision}</b>
                <span style={st.revChipMeta}>{r.status.replace('_', ' ')} · {money(r.total)}</span>
              </a>
            ))}
          </div>
        </section>
      )}

      <section style={st.card}>
        <div style={st.cardTitle}>Line items</div>
        <div style={{ overflowX: 'auto' }}>
          <table style={st.table}>
            <thead><tr>{['Description', 'Qty', 'Unit price', 'VAT %', 'Net'].map((h, i) => (
              <th key={h} style={{ ...st.th, textAlign: i === 0 ? 'left' : 'right' }}>{h}</th>
            ))}</tr></thead>
            <tbody>
              {q.lines.map((l, i) => (
                <tr key={i}>
                  <td style={st.td}>{l.description}</td>
                  <td style={st.tdR}>{l.quantity}</td>
                  <td style={st.tdR}>{money(l.unitPrice)}</td>
                  <td style={st.tdR}>{l.vatRate}%</td>
                  <td style={st.tdR}>{money(l.lineNet)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr><td colSpan={4} style={st.tfLabel}>Subtotal</td><td style={st.tdR}>{money(q.subtotal)}</td></tr>
              <tr><td colSpan={4} style={st.tfLabel}>VAT</td><td style={st.tdR}>{money(q.vatTotal)}</td></tr>
              <tr><td colSpan={4} style={{ ...st.tfLabel, fontWeight: 800 }}>Total</td><td style={{ ...st.tdR, fontWeight: 800 }}>{money(q.total)}</td></tr>
            </tfoot>
          </table>
        </div>
      </section>

      {q.terms && (
        <section style={st.card}>
          <div style={st.cardTitle}>Commercial terms</div>
          <p style={st.terms}>{q.terms}</p>
        </section>
      )}
    </div>
  );
}

function Meta({ label, value, href, strong }: { label: string; value: string; href?: string; strong?: boolean }) {
  return (
    <div style={st.meta}>
      <div style={st.metaLabel}>{label}</div>
      <div style={{ ...st.metaValue, ...(strong ? { fontWeight: 800 } : {}) }}>
        {href ? <a href={href} style={st.link}>{value}</a> : value}
      </div>
    </div>
  );
}

const st: Record<string, CSSProperties> = {
  page: { maxWidth: 1000, margin: '0 auto', padding: '24px 28px 64px' },
  breadcrumb: { fontSize: 12.5, color: 'var(--muted)', marginBottom: 14 },
  link: { color: 'var(--accent)', textDecoration: 'none', fontWeight: 600 },
  head: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap', marginBottom: 16 },
  h1: { fontSize: 26, margin: '0 0 4px', letterSpacing: -0.5 },
  rev: { fontSize: 14, fontWeight: 700, color: 'var(--muted)', marginLeft: 6 },
  sub: { fontSize: 13.5, color: 'var(--muted)' },
  headRight: { display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 10 },
  status: { fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.6 },
  actions: { display: 'flex', gap: 8 },
  btn: { border: '1px solid var(--border)', borderRadius: 9, padding: '8px 13px', fontSize: 12.5, fontWeight: 600, color: 'var(--fg)', background: 'var(--panel)', textDecoration: 'none' },
  btnPrimary: { border: '1px solid var(--accent)', borderRadius: 9, padding: '8px 13px', fontSize: 12.5, fontWeight: 700, color: 'var(--accent)', background: 'transparent', textDecoration: 'none' },
  metaRow: { display: 'flex', flexWrap: 'wrap', gap: 22, padding: '14px 18px', border: '1px solid var(--border)', borderRadius: 12, background: 'var(--panel)', marginBottom: 16 },
  meta: { minWidth: 90 },
  metaLabel: { fontSize: 10.5, textTransform: 'uppercase', letterSpacing: 0.6, color: 'var(--muted)', marginBottom: 3 },
  metaValue: { fontSize: 13.5 },
  card: { border: '1px solid var(--border)', borderRadius: 12, padding: '14px 16px', background: 'var(--panel)', marginBottom: 16 },
  cardTitle: { fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.8, color: 'var(--accent)', fontWeight: 800, marginBottom: 10 },
  revChain: { display: 'flex', gap: 8, flexWrap: 'wrap' },
  revChip: { display: 'flex', flexDirection: 'column', gap: 2, border: '1px solid var(--border)', borderRadius: 9, padding: '7px 11px', textDecoration: 'none', minWidth: 92 },
  revChipActive: { borderColor: 'var(--accent)', background: 'var(--panel-2, var(--panel))' },
  revChipMeta: { fontSize: 11, color: 'var(--muted)' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 13 },
  th: { padding: '7px 8px', borderBottom: '1px solid var(--border)', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--muted)' },
  td: { padding: '8px', borderBottom: '1px solid var(--border)' },
  tdR: { padding: '8px', borderBottom: '1px solid var(--border)', textAlign: 'right', whiteSpace: 'nowrap' },
  tfLabel: { padding: '8px', textAlign: 'right', color: 'var(--muted)' },
  terms: { fontSize: 13, color: 'var(--fg)', margin: 0, whiteSpace: 'pre-wrap', lineHeight: 1.55 },
};

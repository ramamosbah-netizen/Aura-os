'use client';

import { type CSSProperties, useEffect, useState } from 'react';
import { DISPLAY_LOCALE, DISPLAY_TIME_ZONE } from '@/lib/locale';

interface Figures { quantity: number; unitPrice: number; lineTotal: number; directCost: number | null; sellingRate: number | null }
interface Row { key: string; description: string; from: Figures | null; to: Figures | null; delta: number }
interface Decision { by: string | null; at: string; reason: string }
interface Side {
  id: string; revision: number; status: string; total: number;
  approvedBy: string | null; approvedAt: string | null; returned: Decision[]; revised: Decision[];
}
interface Comparison { quoteNumber: string; from: Side; to: Side; rows: Row[]; totalDelta: number }
interface Revision { id: string; revision: number; status: string }

const money = (n: number | null | undefined): string => (n === null || n === undefined ? '—' : new Intl.NumberFormat(DISPLAY_LOCALE, { maximumFractionDigits: 2 }).format(n));
const signed = (n: number): string => (n > 0 ? `+${money(n)}` : money(n));
const when = (iso: string): string => new Date(iso).toLocaleString(DISPLAY_LOCALE, { dateStyle: 'medium', timeStyle: 'short', timeZone: DISPLAY_TIME_ZONE });

/**
 * TWO REVISIONS OF ONE OFFER, SIDE BY SIDE (EST-16).
 *
 * Every figure is the server's, computed from the two immutable revision records — quantity, price
 * and line total per BOQ item, the direct cost and selling rate from each revision's frozen cost
 * build-up, the totals and the difference. Beside them, the decisions each revision carries: who
 * approved it, who returned it and why, and why it was revised. Nothing is recalculated here.
 */
export default function QuotationRevisionCompare({ quotationId, revisions }: { quotationId: string; revisions: Revision[] }) {
  const ordered = [...revisions].sort((a, b) => a.revision - b.revision);
  const self = ordered.find((r) => r.id === quotationId);
  const fallback = self ? (ordered.filter((r) => r.revision < self.revision).pop() ?? ordered.find((r) => r.id !== quotationId)) : undefined;
  const [otherId, setOtherId] = useState<string>(fallback?.id ?? '');
  const [data, setData] = useState<Comparison | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!otherId) return;
    let live = true;
    setError(null);
    void fetch(`/api/crm/quotations/${encodeURIComponent(quotationId)}/compare?with=${encodeURIComponent(otherId)}`, { cache: 'no-store' })
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (!live) return;
        if (!res.ok) { setData(null); setError(body.message ?? body.error ?? 'The comparison could not be read.'); return; }
        setData(body as Comparison);
      })
      .catch(() => { if (live) setError('The comparison could not be read.'); });
    return () => { live = false; };
  }, [quotationId, otherId]);

  if (!self || ordered.length < 2) return null;
  const others = ordered.filter((r) => r.id !== quotationId);

  return (
    <div data-testid="revision-compare" style={st.wrap}>
      <div style={st.head}>
        <b>Compare Rev {self.revision} with</b>
        <select data-testid="revision-compare-with" value={otherId} onChange={(e) => setOtherId(e.target.value)} style={st.select}>
          {others.map((r) => <option key={r.id} value={r.id}>Rev {r.revision} · {r.status.replaceAll('_', ' ')}</option>)}
        </select>
      </div>
      {error && <p role="alert" style={st.err}>{error}</p>}
      {data && (
        <>
          <div style={{ overflowX: 'auto' }}>
            <table style={st.table}>
              <thead>
                <tr>
                  <th style={st.th}>BOQ item</th>
                  {[data.from, data.to].map((s) => (
                    <th key={s.id} style={st.th} colSpan={5}>Rev {s.revision} · {s.status.replaceAll('_', ' ')}</th>
                  ))}
                  <th style={st.th}>Δ line total</th>
                </tr>
                <tr>
                  <th style={st.th} />
                  {[0, 1].map((i) => (
                    <FragmentCells key={i} cells={['Qty', 'Direct cost', 'Selling rate', 'Unit price', 'Line total']} />
                  ))}
                  <th style={st.th} />
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r) => (
                  <tr key={r.key} data-testid="revision-compare-row" data-item={r.key}>
                    <td style={st.td}>{r.description}</td>
                    {[r.from, r.to].map((f, i) => (
                      <FragmentCells key={i} data cells={f ? [money(f.quantity), money(f.directCost), money(f.sellingRate), money(f.unitPrice), money(f.lineTotal)] : ['—', '—', '—', '—', '—']} />
                    ))}
                    <td style={{ ...st.td, fontWeight: 700, color: r.delta < 0 ? 'var(--good, #15803d)' : r.delta > 0 ? 'var(--bad, #b91c1c)' : 'inherit' }}>{signed(r.delta)}</td>
                  </tr>
                ))}
                <tr data-testid="revision-compare-total">
                  <td style={{ ...st.td, fontWeight: 700 }}>Total incl. VAT</td>
                  <td style={{ ...st.td, fontWeight: 700 }} colSpan={5}>{money(data.from.total)}</td>
                  <td style={{ ...st.td, fontWeight: 700 }} colSpan={5}>{money(data.to.total)}</td>
                  <td style={{ ...st.td, fontWeight: 700 }}>{signed(data.totalDelta)}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div data-testid="revision-compare-decisions" style={st.decisions}>
            {[data.from, data.to].map((s) => (
              <div key={s.id} style={st.side}>
                <b>Rev {s.revision} — decisions</b>
                {s.approvedBy && s.approvedAt && <div>Approved by {s.approvedBy} · {when(s.approvedAt)}</div>}
                {s.returned.map((d, i) => <div key={`r${i}`}>Returned by {d.by ?? 'unknown'} · {when(d.at)} — {d.reason}</div>)}
                {s.revised.map((d, i) => <div key={`v${i}`}>Revised by {d.by ?? 'unknown'} · {when(d.at)} — {d.reason}</div>)}
                {!s.approvedBy && s.returned.length === 0 && s.revised.length === 0 && <div style={{ color: 'var(--muted)' }}>No decision recorded on this revision.</div>}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function FragmentCells({ cells, data }: { cells: string[]; data?: boolean }) {
  return <>{cells.map((c, i) => (data ? <td key={i} style={st.td}>{c}</td> : <th key={i} style={st.th}>{c}</th>))}</>;
}

const st: Record<string, CSSProperties> = {
  wrap: { marginTop: 14, display: 'grid', gap: 10 },
  head: { display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' },
  select: { padding: '4px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 12.5 },
  th: { textAlign: 'left', padding: '6px 8px', borderBottom: '1px solid var(--border)', color: 'var(--muted)', fontWeight: 600, whiteSpace: 'nowrap' },
  td: { padding: '6px 8px', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' },
  decisions: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 10, fontSize: 12.5 },
  side: { display: 'grid', gap: 4, padding: 10, border: '1px solid var(--border)', borderRadius: 8 },
  err: { color: 'var(--bad, #b91c1c)', margin: 0 },
};

'use client';

import { type CSSProperties, useEffect, useState } from 'react';

interface Subcontract {
  id: string;
  title: string;
  subcontractorName: string;
  status: 'draft' | 'active' | 'closed';
}

interface BackCharge {
  id: string;
  subcontractId: string;
  subcontractorName: string | null;
  reference: string;
  category: string;
  description: string;
  grossAmount: number;
  markupPercent: number;
  markupAmount: number;
  recoverableAmount: number;
  recoveredAmount: number;
  outstandingAmount: number;
  status: 'raised' | 'agreed' | 'disputed' | 'recovered' | 'written_off';
  createdAt: string;
}

interface Summary {
  count: number;
  totalGross: number;
  totalMarkup: number;
  totalRecoverable: number;
  totalRecovered: number;
  totalOutstanding: number;
}

const CATEGORIES = ['materials', 'plant', 'labour', 'rectification', 'attendance', 'other'] as const;

function money(n: number): string {
  return new Intl.NumberFormat('en-AE', { style: 'currency', currency: 'AED', maximumFractionDigits: 0 }).format(n);
}

export default function BackChargesClient({ subcontracts, initialBackCharges }: { subcontracts: Subcontract[]; initialBackCharges: BackCharge[] }) {
  const [backCharges, setBackCharges] = useState<BackCharge[]>(initialBackCharges);
  const [subcontractId, setSubcontractId] = useState('');
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>('materials');
  const [description, setDescription] = useState('');
  const [grossAmount, setGrossAmount] = useState('');
  const [markupPercent, setMarkupPercent] = useState('10');
  const [summary, setSummary] = useState<Summary | null>(null);
  const [err, setErr] = useState('');

  async function refresh(): Promise<void> {
    const res = await fetch('/api/subcontracts/back-charges');
    if (res.ok) setBackCharges(await res.json());
  }

  async function loadSummary(): Promise<void> {
    const res = await fetch('/api/subcontracts/back-charges/summary');
    if (res.ok) setSummary(await res.json());
  }

  useEffect(() => {
    loadSummary();
  }, [backCharges]);

  async function create(): Promise<void> {
    setErr('');
    if (!subcontractId) { setErr('Select a subcontract.'); return; }
    if (!description.trim()) { setErr('Enter a description.'); return; }
    if (!(Number(grossAmount) > 0)) { setErr('Enter a positive gross amount.'); return; }

    const res = await fetch('/api/subcontracts/back-charges', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        subcontractId,
        category,
        description: description.trim(),
        grossAmount: Number(grossAmount),
        markupPercent: markupPercent ? Number(markupPercent) : 0,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setErr(data.message ?? data.error ?? 'Create failed');
      return;
    }
    setDescription('');
    setGrossAmount('');
    await refresh();
  }

  async function setStatus(id: string, status: string): Promise<void> {
    const res = await fetch(`/api/subcontracts/back-charges/${id}/status`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setErr(data.message ?? data.error ?? 'Update failed');
      return;
    }
    setErr('');
    await refresh();
  }

  async function recover(bc: BackCharge): Promise<void> {
    const raw = window.prompt(`Recover from ${bc.reference} (outstanding ${money(bc.outstandingAmount)}) — amount to deduct:`, String(bc.outstandingAmount));
    if (raw === null) return;
    const amount = Number(raw);
    if (!(amount > 0)) { setErr('Recovery amount must be positive.'); return; }
    const res = await fetch(`/api/subcontracts/back-charges/${bc.id}/recover`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ amount }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setErr(data.message ?? data.error ?? 'Recovery failed');
      return;
    }
    setErr('');
    await refresh();
  }

  const activeSubs = subcontracts.filter((s) => s.status !== 'closed');

  return (
    <div>
      <div style={s.card}>
        <div style={s.row}>
          <label style={s.field}>
            <span style={s.label}>Subcontract</span>
            <select style={s.input} value={subcontractId} onChange={(e) => setSubcontractId(e.target.value)}>
              <option value="">— select —</option>
              {activeSubs.map((sc) => <option key={sc.id} value={sc.id}>{sc.title} — {sc.subcontractorName}</option>)}
            </select>
          </label>
          <label style={s.fieldSm}>
            <span style={s.label}>Category</span>
            <select style={s.input} value={category} onChange={(e) => setCategory(e.target.value as (typeof CATEGORIES)[number])}>
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          <label style={s.fieldSm}><span style={s.label}>Gross cost</span><input style={s.input} type="number" value={grossAmount} onChange={(e) => setGrossAmount(e.target.value)} placeholder="incurred" /></label>
          <label style={s.fieldXs}><span style={s.label}>Markup %</span><input style={s.input} type="number" value={markupPercent} onChange={(e) => setMarkupPercent(e.target.value)} /></label>
        </div>
        <div style={{ ...s.row, marginTop: 10 }}>
          <label style={s.field}><span style={s.label}>Description</span><input style={s.input} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. tower-crane hire on subcontractor behalf" /></label>
          <button type="button" style={s.primary} onClick={create}>Raise back-charge</button>
        </div>
        {err && <p style={s.err}>{err}</p>}
        {summary && summary.count > 0 && (
          <div style={s.summary}>
            <Stat label="Back-charges" value={String(summary.count)} />
            <Stat label="Gross cost" value={money(summary.totalGross)} />
            <Stat label="Markup" value={money(summary.totalMarkup)} />
            <Stat label="Recoverable" value={money(summary.totalRecoverable)} />
            <Stat label="Recovered" value={money(summary.totalRecovered)} />
            <Stat label="Outstanding" value={money(summary.totalOutstanding)} accent />
          </div>
        )}
      </div>

      <table style={s.table}>
        <thead>
          <tr>
            <th style={s.th}>Ref</th>
            <th style={s.th}>Subcontractor</th>
            <th style={s.th}>Category</th>
            <th style={s.thR}>Recoverable</th>
            <th style={s.thR}>Recovered</th>
            <th style={s.thR}>Outstanding</th>
            <th style={s.th}>Status</th>
            <th style={s.th} />
          </tr>
        </thead>
        <tbody>
          {backCharges.length === 0 ? (
            <tr><td style={s.muted} colSpan={8}>No back-charges yet — raise one above.</td></tr>
          ) : (
            backCharges.map((bc) => (
              <tr key={bc.id} style={s.trow}>
                <td style={s.td} title={bc.description}>{bc.reference}</td>
                <td style={s.tdMuted}>{bc.subcontractorName ?? bc.subcontractId.slice(0, 8)}</td>
                <td style={s.tdMuted}>{bc.category}</td>
                <td style={s.tdR}>{money(bc.recoverableAmount)}<span style={s.markup}> (+{bc.markupPercent}%)</span></td>
                <td style={s.tdAdd}>{money(bc.recoveredAmount)}</td>
                <td style={s.tdOmit}>{money(bc.outstandingAmount)}</td>
                <td style={s.td}><span style={s.tag(bc.status)}>{bc.status.replace('_', ' ')}</span></td>
                <td style={s.tdR}>
                  {bc.status === 'raised' && (
                    <>
                      <button type="button" style={s.approveBtn} onClick={() => setStatus(bc.id, 'agreed')}>Agree</button>
                      <button type="button" style={s.smallBtn} onClick={() => setStatus(bc.id, 'disputed')}>Dispute</button>
                    </>
                  )}
                  {bc.status === 'disputed' && (
                    <>
                      <button type="button" style={s.approveBtn} onClick={() => setStatus(bc.id, 'agreed')}>Agree</button>
                      <button type="button" style={s.smallBtn} onClick={() => setStatus(bc.id, 'written_off')}>Write off</button>
                    </>
                  )}
                  {bc.status === 'agreed' && (
                    <>
                      <button type="button" style={s.approveBtn} onClick={() => recover(bc)}>Recover</button>
                      <button type="button" style={s.smallBtn} onClick={() => setStatus(bc.id, 'written_off')}>Write off</button>
                    </>
                  )}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div style={s.stat}>
      <span style={s.statLabel}>{label}</span>
      <span style={accent ? s.statValueAccent : s.statValue}>{value}</span>
    </div>
  );
}

const tagColor = (st: string): string =>
  st === 'recovered' ? 'var(--good)' : st === 'agreed' ? 'var(--accent)' : st === 'disputed' ? 'var(--bad)' : st === 'written_off' ? 'var(--muted)' : 'var(--muted)';

const s = {
  card: { background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 14, padding: 18 } as CSSProperties,
  row: { display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' } as CSSProperties,
  field: { display: 'flex', flexDirection: 'column', gap: 5, flex: 1, minWidth: 200 } as CSSProperties,
  fieldSm: { display: 'flex', flexDirection: 'column', gap: 5, width: 140 } as CSSProperties,
  fieldXs: { display: 'flex', flexDirection: 'column', gap: 5, width: 100 } as CSSProperties,
  label: { fontSize: 12, color: 'var(--muted)' } as CSSProperties,
  input: { background: 'var(--panel-2)', border: '1px solid var(--border)', borderRadius: 9, color: 'var(--text)', padding: '9px 11px', fontSize: 14 } as CSSProperties,
  primary: { background: 'var(--accent)', border: 'none', borderRadius: 9, color: '#fff', padding: '9px 16px', fontSize: 14, cursor: 'pointer', fontWeight: 600 } as CSSProperties,
  err: { color: 'var(--bad)', fontSize: 13, margin: '8px 2px 0' } as CSSProperties,
  summary: { display: 'flex', gap: 26, marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--border)', flexWrap: 'wrap' } as CSSProperties,
  stat: { display: 'flex', flexDirection: 'column', gap: 3 } as CSSProperties,
  statLabel: { fontSize: 11.5, color: 'var(--muted)' } as CSSProperties,
  statValue: { fontSize: 16, fontWeight: 600 } as CSSProperties,
  statValueAccent: { fontSize: 18, fontWeight: 700, color: 'var(--accent)' } as CSSProperties,
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 14, marginTop: 18 } as CSSProperties,
  th: { textAlign: 'left', color: 'var(--muted)', fontWeight: 500, padding: '8px 10px', borderBottom: '1px solid var(--border)', fontSize: 12.5 } as CSSProperties,
  thR: { textAlign: 'right', color: 'var(--muted)', fontWeight: 500, padding: '8px 10px', borderBottom: '1px solid var(--border)', fontSize: 12.5 } as CSSProperties,
  trow: { borderBottom: '1px solid var(--border)' } as CSSProperties,
  td: { padding: '10px' } as CSSProperties,
  tdMuted: { padding: '10px', color: 'var(--muted)', textTransform: 'capitalize' } as CSSProperties,
  tdR: { padding: '10px', textAlign: 'right' } as CSSProperties,
  markup: { color: 'var(--muted)', fontSize: 11.5 } as CSSProperties,
  tdAdd: { padding: '10px', textAlign: 'right', color: 'var(--good)', fontWeight: 600 } as CSSProperties,
  tdOmit: { padding: '10px', textAlign: 'right', color: 'var(--bad)' } as CSSProperties,
  muted: { color: 'var(--muted)', padding: '12px 10px' } as CSSProperties,
  tag: (st: string): CSSProperties => ({ fontSize: 11.5, color: tagColor(st), border: `1px solid ${tagColor(st)}`, borderRadius: 999, padding: '1px 9px', textTransform: 'capitalize' }),
  smallBtn: { background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', padding: '6px 11px', fontSize: 12.5, cursor: 'pointer', marginLeft: 6 } as CSSProperties,
  approveBtn: { background: 'var(--good)', border: 'none', borderRadius: 8, color: '#04210f', padding: '6px 11px', fontSize: 12.5, cursor: 'pointer', fontWeight: 600 } as CSSProperties,
};

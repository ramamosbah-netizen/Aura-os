'use client';

import { type CSSProperties, useState } from 'react';

interface TaxReturn {
  id: string;
  periodStart: string;
  periodEnd: string;
  totalOutputTax: number;
  totalInputTax: number;
  netTaxPayable: number;
  status: string;
  filedAt: string | null;
}

interface Preview {
  totalOutputTax: number;
  totalInputTax: number;
  netPayable: number;
  lineCount: number;
}

function money(n: number): string {
  return new Intl.NumberFormat('en-AE', { style: 'currency', currency: 'AED', maximumFractionDigits: 2 }).format(n);
}

export default function VatReturnsClient({ initialReturns }: { initialReturns: TaxReturn[] }) {
  const [returns, setReturns] = useState<TaxReturn[]>(initialReturns);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [err, setErr] = useState('');

  async function refresh(): Promise<void> {
    const res = await fetch('/api/finance/vat-returns');
    if (res.ok) setReturns(await res.json());
  }

  async function doPreview(): Promise<void> {
    setErr('');
    setPreview(null);
    if (!from || !to) {
      setErr('Pick a period (from / to).');
      return;
    }
    const res = await fetch(`/api/finance/vat-returns/preview?from=${from}&to=${to}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setErr(data.error ?? data.message ?? 'Preview failed');
      return;
    }
    setPreview(data);
  }

  async function generate(): Promise<void> {
    if (!from || !to) {
      setErr('Pick a period (from / to).');
      return;
    }
    setErr('');
    const res = await fetch('/api/finance/vat-returns', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ periodStart: from, periodEnd: to }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setErr(data.message ?? data.error ?? 'Generate failed');
      return;
    }
    setPreview(null);
    await refresh();
  }

  async function setStatus(id: string, status: 'filed' | 'paid'): Promise<void> {
    await fetch(`/api/finance/vat-returns/${id}/status`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    await refresh();
  }

  return (
    <div>
      <div style={s.card}>
        <div style={s.row}>
          <label style={s.field}><span style={s.label}>Period from</span><input style={s.input} type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
          <label style={s.field}><span style={s.label}>Period to</span><input style={s.input} type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
          <button type="button" style={s.ghost} onClick={doPreview}>Preview</button>
          <button type="button" style={s.primary} onClick={generate}>Generate return</button>
        </div>
        {err && <p style={s.err}>{err}</p>}
        {preview && (
          <div style={s.preview}>
            <Stat label="Output VAT" value={money(preview.totalOutputTax)} />
            <Stat label="Input VAT" value={money(preview.totalInputTax)} />
            <Stat label="Net payable" value={money(preview.netPayable)} accent />
            <Stat label="Tax lines" value={String(preview.lineCount)} />
          </div>
        )}
      </div>

      <table style={s.table}>
        <thead>
          <tr>
            <th style={s.th}>Period</th>
            <th style={s.thR}>Output</th>
            <th style={s.thR}>Input</th>
            <th style={s.thR}>Net payable</th>
            <th style={s.th}>Status</th>
            <th style={s.th} />
          </tr>
        </thead>
        <tbody>
          {returns.length === 0 ? (
            <tr><td style={s.muted} colSpan={6}>No returns yet — generate one above.</td></tr>
          ) : (
            returns.map((r) => (
              <tr key={r.id} style={s.trow}>
                <td style={s.td}>{r.periodStart} → {r.periodEnd}</td>
                <td style={s.tdR}>{money(r.totalOutputTax)}</td>
                <td style={s.tdR}>{money(r.totalInputTax)}</td>
                <td style={s.tdRb}>{money(r.netTaxPayable)}</td>
                <td style={s.td}><span style={s.tag(r.status)}>{r.status}</span></td>
                <td style={s.tdR}>
                  {r.status === 'draft' && <button type="button" style={s.smallBtn} onClick={() => setStatus(r.id, 'filed')}>File</button>}
                  {r.status === 'filed' && <button type="button" style={s.smallBtn} onClick={() => setStatus(r.id, 'paid')}>Mark paid</button>}
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

const tagColor = (st: string): string => (st === 'paid' ? 'var(--good)' : st === 'filed' ? 'var(--accent)' : 'var(--muted)');

const s = {
  card: { background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 14, padding: 18 } as CSSProperties,
  row: { display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' } as CSSProperties,
  field: { display: 'flex', flexDirection: 'column', gap: 5 } as CSSProperties,
  label: { fontSize: 12, color: 'var(--muted)' } as CSSProperties,
  input: { background: 'var(--panel-2)', border: '1px solid var(--border)', borderRadius: 9, color: 'var(--text)', padding: '9px 11px', fontSize: 14 } as CSSProperties,
  ghost: { background: 'var(--panel-2)', border: '1px solid var(--border)', borderRadius: 9, color: 'var(--text)', padding: '9px 14px', fontSize: 14, cursor: 'pointer' } as CSSProperties,
  primary: { background: 'var(--accent)', border: 'none', borderRadius: 9, color: '#fff', padding: '9px 14px', fontSize: 14, cursor: 'pointer', fontWeight: 600 } as CSSProperties,
  err: { color: 'var(--bad)', fontSize: 13, margin: '8px 2px 0' } as CSSProperties,
  preview: { display: 'flex', gap: 28, marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--border)', flexWrap: 'wrap' } as CSSProperties,
  stat: { display: 'flex', flexDirection: 'column', gap: 3 } as CSSProperties,
  statLabel: { fontSize: 11.5, color: 'var(--muted)' } as CSSProperties,
  statValue: { fontSize: 18, fontWeight: 600 } as CSSProperties,
  statValueAccent: { fontSize: 18, fontWeight: 700, color: 'var(--accent)' } as CSSProperties,
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 14, marginTop: 18 } as CSSProperties,
  th: { textAlign: 'left', color: 'var(--muted)', fontWeight: 500, padding: '8px 10px', borderBottom: '1px solid var(--border)', fontSize: 12.5 } as CSSProperties,
  thR: { textAlign: 'right', color: 'var(--muted)', fontWeight: 500, padding: '8px 10px', borderBottom: '1px solid var(--border)', fontSize: 12.5 } as CSSProperties,
  trow: { borderBottom: '1px solid var(--border)' } as CSSProperties,
  td: { padding: '10px' } as CSSProperties,
  tdR: { padding: '10px', textAlign: 'right' } as CSSProperties,
  tdRb: { padding: '10px', textAlign: 'right', fontWeight: 600 } as CSSProperties,
  muted: { color: 'var(--muted)', padding: '12px 10px' } as CSSProperties,
  tag: (st: string): CSSProperties => ({ fontSize: 11.5, color: tagColor(st), border: `1px solid ${tagColor(st)}`, borderRadius: 999, padding: '1px 9px', textTransform: 'capitalize' }),
  smallBtn: { background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', padding: '6px 12px', fontSize: 12.5, cursor: 'pointer' } as CSSProperties,
};

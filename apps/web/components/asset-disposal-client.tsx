'use client';

import AssetPicker from './ui/asset-picker';

import { type CSSProperties, useMemo, useState } from 'react';
import EmptyState from './ui/empty-state';
import ExportButton from './export-button';

export interface AssetDisposal {
  id: string;
  assetId: string;
  assetName: string | null;
  disposalDate: string;
  method: 'sale' | 'scrap' | 'write_off' | 'trade_in' | 'donation';
  proceeds: number;
  bookValue: number;
  gainLoss: number;
  notes: string | null;
  createdAt: string;
}

const METHODS = ['sale', 'scrap', 'write_off', 'trade_in', 'donation'];
const today = () => new Date().toISOString().slice(0, 10);
const aed = (n: number) => `AED ${Math.round(n).toLocaleString()}`;

export default function AssetDisposalClient({ initial }: { initial: AssetDisposal[] }) {
  const [rows, setRows] = useState(initial);
  const [f, setF] = useState({ assetId: '', disposalDate: today(), method: 'sale', proceeds: '', bookValue: '', notes: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const kpi = useMemo(() => {
    const proceeds = rows.reduce((s, r) => s + r.proceeds, 0);
    const gainLoss = rows.reduce((s, r) => s + r.gainLoss, 0);
    return { count: rows.length, proceeds, gainLoss };
  }, [rows]);

  const set = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }));

  const dispose = async () => {
    setError('');
    if (!f.assetId.trim() || !f.disposalDate.trim()) return setError('Asset ID and disposal date are required');
    setBusy(true);
    try {
      const res = await fetch('/api/assets/disposals', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ assetId: f.assetId, disposalDate: f.disposalDate, method: f.method, proceeds: Number(f.proceeds) || 0, bookValue: Number(f.bookValue) || 0, notes: f.notes || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || data.error || 'Failed');
      setRows((p) => [data, ...p]);
      setF({ assetId: '', disposalDate: today(), method: 'sale', proceeds: '', bookValue: '', notes: '' });
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };

  return (
    <>
      <div style={st.kpis}>
        <Kpi label="Disposals" value={String(kpi.count)} />
        <Kpi label="Total proceeds" value={aed(kpi.proceeds)} />
        <Kpi label="Net gain / loss" value={aed(kpi.gainLoss)} color={kpi.gainLoss >= 0 ? '#16a34a' : '#dc2626'} />
      </div>

      <h2 style={st.h2}>Dispose asset</h2>
      <div style={st.form}>
        <label style={st.label}>Asset<AssetPicker value={f.assetId} onChange={(id) => set('assetId', id)} /></label>
        <label style={st.label}>Date<input type="date" style={st.input} value={f.disposalDate} onChange={(e) => set('disposalDate', e.target.value)} /></label>
        <label style={st.label}>Method<select style={st.input} value={f.method} onChange={(e) => set('method', e.target.value)}>{METHODS.map((m) => <option key={m} value={m}>{m.replace('_', ' ')}</option>)}</select></label>
        <label style={st.label}>Proceeds<input style={{ ...st.input, minWidth: 110 }} inputMode="numeric" value={f.proceeds} onChange={(e) => set('proceeds', e.target.value)} placeholder="0" /></label>
        <label style={st.label}>Book value<input style={{ ...st.input, minWidth: 110 }} inputMode="numeric" value={f.bookValue} onChange={(e) => set('bookValue', e.target.value)} placeholder="0" /></label>
        <label style={{ ...st.label, minWidth: 180 }}>Notes<input style={st.input} value={f.notes} onChange={(e) => set('notes', e.target.value)} placeholder="optional" /></label>
        <button style={st.btn} onClick={dispose} disabled={busy}>{busy ? 'Recording…' : 'Record disposal'}</button>
        {error && <span style={st.err}>{error}</span>}
      </div>

      <div style={st.regHead}>
        <h2 style={st.h2}>Disposal register</h2>
        <ExportButton filename="asset-disposals" title="Asset Disposal Register" rows={rows as unknown as Array<Record<string, unknown>>}
          columns={[{ key: 'disposalDate', label: 'Date' }, { key: 'assetName', label: 'Asset' }, { key: 'method', label: 'Method' }, { key: 'proceeds', label: 'Proceeds' }, { key: 'bookValue', label: 'Book value' }, { key: 'gainLoss', label: 'Gain/Loss' }]} />
      </div>
      {rows.length === 0 ? (
        <EmptyState compact title="No disposals recorded" description="Record an asset sale, scrap or write-off — the gain or loss against net book value is computed and posted to the register." />
      ) : (
        <table style={st.table}>
          <thead><tr><th style={st.th}>Date</th><th style={st.th}>Asset</th><th style={st.th}>Method</th><th style={st.thR}>Proceeds</th><th style={st.thR}>Book value</th><th style={st.thR}>Gain / loss</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td style={st.td}>{r.disposalDate}</td>
                <td style={st.td}>{r.assetName || r.assetId}</td>
                <td style={st.td}>{r.method.replace('_', ' ')}</td>
                <td style={st.tdR}>{aed(r.proceeds)}</td>
                <td style={st.tdR}>{aed(r.bookValue)}</td>
                <td style={{ ...st.tdR, color: r.gainLoss >= 0 ? '#16a34a' : '#dc2626', fontWeight: 600 }}>{aed(r.gainLoss)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}

function Kpi({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={st.kpi}>
      <div style={st.kpiLabel}>{label}</div>
      <div style={{ ...st.kpiValue, color: color ?? 'var(--fg)' }}>{value}</div>
    </div>
  );
}

const st = {
  kpis: { display: 'flex', gap: 12, marginBottom: 18, flexWrap: 'wrap' as const } as CSSProperties,
  kpi: { border: '1px solid var(--border)', borderRadius: 10, padding: '12px 18px', minWidth: 150, background: 'var(--surface)' } as CSSProperties,
  kpiLabel: { fontSize: 12, color: 'var(--muted)', marginBottom: 4 } as CSSProperties,
  kpiValue: { fontSize: 22, fontWeight: 700, letterSpacing: -0.5 } as CSSProperties,
  form: { display: 'flex', flexWrap: 'wrap' as const, gap: 12, alignItems: 'flex-end', marginBottom: 14 } as CSSProperties,
  label: { display: 'flex', flexDirection: 'column' as const, fontSize: 13, fontWeight: 600, gap: 4 } as CSSProperties,
  input: { padding: '7px 10px', borderRadius: 6, border: '1px solid var(--border, #ccc)', fontSize: 14, minWidth: 120, background: 'var(--surface)', color: 'var(--fg)' } as CSSProperties,
  btn: { padding: '8px 18px', borderRadius: 6, background: 'var(--accent, #2563eb)', color: '#fff', border: 'none', fontWeight: 600, cursor: 'pointer', fontSize: 14 } as CSSProperties,
  err: { color: '#dc2626', marginLeft: 12, fontSize: 13 } as CSSProperties,
  h2: { fontSize: 20, margin: '22px 0 10px' } as CSSProperties,
  regHead: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' as const, gap: 8 } as CSSProperties,
  table: { width: '100%', borderCollapse: 'collapse' as const, fontSize: 14 } as CSSProperties,
  th: { textAlign: 'left' as const, padding: '8px 12px', borderBottom: '2px solid var(--border, #e5e7eb)', fontWeight: 600 } as CSSProperties,
  thR: { textAlign: 'right' as const, padding: '8px 12px', borderBottom: '2px solid var(--border, #e5e7eb)', fontWeight: 600 } as CSSProperties,
  td: { padding: '8px 12px', borderBottom: '1px solid var(--border, #e5e7eb)' } as CSSProperties,
  tdR: { padding: '8px 12px', borderBottom: '1px solid var(--border, #e5e7eb)', textAlign: 'right' as const } as CSSProperties,
};

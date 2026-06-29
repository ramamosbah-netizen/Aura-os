'use client';

import { type CSSProperties, useState } from 'react';

interface Asset {
  id: string;
  name: string;
  purchaseCost: number;
  purchaseDate: string;
}

interface Row {
  year: number;
  openingValue: number;
  depreciation: number;
  accumulated: number;
  closingValue: number;
}

interface Schedule {
  asset: { id: string; name: string; purchaseCost: number; purchaseDate: string };
  schedule: {
    annualDepreciation: number;
    salvageValue: number;
    usefulLifeYears: number;
    schedule: Row[];
  };
}

function money(n: number): string {
  return new Intl.NumberFormat('en-AE', { style: 'currency', currency: 'AED', maximumFractionDigits: 0 }).format(n);
}

export default function DepreciationClient({ assets }: { assets: Asset[] }) {
  const [assetId, setAssetId] = useState('');
  const [life, setLife] = useState('5');
  const [salvage, setSalvage] = useState('0');
  const [result, setResult] = useState<Schedule | null>(null);
  const [err, setErr] = useState('');

  const selected = assets.find((a) => a.id === assetId);

  async function compute(): Promise<void> {
    setErr('');
    setResult(null);
    if (!assetId) {
      setErr('Pick an asset.');
      return;
    }
    if (!(Number(life) >= 1)) {
      setErr('Useful life must be at least 1 year.');
      return;
    }
    const res = await fetch(`/api/assets/${assetId}/depreciation?usefulLife=${Number(life)}&salvage=${Number(salvage) || 0}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setErr(data.message ?? data.error ?? 'Calculation failed');
      return;
    }
    setResult(data);
  }

  return (
    <div>
      <div style={s.card}>
        <div style={s.row}>
          <label style={s.field}>
            <span style={s.label}>Asset</span>
            <select style={s.input} value={assetId} onChange={(e) => setAssetId(e.target.value)}>
              <option value="">— select —</option>
              {assets.map((a) => <option key={a.id} value={a.id}>{a.name} ({money(a.purchaseCost)})</option>)}
            </select>
          </label>
          <label style={s.fieldSm}><span style={s.label}>Useful life (yrs)</span><input style={s.input} type="number" value={life} onChange={(e) => setLife(e.target.value)} /></label>
          <label style={s.fieldSm}><span style={s.label}>Salvage value</span><input style={s.input} type="number" value={salvage} onChange={(e) => setSalvage(e.target.value)} /></label>
          <button type="button" style={s.primary} onClick={compute}>Schedule</button>
        </div>
        {selected && <p style={s.muted}>Purchase: {money(selected.purchaseCost)} on {selected.purchaseDate}</p>}
        {err && <p style={s.err}>{err}</p>}
      </div>

      {result && (
        <div style={s.result}>
          <div style={s.statsBar}>
            <Stat label="Annual depreciation" value={money(result.schedule.annualDepreciation)} />
            <Stat label="Salvage value" value={money(result.schedule.salvageValue)} />
            <Stat label="Useful life" value={`${result.schedule.usefulLifeYears} yrs`} />
          </div>
          <table style={s.table}>
            <thead>
              <tr>
                <th style={s.th}>Year</th>
                <th style={s.thR}>Opening NBV</th>
                <th style={s.thR}>Depreciation</th>
                <th style={s.thR}>Accumulated</th>
                <th style={s.thR}>Closing NBV</th>
              </tr>
            </thead>
            <tbody>
              {result.schedule.schedule.map((r) => (
                <tr key={r.year} style={s.trow}>
                  <td style={s.td}>{r.year}</td>
                  <td style={s.tdR}>{money(r.openingValue)}</td>
                  <td style={s.tdR}>{money(r.depreciation)}</td>
                  <td style={s.tdRm}>{money(r.accumulated)}</td>
                  <td style={s.tdRb}>{money(r.closingValue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div style={s.stat}>
      <span style={s.statLabel}>{label}</span>
      <span style={s.statValue}>{value}</span>
    </div>
  );
}

const s = {
  card: { background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 14, padding: 18 } as CSSProperties,
  row: { display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' } as CSSProperties,
  field: { display: 'flex', flexDirection: 'column', gap: 5, flex: 1, minWidth: 200 } as CSSProperties,
  fieldSm: { display: 'flex', flexDirection: 'column', gap: 5, width: 130 } as CSSProperties,
  label: { fontSize: 12, color: 'var(--muted)' } as CSSProperties,
  input: { background: 'var(--panel-2)', border: '1px solid var(--border)', borderRadius: 9, color: 'var(--text)', padding: '9px 11px', fontSize: 14 } as CSSProperties,
  primary: { background: 'var(--accent)', border: 'none', borderRadius: 9, color: '#fff', padding: '9px 16px', fontSize: 14, cursor: 'pointer', fontWeight: 600 } as CSSProperties,
  muted: { color: 'var(--muted)', fontSize: 13, margin: '10px 2px 0' } as CSSProperties,
  err: { color: 'var(--bad)', fontSize: 13, margin: '8px 2px 0' } as CSSProperties,
  result: { marginTop: 18 } as CSSProperties,
  statsBar: { display: 'flex', gap: 28, marginBottom: 14, flexWrap: 'wrap' } as CSSProperties,
  stat: { display: 'flex', flexDirection: 'column', gap: 3 } as CSSProperties,
  statLabel: { fontSize: 11.5, color: 'var(--muted)' } as CSSProperties,
  statValue: { fontSize: 18, fontWeight: 600 } as CSSProperties,
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 13.5 } as CSSProperties,
  th: { textAlign: 'left', color: 'var(--muted)', fontWeight: 500, padding: '8px 10px', borderBottom: '1px solid var(--border)', fontSize: 12.5 } as CSSProperties,
  thR: { textAlign: 'right', color: 'var(--muted)', fontWeight: 500, padding: '8px 10px', borderBottom: '1px solid var(--border)', fontSize: 12.5 } as CSSProperties,
  trow: { borderBottom: '1px solid var(--border)' } as CSSProperties,
  td: { padding: '9px 10px' } as CSSProperties,
  tdR: { padding: '9px 10px', textAlign: 'right' } as CSSProperties,
  tdRm: { padding: '9px 10px', textAlign: 'right', color: 'var(--muted)' } as CSSProperties,
  tdRb: { padding: '9px 10px', textAlign: 'right', fontWeight: 600 } as CSSProperties,
};

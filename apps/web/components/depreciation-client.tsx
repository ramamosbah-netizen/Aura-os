'use client';

import { type CSSProperties, useState } from 'react';

interface Asset {
  id: string;
  name: string;
  serialNumber: string;
  category: string;
  purchaseDate: string;
  purchaseCost: number;
}

interface Period { period: number; depreciation: number; accumulated: number; bookValue: number }
interface Schedule {
  method: string;
  cost: number;
  salvageValue: number;
  usefulLifeMonths: number;
  depreciableBase: number;
  periods: Period[];
  monthsElapsed: number;
  accumulatedToDate: number;
  netBookValue: number;
}

const fmt = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function DepreciationClient({ assets }: { assets: Asset[] }) {
  const [assetId, setAssetId] = useState('');
  const [usefulLifeMonths, setLife] = useState('60');
  const [salvageValue, setSalvage] = useState('0');
  const [method, setMethod] = useState('straight_line');
  const [schedule, setSchedule] = useState<Schedule | null>(null);
  const [error, setError] = useState('');

  const asset = assets.find((a) => a.id === assetId);

  const compute = async () => {
    setError(''); setSchedule(null);
    if (!assetId) return setError('Select an asset');
    if (!(Number(usefulLifeMonths) > 0)) return setError('Useful life must be positive');
    const qs = new URLSearchParams({ usefulLifeMonths, salvageValue: salvageValue || '0', method });
    try {
      const res = await fetch(`/api/assets/${assetId}/depreciation?${qs}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || data.error || 'Failed');
      setSchedule(data);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <>
      <div style={st.form}>
        <label style={st.label}>Asset
          <select style={st.input} value={assetId} onChange={(e) => setAssetId(e.target.value)}>
            <option value="">— select —</option>
            {assets.map((a) => <option key={a.id} value={a.id}>{a.name} ({a.serialNumber}) — {fmt(a.purchaseCost)}</option>)}
          </select>
        </label>
        <label style={st.label}>Useful life (months)<input style={st.input} type="number" min="1" value={usefulLifeMonths} onChange={(e) => setLife(e.target.value)} /></label>
        <label style={st.label}>Salvage value<input style={st.input} type="number" min="0" value={salvageValue} onChange={(e) => setSalvage(e.target.value)} /></label>
        <label style={st.label}>Method
          <select style={st.input} value={method} onChange={(e) => setMethod(e.target.value)}>
            <option value="straight_line">straight-line</option>
            <option value="declining_balance">declining-balance</option>
          </select>
        </label>
        <button style={st.btn} onClick={compute}>Compute</button>
        {error && <p style={st.err}>{error}</p>}
      </div>

      {asset && <p style={st.note}>Asset cost <b>{fmt(asset.purchaseCost)}</b> · purchased <b>{asset.purchaseDate}</b></p>}

      {schedule && (
        <>
          <div style={st.cards}>
            <div style={st.card}><div style={st.cardLabel}>Months elapsed</div><div style={st.cardVal}>{schedule.monthsElapsed}</div></div>
            <div style={st.card}><div style={st.cardLabel}>Accumulated dep.</div><div style={st.cardVal}>{fmt(schedule.accumulatedToDate)}</div></div>
            <div style={st.card}><div style={st.cardLabel}>Net book value</div><div style={{ ...st.cardVal, color: 'var(--accent, #2563eb)' }}>{fmt(schedule.netBookValue)}</div></div>
          </div>
          <table style={st.table}>
            <thead><tr><th style={st.th}>Month</th><th style={st.thR}>Depreciation</th><th style={st.thR}>Accumulated</th><th style={st.thR}>Book value</th></tr></thead>
            <tbody>
              {schedule.periods.map((p) => (
                <tr key={p.period} style={p.period === schedule.monthsElapsed ? { background: 'var(--surface-2, #f1f5f9)' } : undefined}>
                  <td style={st.td}>{p.period}</td>
                  <td style={st.tdR}>{fmt(p.depreciation)}</td>
                  <td style={st.tdR}>{fmt(p.accumulated)}</td>
                  <td style={st.tdR}>{fmt(p.bookValue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </>
  );
}

const st = {
  form: { display: 'flex', flexWrap: 'wrap' as const, gap: 12, alignItems: 'flex-end', marginBottom: 14 } as CSSProperties,
  label: { display: 'flex', flexDirection: 'column' as const, fontSize: 13, fontWeight: 600, gap: 4 } as CSSProperties,
  input: { padding: '7px 10px', borderRadius: 6, border: '1px solid var(--border, #ccc)', fontSize: 14, minWidth: 150 } as CSSProperties,
  btn: { padding: '8px 18px', borderRadius: 6, background: 'var(--accent, #2563eb)', color: '#fff', border: 'none', fontWeight: 600, cursor: 'pointer', fontSize: 14 } as CSSProperties,
  err: { color: '#dc2626', margin: '6px 0 0', fontSize: 13, width: '100%' } as CSSProperties,
  note: { fontSize: 14, color: 'var(--muted)', margin: '0 0 14px' } as CSSProperties,
  cards: { display: 'flex', gap: 14, marginBottom: 18 } as CSSProperties,
  card: { padding: '12px 18px', borderRadius: 8, border: '1px solid var(--border, #e5e7eb)', minWidth: 150 } as CSSProperties,
  cardLabel: { fontSize: 12, color: 'var(--muted)', textTransform: 'uppercase' as const, letterSpacing: 0.5 } as CSSProperties,
  cardVal: { fontSize: 22, fontWeight: 700, marginTop: 4 } as CSSProperties,
  table: { width: '100%', borderCollapse: 'collapse' as const, fontSize: 14 } as CSSProperties,
  th: { textAlign: 'left' as const, padding: '7px 12px', borderBottom: '2px solid var(--border, #e5e7eb)', fontWeight: 600 } as CSSProperties,
  thR: { textAlign: 'right' as const, padding: '7px 12px', borderBottom: '2px solid var(--border, #e5e7eb)', fontWeight: 600 } as CSSProperties,
  td: { padding: '6px 12px', borderBottom: '1px solid var(--border, #e5e7eb)' } as CSSProperties,
  tdR: { textAlign: 'right' as const, padding: '6px 12px', borderBottom: '1px solid var(--border, #e5e7eb)' } as CSSProperties,
};

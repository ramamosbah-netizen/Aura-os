'use client';

import { type CSSProperties, useState } from 'react';
import { useRouter } from 'next/navigation';

interface Rate { fromCurrency: string; toCurrency: string; rate: number; effectiveDate: string }
const CURRENCIES = ['AED', 'USD', 'EUR', 'SAR', 'GBP'];

export default function FxClient({ initialRates }: { initialRates: Rate[] }) {
  const router = useRouter();
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [from, setFrom] = useState('USD');
  const [to, setTo] = useState('AED');
  const [rate, setRate] = useState('');

  const [cAmount, setCAmount] = useState('1000');
  const [cFrom, setCFrom] = useState('USD');
  const [cTo, setCTo] = useState('AED');
  const [result, setResult] = useState<{ rate: number; converted: number } | null>(null);

  async function save() {
    if (!(Number(rate) > 0)) { setErr('Rate must be positive'); return; }
    setBusy(true); setErr(null);
    try {
      const res = await fetch('/api/finance/fx/rates', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ from, to, rate: Number(rate) }) });
      if (!res.ok) { const d = await res.json().catch(() => ({})); setErr(d.error ?? d.message ?? 'Error'); }
      else { setRate(''); router.refresh(); }
    } catch { setErr('API unreachable'); } finally { setBusy(false); }
  }

  async function convert() {
    setBusy(true); setErr(null); setResult(null);
    try {
      const res = await fetch(`/api/finance/fx/convert?amount=${encodeURIComponent(cAmount)}&from=${cFrom}&to=${cTo}`);
      const d = await res.json().catch(() => ({}));
      if (res.ok) setResult({ rate: d.rate, converted: d.converted });
      else setErr(d.error ?? d.message ?? 'Error');
    } catch { setErr('API unreachable'); } finally { setBusy(false); }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {err && <div style={s.errorBar}>{err}</div>}

      <div style={s.formPanel}>
        <div style={s.label}>Set rate</div>
        <div style={s.formRow}>
          <select style={s.input} value={from} onChange={(e) => setFrom(e.target.value)}>{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</select>
          <span style={s.muted}>→</span>
          <select style={s.input} value={to} onChange={(e) => setTo(e.target.value)}>{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</select>
          <input style={s.input} placeholder="Rate" inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} />
          <button type="button" style={s.btnAccent} onClick={save} disabled={busy}>Save</button>
        </div>
      </div>

      <div style={s.formPanel}>
        <div style={s.label}>Convert</div>
        <div style={s.formRow}>
          <input style={s.input} inputMode="decimal" value={cAmount} onChange={(e) => setCAmount(e.target.value)} />
          <select style={s.input} value={cFrom} onChange={(e) => setCFrom(e.target.value)}>{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</select>
          <span style={s.muted}>→</span>
          <select style={s.input} value={cTo} onChange={(e) => setCTo(e.target.value)}>{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</select>
          <button type="button" style={s.btnSec} onClick={convert} disabled={busy}>Convert</button>
        </div>
        {result && (
          <div style={s.result}>{cAmount} {cFrom} = <strong>{result.converted.toLocaleString(undefined, { maximumFractionDigits: 2 })} {cTo}</strong> <span style={s.muted}>@ {result.rate}</span></div>
        )}
      </div>

      <div style={s.panel}>
        {initialRates.length === 0 ? (
          <p style={s.muted}>No stored rates (using default pegs). Set one above.</p>
        ) : (
          <table style={s.table}>
            <thead><tr>{['Pair', 'Rate', 'Effective'].map((h) => <th key={h} style={s.th}>{h}</th>)}</tr></thead>
            <tbody>
              {initialRates.map((r, i) => (
                <tr key={i}>
                  <td style={s.td}><strong>{r.fromCurrency} → {r.toCurrency}</strong></td>
                  <td style={s.td}>{r.rate}</td>
                  <td style={s.tdM}>{r.effectiveDate}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

const field: CSSProperties = { background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', padding: '7px 10px', fontSize: 13, outline: 'none' };
const s = {
  formPanel: { background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 16px' } as CSSProperties,
  label: { fontSize: 11.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--muted)', marginBottom: 10 } as CSSProperties,
  formRow: { display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' } as CSSProperties,
  input: { ...field, flex: 1, minWidth: 90 } as CSSProperties,
  btnAccent: { background: 'var(--accent)', color: '#0b0e14', fontWeight: 600, border: 'none', borderRadius: 8, padding: '7px 14px', fontSize: 13, cursor: 'pointer' } as CSSProperties,
  btnSec: { ...field, cursor: 'pointer', fontWeight: 500 } as CSSProperties,
  result: { marginTop: 10, fontSize: 14 } as CSSProperties,
  panel: { background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 14, padding: '8px 8px' } as CSSProperties,
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 13 } as CSSProperties,
  th: { textAlign: 'left', color: 'var(--muted)', fontWeight: 500, fontSize: 11.5, textTransform: 'uppercase', letterSpacing: 0.5, padding: '10px 12px', borderBottom: '1px solid var(--border)' } as CSSProperties,
  td: { padding: '9px 12px', borderBottom: '1px solid var(--border)' } as CSSProperties,
  tdM: { padding: '9px 12px', borderBottom: '1px solid var(--border)', color: 'var(--muted)' } as CSSProperties,
  muted: { color: 'var(--muted)', fontSize: 13 } as CSSProperties,
  errorBar: { background: 'rgba(220,53,69,0.1)', border: '1px solid rgba(220,53,69,0.2)', color: '#dc3545', padding: '10px 14px', borderRadius: 10, fontSize: 13 } as CSSProperties,
};

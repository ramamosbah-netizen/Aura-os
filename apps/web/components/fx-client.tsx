'use client';

import { type CSSProperties, useState } from 'react';
import { CURRENCIES } from '@aura/shared';
import EmptyState from './ui/empty-state';
import { useRouter } from 'next/navigation';

interface Rate { fromCurrency: string; toCurrency: string; rate: number; effectiveDate: string }

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
  const [result, setResult] = useState<{ rate: number; converted: number; effectiveDate: string | null; source: string } | null>(null);

  async function save() {
    if (!(Number(rate) > 0)) { setErr('Rate must be positive'); return; }
    setBusy(true); setErr(null);
    try {
      const res = await fetch('/api/finance/fx/rates', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ from, to, rate: Number(rate) }) });
      if (!res.ok) { const d = await res.json().catch(() => ({})); setErr(d.message ?? d.error ?? 'Error'); }
      else { setRate(''); router.refresh(); }
    } catch { setErr('API unreachable'); } finally { setBusy(false); }
  }

  async function convert() {
    setBusy(true); setErr(null); setResult(null);
    try {
      const res = await fetch(`/api/finance/fx/convert?amount=${encodeURIComponent(cAmount)}&from=${cFrom}&to=${cTo}`);
      const d = await res.json().catch(() => ({}));
      if (res.ok) setResult({ rate: d.rate, converted: d.converted, effectiveDate: d.effectiveDate, source: d.source });
      // `message` first: the API envelope puts the machine code in `error` and the explanation in
      // `message`, and reading them the other way round turned every refusal into the word
      // BAD_REQUEST — the same defect that hid the invoice refusals (FX-01).
      else setErr(d.message ?? d.error ?? 'Error');
    } catch { setErr('API unreachable'); } finally { setBusy(false); }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {err && <div style={s.errorBar} role="alert" data-testid="fx-error">{err}</div>}

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
          <select style={s.input} value={cFrom} data-testid="fx-convert-from" onChange={(e) => setCFrom(e.target.value)}>{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</select>
          <span style={s.muted}>→</span>
          <select style={s.input} value={cTo} data-testid="fx-convert-to" onChange={(e) => setCTo(e.target.value)}>{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</select>
          <button type="button" style={s.btnSec} onClick={convert} disabled={busy} data-testid="fx-convert-submit">Convert</button>
        </div>
        {result && (
          <div style={s.result} data-testid="fx-convert-result">
            {cAmount} {cFrom} = <strong>{result.converted.toLocaleString(undefined, { maximumFractionDigits: 2 })} {cTo}</strong>{' '}
            <span style={s.muted}>@ {result.rate}</span>
            {/* WHICH rate answered. A converted figure with no date and no source is the thing FX-01
                and FX-02 were about; showing it here is the difference between a number and evidence. */}
            <span style={s.muted} data-testid="fx-convert-provenance">
              {result.source === 'identity'
                ? ' · same currency, no conversion'
                : ` · governed rate effective ${result.effectiveDate ?? 'unknown'}${result.source.endsWith('-inverse') ? ' (derived as the inverse)' : ''}`}
            </span>
          </div>
        )}
      </div>

      <div style={s.panel}>
        {initialRates.length === 0 ? (
          <EmptyState
            compact
            title="No stored exchange rates"
            description="Nothing can be converted or valued in a foreign currency until a rate is set above. AURA does not fall back to a default rate — it says it does not know."
          />
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
  btnAccent: { background: 'var(--accent)', color: 'var(--accent-ink)', fontWeight: 600, border: 'none', borderRadius: 8, padding: '7px 14px', fontSize: 13, cursor: 'pointer' } as CSSProperties,
  btnSec: { ...field, cursor: 'pointer', fontWeight: 500 } as CSSProperties,
  result: { marginTop: 10, fontSize: 14 } as CSSProperties,
  panel: { background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 14, padding: '8px 8px' } as CSSProperties,
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 13 } as CSSProperties,
  th: { textAlign: 'left', color: 'var(--muted)', fontWeight: 500, fontSize: 11.5, textTransform: 'uppercase', letterSpacing: 0.5, padding: '10px 12px', borderBottom: '1px solid var(--border)' } as CSSProperties,
  td: { padding: '9px 12px', borderBottom: '1px solid var(--border)' } as CSSProperties,
  tdM: { padding: '9px 12px', borderBottom: '1px solid var(--border)', color: 'var(--muted)' } as CSSProperties,
  muted: { color: 'var(--muted)', fontSize: 13 } as CSSProperties,
  errorBar: { background: 'var(--bad-soft)', border: '1px solid var(--bad-soft)', color: 'var(--bad)', padding: '10px 14px', borderRadius: 10, fontSize: 13 } as CSSProperties,
};

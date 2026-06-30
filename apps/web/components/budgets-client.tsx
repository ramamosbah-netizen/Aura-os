'use client';

import { type CSSProperties, useState } from 'react';
import { useRouter } from 'next/navigation';

interface Account { id: string; code: string; name: string; type: string }
interface BudgetLine { accountId: string; accountCode: string; accountName: string; amount: number }
interface Budget { id: string; name: string; from: string; to: string; lines: BudgetLine[]; createdAt: string }
interface BvaRow { code: string; name: string; type: string | null; budget: number; actual: number; variance: number; variancePct: number | null }
interface Bva { name: string; from: string; to: string; rows: BvaRow[]; totalBudget: number; totalActual: number; totalVariance: number }

interface DraftLine { accountId: string; amount: string }

function money(n: number) {
  const v = Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return n < 0 ? `(${v})` : v;
}

export default function BudgetsClient({ initialBudgets, accounts }: { initialBudgets: Budget[]; accounts: Account[] }) {
  const router = useRouter();
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [show, setShow] = useState(false);

  const [name, setName] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [lines, setLines] = useState<DraftLine[]>([{ accountId: '', amount: '' }]);

  const [bva, setBva] = useState<{ id: string; data: Bva } | null>(null);

  function setLine(i: number, patch: Partial<DraftLine>) {
    setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }

  async function create() {
    const payloadLines = lines
      .filter((l) => l.accountId && Number(l.amount))
      .map((l) => {
        const a = accounts.find((x) => x.id === l.accountId)!;
        return { accountId: a.id, accountCode: a.code, accountName: a.name, amount: Number(l.amount) };
      });
    if (!name.trim() || !from || !to || payloadLines.length === 0) {
      setErr('Name, from, to and at least one line (account + amount) are required');
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch('/api/finance/budgets', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name, from, to, lines: payloadLines }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setErr(d.error ?? d.message ?? 'Error');
      } else {
        setShow(false);
        setName(''); setFrom(''); setTo(''); setLines([{ accountId: '', amount: '' }]);
        router.refresh();
      }
    } catch {
      setErr('API unreachable');
    } finally {
      setBusy(false);
    }
  }

  async function viewBva(id: string) {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/finance/budgets/${id}/vs-actual`);
      const data = await res.json().catch(() => null);
      if (res.ok && data) setBva({ id, data });
      else setErr(data?.error ?? 'Failed to load');
    } catch {
      setErr('API unreachable');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {err && <div style={s.errorBar}>{err}</div>}

      <div style={s.tabBar}>
        <div style={{ flex: 1 }} />
        <button type="button" style={s.btnAccent} onClick={() => setShow(!show)}>+ New Budget</button>
      </div>

      {show && (
        <div style={s.formPanel}>
          <div style={s.formRow}>
            <input style={s.input} placeholder="Budget name *" value={name} onChange={(e) => setName(e.target.value)} />
            <input style={{ ...s.input, maxWidth: 150 }} type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            <input style={{ ...s.input, maxWidth: 150 }} type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          {lines.map((l, i) => (
            <div key={i} style={{ ...s.formRow, marginTop: 8 }}>
              <select style={s.input} value={l.accountId} onChange={(e) => setLine(i, { accountId: e.target.value })}>
                <option value="">Select account…</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>{a.code} — {a.name} ({a.type})</option>
                ))}
              </select>
              <input style={{ ...s.input, maxWidth: 150 }} placeholder="Budget amount" inputMode="decimal" value={l.amount} onChange={(e) => setLine(i, { amount: e.target.value })} />
              {lines.length > 1 && (
                <button type="button" style={s.btnSec} onClick={() => setLines((ls) => ls.filter((_, idx) => idx !== i))}>✕</button>
              )}
            </div>
          ))}
          <div style={{ ...s.formRow, marginTop: 10 }}>
            <button type="button" style={s.btnSec} onClick={() => setLines((ls) => [...ls, { accountId: '', amount: '' }])}>+ Add line</button>
            <div style={{ flex: 1 }} />
            <button type="button" style={s.btnAccent} onClick={create} disabled={busy}>Create budget</button>
          </div>
        </div>
      )}

      <div style={s.panel}>
        {initialBudgets.length === 0 ? (
          <p style={s.muted}>No budgets yet.</p>
        ) : (
          <table style={s.table}>
            <thead><tr>{['Name', 'Period', 'Lines', ''].map((h) => <th key={h} style={s.th}>{h}</th>)}</tr></thead>
            <tbody>
              {initialBudgets.map((b) => (
                <tr key={b.id}>
                  <td style={s.td}><strong>{b.name}</strong></td>
                  <td style={s.tdM}>{b.from} → {b.to}</td>
                  <td style={s.tdM}>{b.lines.length}</td>
                  <td style={{ ...s.td, textAlign: 'right' }}>
                    <button type="button" style={s.btnSec} onClick={() => viewBva(b.id)} disabled={busy}>Budget vs Actual</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {bva && (
        <div style={s.panel}>
          <h3 style={{ margin: '4px 8px 12px' }}>{bva.data.name} — Budget vs Actual <span style={s.muted}>({bva.data.from} → {bva.data.to})</span></h3>
          <table style={s.table}>
            <thead><tr>
              <th style={s.th}>Account</th>
              {['Budget', 'Actual', 'Variance', 'Var %'].map((h) => <th key={h} style={{ ...s.th, textAlign: 'right' }}>{h}</th>)}
            </tr></thead>
            <tbody>
              {bva.data.rows.map((r) => (
                <tr key={r.code}>
                  <td style={s.td}><span style={s.code}>{r.code}</span> {r.name}</td>
                  <td style={s.tdNum}>{money(r.budget)}</td>
                  <td style={s.tdNum}>{money(r.actual)}</td>
                  <td style={{ ...s.tdNum, color: r.variance >= 0 ? 'var(--good)' : 'var(--bad)' }}>{money(r.variance)}</td>
                  <td style={s.tdNum}>{r.variancePct == null ? '—' : `${r.variancePct}%`}</td>
                </tr>
              ))}
              <tr>
                <td style={s.totalLabel}>Total</td>
                <td style={s.totalVal}>{money(bva.data.totalBudget)}</td>
                <td style={s.totalVal}>{money(bva.data.totalActual)}</td>
                <td style={{ ...s.totalVal, color: bva.data.totalVariance >= 0 ? 'var(--good)' : 'var(--bad)' }}>{money(bva.data.totalVariance)}</td>
                <td style={s.totalVal}></td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const field: CSSProperties = { background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', padding: '7px 10px', fontSize: 13, outline: 'none' };
const s = {
  tabBar: { display: 'flex', gap: 4, alignItems: 'center' } as CSSProperties,
  btnAccent: { background: 'var(--accent)', color: '#0b0e14', fontWeight: 600, border: 'none', borderRadius: 8, padding: '7px 14px', fontSize: 13, cursor: 'pointer' } as CSSProperties,
  btnSec: { ...field, cursor: 'pointer', fontWeight: 500 } as CSSProperties,
  formPanel: { background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 16px' } as CSSProperties,
  formRow: { display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' } as CSSProperties,
  input: { ...field, flex: 1, minWidth: 140 } as CSSProperties,
  panel: { background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 14, padding: '8px 8px' } as CSSProperties,
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 13 } as CSSProperties,
  th: { textAlign: 'left', color: 'var(--muted)', fontWeight: 500, fontSize: 11.5, textTransform: 'uppercase', letterSpacing: 0.5, padding: '10px 12px', borderBottom: '1px solid var(--border)' } as CSSProperties,
  td: { padding: '9px 12px', borderBottom: '1px solid var(--border)', verticalAlign: 'middle' } as CSSProperties,
  tdM: { padding: '9px 12px', borderBottom: '1px solid var(--border)', color: 'var(--muted)' } as CSSProperties,
  tdNum: { padding: '9px 12px', borderBottom: '1px solid var(--border)', textAlign: 'right', fontVariantNumeric: 'tabular-nums' } as CSSProperties,
  totalLabel: { padding: '9px 12px', fontWeight: 700, borderTop: '2px solid var(--border)' } as CSSProperties,
  totalVal: { padding: '9px 12px', fontWeight: 700, textAlign: 'right', borderTop: '2px solid var(--border)', fontVariantNumeric: 'tabular-nums' } as CSSProperties,
  code: { fontFamily: 'ui-monospace, monospace', fontSize: 11.5, color: 'var(--muted)', marginRight: 6 } as CSSProperties,
  muted: { color: 'var(--muted)', padding: '14px 12px', margin: 0, fontWeight: 400 } as CSSProperties,
  errorBar: { background: 'rgba(220,53,69,0.1)', border: '1px solid rgba(220,53,69,0.2)', color: '#dc3545', padding: '10px 14px', borderRadius: 10, fontSize: 13 } as CSSProperties,
};

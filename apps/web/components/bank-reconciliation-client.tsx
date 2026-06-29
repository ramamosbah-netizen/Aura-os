'use client';

import { type CSSProperties, useState } from 'react';

interface BankTransaction {
  id: string;
  bankAccountId: string;
  transactionDate: string;
  amount: number;
  description: string;
  reference: string | null;
  reconciledPaymentId: string | null;
  status: 'unreconciled' | 'matched' | 'manual';
}

function money(n: number): string {
  return new Intl.NumberFormat('en-AE', { style: 'currency', currency: 'AED', maximumFractionDigits: 2 }).format(n);
}

const statusColor = (s: string): string =>
  s === 'matched' ? 'var(--good)' : s === 'manual' ? 'var(--accent)' : 'var(--muted)';

// Parse pasted statement lines: "YYYY-MM-DD, amount, description[, reference]" (one per line).
function parseStatement(text: string): Array<{ transactionDate: string; amount: number; description: string; reference?: string }> {
  const out: Array<{ transactionDate: string; amount: number; description: string; reference?: string }> = [];
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    const parts = line.split(',').map((p) => p.trim());
    if (parts.length < 3) continue;
    const amount = Number(parts[1]);
    if (!parts[0] || !Number.isFinite(amount)) continue;
    out.push({ transactionDate: parts[0], amount, description: parts[2], reference: parts[3] || undefined });
  }
  return out;
}

export default function BankReconciliationClient() {
  const [bankAccountId, setBankAccountId] = useState('');
  const [txs, setTxs] = useState<BankTransaction[]>([]);
  const [importText, setImportText] = useState('');
  const [payIds, setPayIds] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState('');
  const [loaded, setLoaded] = useState(false);

  async function load(): Promise<void> {
    setMsg('');
    if (!bankAccountId.trim()) {
      setMsg('Enter a bank account id to load its statement.');
      return;
    }
    const res = await fetch(`/api/finance/bank-transactions?bankAccountId=${encodeURIComponent(bankAccountId.trim())}`);
    const data = await res.json().catch(() => []);
    setTxs(Array.isArray(data) ? data : []);
    setLoaded(true);
  }

  async function importStatement(): Promise<void> {
    setMsg('');
    const transactions = parseStatement(importText);
    if (!bankAccountId.trim() || transactions.length === 0) {
      setMsg('Enter a bank account id and at least one valid line (date, amount, description).');
      return;
    }
    const res = await fetch('/api/finance/bank-transactions', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ bankAccountId: bankAccountId.trim(), transactions }),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setMsg(d.error ?? d.message ?? 'Import failed');
      return;
    }
    setImportText('');
    setMsg(`Imported ${transactions.length} line(s).`);
    await load();
  }

  async function autoMatch(): Promise<void> {
    setMsg('');
    const res = await fetch('/api/finance/bank-transactions/auto-match', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ bankAccountId: bankAccountId.trim() }),
    });
    const data = await res.json().catch(() => []);
    setMsg(`Auto-matched ${Array.isArray(data) ? data.length : 0} transaction(s).`);
    await load();
  }

  async function reconcile(id: string): Promise<void> {
    const paymentId = (payIds[id] ?? '').trim();
    if (!paymentId) {
      setMsg('Enter a payment id to match this line.');
      return;
    }
    const res = await fetch(`/api/finance/bank-transactions/${id}/reconcile`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ paymentId }),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setMsg(d.error ?? d.message ?? 'Reconcile failed');
      return;
    }
    await load();
  }

  async function unreconcile(id: string): Promise<void> {
    await fetch(`/api/finance/bank-transactions/${id}/unreconcile`, { method: 'POST' });
    await load();
  }

  const unreconciled = txs.filter((t) => t.status === 'unreconciled');
  const reconciledCount = txs.length - unreconciled.length;
  const unreconciledTotal = unreconciled.reduce((sum, t) => sum + t.amount, 0);

  return (
    <div>
      <div style={s.card}>
        <div style={s.row}>
          <label style={s.field}>
            <span style={s.label}>Bank account id (UUID)</span>
            <input style={s.input} value={bankAccountId} onChange={(e) => setBankAccountId(e.target.value)} placeholder="bank account UUID" />
          </label>
          <button type="button" style={s.primary} onClick={load}>Load statement</button>
          {loaded && <button type="button" style={s.secondary} onClick={autoMatch}>Auto-match</button>}
        </div>
        <label style={{ ...s.field, marginTop: 12 }}>
          <span style={s.label}>Import statement lines — one per line: <code style={s.code}>date, amount, description, reference</code></span>
          <textarea style={s.textarea} rows={3} value={importText} onChange={(e) => setImportText(e.target.value)} placeholder={'2026-06-20, 12600, Client receipt IPC-001, TT-9921\n2026-06-22, -4200, Supplier payment'} />
        </label>
        <div style={s.row}>
          <button type="button" style={s.secondary} onClick={importStatement}>Import lines</button>
          {msg && <span style={s.msg}>{msg}</span>}
        </div>
        {loaded && (
          <div style={s.summary}>
            <Stat label="Lines" value={String(txs.length)} />
            <Stat label="Reconciled" value={String(reconciledCount)} />
            <Stat label="Unreconciled" value={String(unreconciled.length)} accent />
            <Stat label="Unreconciled total" value={money(unreconciledTotal)} />
          </div>
        )}
      </div>

      {loaded && (
        <table style={s.table}>
          <thead>
            <tr>
              <th style={s.th}>Date</th>
              <th style={s.th}>Description</th>
              <th style={s.th}>Reference</th>
              <th style={s.thR}>Amount</th>
              <th style={s.th}>Status</th>
              <th style={s.th} />
            </tr>
          </thead>
          <tbody>
            {txs.length === 0 ? (
              <tr><td style={s.muted} colSpan={6}>No transactions — import a statement above.</td></tr>
            ) : (
              txs.map((t) => (
                <tr key={t.id} style={s.trow}>
                  <td style={s.tdMuted}>{t.transactionDate}</td>
                  <td style={s.td}>{t.description}</td>
                  <td style={s.tdMuted}>{t.reference ?? '—'}</td>
                  <td style={{ ...s.tdR, color: t.amount < 0 ? 'var(--bad)' : 'var(--text)' }}>{money(t.amount)}</td>
                  <td style={s.td}><span style={s.tag(t.status)}>{t.status}</span></td>
                  <td style={s.tdR}>
                    {t.status === 'unreconciled' ? (
                      <span style={s.matchRow}>
                        <input style={s.miniInput} placeholder="payment id" value={payIds[t.id] ?? ''} onChange={(e) => setPayIds({ ...payIds, [t.id]: e.target.value })} />
                        <button type="button" style={s.smallBtn} onClick={() => reconcile(t.id)}>Match</button>
                      </span>
                    ) : (
                      <button type="button" style={s.smallBtn} onClick={() => unreconcile(t.id)}>Unreconcile</button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      )}
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

const s = {
  card: { background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 14, padding: 18 } as CSSProperties,
  row: { display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap', marginTop: 10 } as CSSProperties,
  field: { display: 'flex', flexDirection: 'column', gap: 5, flex: 1, minWidth: 200 } as CSSProperties,
  label: { fontSize: 12, color: 'var(--muted)' } as CSSProperties,
  code: { background: 'var(--panel-2)', borderRadius: 5, padding: '1px 5px', fontSize: 12 } as CSSProperties,
  input: { background: 'var(--panel-2)', border: '1px solid var(--border)', borderRadius: 9, color: 'var(--text)', padding: '9px 11px', fontSize: 14 } as CSSProperties,
  textarea: { background: 'var(--panel-2)', border: '1px solid var(--border)', borderRadius: 9, color: 'var(--text)', padding: '9px 11px', fontSize: 13, fontFamily: 'ui-monospace, monospace', resize: 'vertical' } as CSSProperties,
  miniInput: { background: 'var(--panel-2)', border: '1px solid var(--border)', borderRadius: 7, color: 'var(--text)', padding: '5px 8px', fontSize: 12.5, width: 120 } as CSSProperties,
  primary: { background: 'var(--accent)', border: 'none', borderRadius: 9, color: '#fff', padding: '9px 16px', fontSize: 14, cursor: 'pointer', fontWeight: 600 } as CSSProperties,
  secondary: { background: 'var(--panel-2)', border: '1px solid var(--border)', borderRadius: 9, color: 'var(--text)', padding: '9px 14px', fontSize: 14, cursor: 'pointer' } as CSSProperties,
  msg: { color: 'var(--muted)', fontSize: 13 } as CSSProperties,
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
  tdMuted: { padding: '10px', color: 'var(--muted)' } as CSSProperties,
  tdR: { padding: '10px', textAlign: 'right' } as CSSProperties,
  muted: { color: 'var(--muted)', padding: '12px 10px' } as CSSProperties,
  matchRow: { display: 'inline-flex', gap: 6, alignItems: 'center' } as CSSProperties,
  tag: (st: string): CSSProperties => ({ fontSize: 11.5, color: statusColor(st), border: `1px solid ${statusColor(st)}`, borderRadius: 999, padding: '1px 9px' }),
  smallBtn: { background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', padding: '6px 11px', fontSize: 12.5, cursor: 'pointer' } as CSSProperties,
};

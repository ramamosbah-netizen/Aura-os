'use client';

import { type CSSProperties, useMemo, useState } from 'react';

interface PostDatedCheque {
  id: string;
  chequeNumber: string;
  direction: 'received' | 'issued';
  partyName: string;
  bankName: string;
  amount: number;
  currency: string;
  issueDate: string;
  maturityDate: string;
  status: 'pending' | 'deposited' | 'cleared' | 'bounced' | 'cancelled';
  reference: string | null;
  bounceCount: number;
}

type Action = 'deposit' | 'clear' | 'bounce' | 'represent' | 'cancel';

const statusColor: Record<string, string> = {
  pending: '#2563eb', deposited: '#7c3aed', cleared: '#16a34a', bounced: '#dc2626', cancelled: '#6b7280',
};
const today = () => new Date().toISOString().slice(0, 10);

function daysTo(maturity: string): number {
  return Math.round((Date.parse(`${maturity}T00:00:00Z`) - Date.parse(`${today()}T00:00:00Z`)) / 86_400_000);
}

// Which actions are valid from each status (mirrors the domain transitions).
const ACTIONS_FOR: Record<string, Action[]> = {
  pending: ['deposit', 'cancel'],
  deposited: ['clear', 'bounce'],
  bounced: ['represent', 'cancel'],
  cleared: [],
  cancelled: [],
};

export default function PostDatedChequesClient({ initialCheques }: { initialCheques: PostDatedCheque[] }) {
  const [cheques, setCheques] = useState(initialCheques);
  const [chequeNumber, setChequeNumber] = useState('');
  const [direction, setDirection] = useState<'received' | 'issued'>('received');
  const [partyName, setPartyName] = useState('');
  const [bankName, setBankName] = useState('');
  const [amount, setAmount] = useState('');
  const [issueDate, setIssueDate] = useState(today());
  const [maturityDate, setMaturityDate] = useState('');
  const [reference, setReference] = useState('');
  const [error, setError] = useState('');

  const totals = useMemo(() => {
    const open = cheques.filter((c) => c.status === 'pending' || c.status === 'deposited');
    const receivable = open.filter((c) => c.direction === 'received').reduce((s, c) => s + c.amount, 0);
    const payable = open.filter((c) => c.direction === 'issued').reduce((s, c) => s + c.amount, 0);
    const maturingSoon = cheques.filter((c) => c.status === 'pending' && daysTo(c.maturityDate) <= 7).length;
    const bounced = cheques.filter((c) => c.status === 'bounced').length;
    return { receivable, payable, maturingSoon, bounced };
  }, [cheques]);

  const sortByMaturity = (list: PostDatedCheque[]) => [...list].sort((a, b) => a.maturityDate.localeCompare(b.maturityDate));

  const create = async () => {
    setError('');
    if (!chequeNumber.trim() || !partyName.trim() || !bankName.trim()) return setError('Cheque no., party, and bank are required');
    if (!(Number(amount) > 0)) return setError('Amount must be positive');
    if (!maturityDate) return setError('Maturity date is required');
    try {
      const res = await fetch('/api/finance/post-dated-cheques', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ chequeNumber, direction, partyName, bankName, amount: Number(amount), issueDate, maturityDate, reference: reference || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || data.error || 'Failed');
      setCheques((prev) => sortByMaturity([...prev, data]));
      setChequeNumber(''); setPartyName(''); setBankName(''); setAmount(''); setMaturityDate(''); setReference('');
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const act = async (id: string, action: Action) => {
    setError('');
    try {
      const res = await fetch(`/api/finance/post-dated-cheques/${id}/status`, {
        method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || data.error || 'Failed');
      setCheques((prev) => prev.map((c) => (c.id === id ? data : c)));
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <>
      <div style={st.cards}>
        <div style={st.card}><div style={st.cardLabel}>Receivable (open)</div><div style={{ ...st.cardVal, color: '#16a34a' }}>{totals.receivable.toLocaleString()} AED</div></div>
        <div style={st.card}><div style={st.cardLabel}>Payable (open)</div><div style={{ ...st.cardVal, color: '#dc2626' }}>{totals.payable.toLocaleString()} AED</div></div>
        <div style={st.card}><div style={st.cardLabel}>Maturing ≤7d</div><div style={{ ...st.cardVal, color: totals.maturingSoon > 0 ? '#d97706' : undefined }}>{totals.maturingSoon}</div></div>
        <div style={st.card}><div style={st.cardLabel}>Bounced</div><div style={{ ...st.cardVal, color: totals.bounced > 0 ? '#dc2626' : undefined }}>{totals.bounced}</div></div>
      </div>

      <h2 style={st.h2}>New cheque</h2>
      <div style={st.form}>
        <label style={st.label}>Cheque no.<input style={st.input} value={chequeNumber} onChange={(e) => setChequeNumber(e.target.value)} placeholder="000123" /></label>
        <label style={st.label}>Direction
          <select style={st.input} value={direction} onChange={(e) => setDirection(e.target.value as 'received' | 'issued')}>
            <option value="received">received (AR)</option>
            <option value="issued">issued (AP)</option>
          </select>
        </label>
        <label style={st.label}>{direction === 'received' ? 'Drawer' : 'Payee'}<input style={st.input} value={partyName} onChange={(e) => setPartyName(e.target.value)} placeholder="Party name" /></label>
        <label style={st.label}>Bank<input style={st.input} value={bankName} onChange={(e) => setBankName(e.target.value)} placeholder="Emirates NBD" /></label>
        <label style={st.label}>Amount<input style={st.input} type="number" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="50000" /></label>
        <label style={st.label}>Issue<input style={st.input} type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} /></label>
        <label style={st.label}>Maturity<input style={st.input} type="date" value={maturityDate} onChange={(e) => setMaturityDate(e.target.value)} /></label>
        <label style={st.label}>Ref<input style={st.input} value={reference} onChange={(e) => setReference(e.target.value)} placeholder="INV-001" /></label>
        <button style={st.btn} onClick={create}>Add</button>
      </div>
      {error && <p style={st.err}>{error}</p>}

      <h2 style={st.h2}>Cheques</h2>
      {cheques.length === 0 ? (
        <p style={st.muted}>No post-dated cheques recorded.</p>
      ) : (
        <table style={st.table}>
          <thead><tr>
            <th style={st.th}>Cheque</th><th style={st.th}>Dir</th><th style={st.th}>Party</th><th style={st.th}>Bank</th>
            <th style={st.th}>Amount</th><th style={st.th}>Maturity</th><th style={st.th}>Status</th><th style={st.th}>Actions</th>
          </tr></thead>
          <tbody>
            {cheques.map((c) => {
              const d = daysTo(c.maturityDate);
              const soon = c.status === 'pending' && d <= 7;
              return (
                <tr key={c.id}>
                  <td style={st.td}>{c.chequeNumber}{c.reference && <span style={st.ref}> · {c.reference}</span>}</td>
                  <td style={st.td}><span style={{ color: c.direction === 'received' ? '#16a34a' : '#dc2626', fontWeight: 600 }}>{c.direction === 'received' ? 'in' : 'out'}</span></td>
                  <td style={st.td}>{c.partyName}</td>
                  <td style={st.td}>{c.bankName}</td>
                  <td style={st.td}>{c.amount.toLocaleString()} {c.currency}</td>
                  <td style={{ ...st.td, color: soon ? '#d97706' : undefined, fontWeight: soon ? 600 : 400 }}>
                    {c.maturityDate}{c.status === 'pending' && ` (${d}d)`}
                  </td>
                  <td style={{ ...st.td, color: statusColor[c.status] || '#000', fontWeight: 600 }}>
                    {c.status}{c.bounceCount > 0 && <span style={st.bounce}> ×{c.bounceCount}</span>}
                  </td>
                  <td style={st.td}>
                    {ACTIONS_FOR[c.status].map((a) => (
                      <button key={a} style={btnStyle(a)} onClick={() => act(c.id, a)}>{a}</button>
                    ))}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </>
  );
}

function btnStyle(a: Action): CSSProperties {
  const bg = a === 'clear' ? '#16a34a' : a === 'bounce' ? '#dc2626' : a === 'deposit' ? '#7c3aed' : a === 'represent' ? '#2563eb' : 'var(--surface-2, #e5e7eb)';
  const color = a === 'cancel' ? 'inherit' : '#fff';
  return { padding: '4px 10px', borderRadius: 4, background: bg, color, border: 'none', fontSize: 12, cursor: 'pointer', marginRight: 4 };
}

const st = {
  cards: { display: 'flex', gap: 14, marginBottom: 22, flexWrap: 'wrap' as const } as CSSProperties,
  card: { padding: '12px 18px', borderRadius: 8, border: '1px solid var(--border, #e5e7eb)', minWidth: 150 } as CSSProperties,
  cardLabel: { fontSize: 12, color: 'var(--muted)', textTransform: 'uppercase' as const, letterSpacing: 0.5 } as CSSProperties,
  cardVal: { fontSize: 22, fontWeight: 700, marginTop: 4 } as CSSProperties,
  form: { display: 'flex', flexWrap: 'wrap' as const, gap: 12, alignItems: 'flex-end', marginBottom: 10 } as CSSProperties,
  label: { display: 'flex', flexDirection: 'column' as const, fontSize: 13, fontWeight: 600, gap: 4 } as CSSProperties,
  input: { padding: '7px 10px', borderRadius: 6, border: '1px solid var(--border, #ccc)', fontSize: 14, minWidth: 110 } as CSSProperties,
  btn: { padding: '8px 18px', borderRadius: 6, background: 'var(--accent, #2563eb)', color: '#fff', border: 'none', fontWeight: 600, cursor: 'pointer', fontSize: 14 } as CSSProperties,
  err: { color: '#dc2626', margin: '6px 0 0', fontSize: 13 } as CSSProperties,
  h2: { fontSize: 20, margin: '18px 0 10px' } as CSSProperties,
  muted: { color: 'var(--muted)', padding: '14px 0' } as CSSProperties,
  table: { width: '100%', borderCollapse: 'collapse' as const, fontSize: 14 } as CSSProperties,
  th: { textAlign: 'left' as const, padding: '8px 12px', borderBottom: '2px solid var(--border, #e5e7eb)', fontWeight: 600 } as CSSProperties,
  td: { padding: '8px 12px', borderBottom: '1px solid var(--border, #e5e7eb)' } as CSSProperties,
  ref: { color: 'var(--muted)', fontSize: 12 } as CSSProperties,
  bounce: { color: '#dc2626', fontSize: 12 } as CSSProperties,
};

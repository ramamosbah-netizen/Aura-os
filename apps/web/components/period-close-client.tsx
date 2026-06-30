'use client';

import { type CSSProperties, useState } from 'react';
import { useRouter } from 'next/navigation';

interface PeriodClose {
  id: string;
  period: string;
  closedAt: string;
  closedBy: string | null;
  note: string | null;
}

function fmt(iso: string) {
  return new Date(iso).toLocaleDateString();
}

export default function PeriodCloseClient({ initialCloses }: { initialCloses: PeriodClose[] }) {
  const router = useRouter();
  const [period, setPeriod] = useState('');
  const [note, setNote] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function close() {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) {
      setErr('Enter a period as YYYY-MM (e.g. 2026-01)');
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch('/api/finance/periods/close', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ period, note: note || undefined }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setErr(d.error ?? d.message ?? 'Error');
      } else {
        setPeriod('');
        setNote('');
        router.refresh();
      }
    } catch {
      setErr('API unreachable');
    } finally {
      setBusy(false);
    }
  }

  async function reopen(p: string) {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch('/api/finance/periods/reopen', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ period: p }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setErr(d.error ?? d.message ?? 'Error');
      } else {
        router.refresh();
      }
    } catch {
      setErr('API unreachable');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {err && <div style={s.errorBar}>{err}</div>}

      <div style={s.formPanel}>
        <div style={s.formRow}>
          <input
            style={{ ...s.input, width: 130 }}
            placeholder="YYYY-MM"
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
          />
          <input style={s.input} placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
          <button type="button" style={s.btnAccent} onClick={close} disabled={busy}>
            Close period
          </button>
        </div>
      </div>

      <div style={s.panel}>
        {initialCloses.length === 0 ? (
          <p style={s.muted}>No periods closed yet.</p>
        ) : (
          <table style={s.table}>
            <thead>
              <tr>
                {['Period', 'Closed On', 'Note', ''].map((h) => (
                  <th key={h} style={s.th}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {initialCloses.map((c) => (
                <tr key={c.id}>
                  <td style={s.td}>
                    <strong>{c.period}</strong> <span style={s.lock}>🔒 locked</span>
                  </td>
                  <td style={s.tdM}>{fmt(c.closedAt)}</td>
                  <td style={s.tdM}>{c.note ?? '—'}</td>
                  <td style={{ ...s.td, textAlign: 'right' }}>
                    <button type="button" style={s.btnSec} onClick={() => reopen(c.period)} disabled={busy}>
                      Reopen
                    </button>
                  </td>
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
  formRow: { display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' } as CSSProperties,
  input: { ...field, flex: 1, minWidth: 140 } as CSSProperties,
  btnAccent: { background: 'var(--accent)', color: '#0b0e14', fontWeight: 600, border: 'none', borderRadius: 8, padding: '7px 14px', fontSize: 13, cursor: 'pointer' } as CSSProperties,
  btnSec: { ...field, cursor: 'pointer', fontWeight: 500 } as CSSProperties,
  panel: { background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 14, padding: '8px 8px' } as CSSProperties,
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 13 } as CSSProperties,
  th: { textAlign: 'left', color: 'var(--muted)', fontWeight: 500, fontSize: 11.5, textTransform: 'uppercase', letterSpacing: 0.5, padding: '10px 12px', borderBottom: '1px solid var(--border)' } as CSSProperties,
  td: { padding: '10px 12px', borderBottom: '1px solid var(--border)', verticalAlign: 'middle' } as CSSProperties,
  tdM: { padding: '10px 12px', borderBottom: '1px solid var(--border)', color: 'var(--muted)' } as CSSProperties,
  muted: { color: 'var(--muted)', padding: '14px 12px', margin: 0 } as CSSProperties,
  lock: { fontSize: 11, color: 'var(--muted)' } as CSSProperties,
  errorBar: { background: 'rgba(220,53,69,0.1)', border: '1px solid rgba(220,53,69,0.2)', color: '#dc3545', padding: '10px 14px', borderRadius: 10, fontSize: 13 } as CSSProperties,
};

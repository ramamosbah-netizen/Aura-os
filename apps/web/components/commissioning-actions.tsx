'use client';

import { useState, type CSSProperties } from 'react';
import { useRouter } from 'next/navigation';

interface OpenPunch { id: string; description: string; severity: string }

/**
 * Commissioning 360 actions (G-34+). Close outstanding punch items (the retest gate) and record the
 * witnessed sign-off. The backend enforces "no open defects" before commissioning — the button
 * surfaces that 409 rather than hiding it.
 */
export default function CommissioningActions({
  id, status, openPunch, allPassed,
}: { id: string; status: string; openPunch: OpenPunch[]; allPassed: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [by, setBy] = useState('');
  const [witness, setWitness] = useState('');

  async function call(path: string, body: Record<string, unknown>): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/commissioning/records/${id}/${path}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { message?: string; error?: string };
        throw new Error(data.message || data.error || `Command failed (${res.status})`);
      }
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Command failed');
    } finally {
      setBusy(false);
    }
  }

  if (status === 'commissioned') {
    return <div style={st.wrap} data-testid="cx-actions" data-status={status}><span style={st.locked} data-testid="cx-locked">🔒 Commissioned &amp; witnessed — immutable.</span></div>;
  }

  return (
    <div style={st.wrap} data-testid="cx-actions" data-status={status}>
      {openPunch.length > 0 && (
        <div style={st.punchGate} data-testid="punch-gate">
          <strong>{openPunch.length} open punch item(s)</strong> must be closed before sign-off:
          {openPunch.map((p) => (
            <button key={p.id} style={st.closeBtn} disabled={busy} data-testid={`close-punch-${p.id}`}
              onClick={() => call(`punch/${p.id}/close`, { resolution: `Rectified: ${p.description}` })}>
              Close “{p.description}” →
            </button>
          ))}
        </div>
      )}

      <div style={st.group}>
        <input style={st.input} placeholder="Commissioned by" value={by} onChange={(e) => setBy(e.target.value)} />
        <input style={st.input} placeholder="Witnessed by (consultant/client)" value={witness} onChange={(e) => setWitness(e.target.value)} />
        <button
          style={{ ...st.primary, ...(allPassed && openPunch.length === 0 ? {} : st.primaryDim) }}
          disabled={busy}
          data-testid="btn-commission"
          onClick={() => call('commission', { commissionedBy: by || 'Engineer', witnessedBy: witness || 'Consultant' })}
        >
          Commission (sign off)
        </button>
      </div>
      {!allPassed && <span style={st.hint}>All test points must pass before sign-off.</span>}
      {error && <span style={st.error} data-testid="cx-error">{error}</span>}
    </div>
  );
}

const st = {
  wrap: { display: 'flex', flexDirection: 'column', gap: 10, padding: '14px 16px', border: '1px solid var(--border, #e5e7eb)', borderRadius: 12, background: 'var(--surface, rgba(0,0,0,.02))' } as CSSProperties,
  group: { display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' } as CSSProperties,
  input: { padding: '7px 10px', borderRadius: 8, border: '1px solid var(--border, #d1d5db)', fontSize: 13, background: 'var(--bg, #fff)', color: 'inherit', minWidth: 180 } as CSSProperties,
  primary: { padding: '8px 14px', borderRadius: 8, border: 'none', background: '#16a34a', color: '#fff', fontWeight: 600, fontSize: 13, cursor: 'pointer' } as CSSProperties,
  primaryDim: { background: '#94a3b8' } as CSSProperties,
  punchGate: { fontSize: 13, color: '#d97706', display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' } as CSSProperties,
  closeBtn: { padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border, #d1d5db)', background: 'var(--bg, #fff)', color: 'inherit', fontSize: 12, cursor: 'pointer' } as CSSProperties,
  locked: { color: 'var(--muted)', fontSize: 13 } as CSSProperties,
  hint: { color: 'var(--muted)', fontSize: 12 } as CSSProperties,
  error: { color: '#dc2626', fontSize: 13, fontWeight: 600 } as CSSProperties,
};

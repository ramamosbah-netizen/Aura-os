'use client';

import { useState, type CSSProperties } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Work-order action bar (G-08 residue). Renders only the commands legal from the current status
 * and POSTs them to the state-machine endpoints — it never sets `status` directly. The backend
 * enforces the transition; on success we refresh the server-rendered 360 so the SLA outcome
 * (stamped at completion) appears.
 */
export default function WorkOrderActions({ id, status }: { id: string; status: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [technician, setTechnician] = useState('');
  const [cost, setCost] = useState('');

  async function run(command: string, body: Record<string, unknown> = {}): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/amc/work-orders/${id}/${command}`, {
        method: 'POST',
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

  const terminal = status === 'completed' || status === 'cancelled';

  return (
    <div style={st.wrap} data-testid="work-order-actions" data-status={status}>
      {status === 'open' && (
        <div style={st.group}>
          <input
            style={st.input}
            placeholder="Technician"
            value={technician}
            onChange={(e) => setTechnician(e.target.value)}
            data-testid="input-technician"
          />
          <button style={st.primary} disabled={busy} data-testid="btn-assign" onClick={() => void run('assign', { technicianId: technician })}>
            Assign technician
          </button>
        </div>
      )}

      {status === 'assigned' && (
        <button style={st.ghost} disabled={busy} data-testid="btn-start" onClick={() => void run('start')}>
          Start work
        </button>
      )}

      {(status === 'assigned' || status === 'in_progress') && (
        <div style={st.group}>
          <input
            style={st.input}
            placeholder="Billable cost"
            inputMode="decimal"
            value={cost}
            onChange={(e) => setCost(e.target.value)}
            data-testid="input-cost"
          />
          <button
            style={st.primary}
            disabled={busy}
            data-testid="btn-complete"
            onClick={() => void run('complete', cost ? { cost: Number(cost) } : {})}
          >
            Complete visit
          </button>
        </div>
      )}

      {!terminal && (
        <button style={st.danger} disabled={busy} data-testid="btn-cancel" onClick={() => void run('cancel')}>
          Cancel
        </button>
      )}

      {terminal && (
        <p style={st.terminal} data-testid="work-order-terminal">
          This work order is {status}. A finished visit is never re-opened — raise a follow-up order.
        </p>
      )}

      {error ? (
        <p style={st.error} data-testid="work-order-action-error">
          {error}
        </p>
      ) : null}
    </div>
  );
}

const st = {
  wrap: { display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', marginBottom: 18 } as CSSProperties,
  group: { display: 'flex', gap: 8, alignItems: 'center' } as CSSProperties,
  input: { border: '1px solid var(--border, #d1d5db)', borderRadius: 8, padding: '8px 11px', fontSize: 13.5, minWidth: 160 } as CSSProperties,
  primary: { background: 'var(--accent, #2563eb)', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 16px', fontSize: 13.5, fontWeight: 700, cursor: 'pointer' } as CSSProperties,
  ghost: { background: 'transparent', color: 'var(--muted)', border: '1px solid var(--border, #d1d5db)', borderRadius: 8, padding: '9px 14px', fontSize: 13.5, cursor: 'pointer' } as CSSProperties,
  danger: { background: 'transparent', color: '#dc2626', border: '1px solid rgba(239,68,68,.5)', borderRadius: 8, padding: '9px 14px', fontSize: 13.5, fontWeight: 600, cursor: 'pointer' } as CSSProperties,
  terminal: { color: 'var(--muted)', fontSize: 13, margin: 0, width: '100%' } as CSSProperties,
  error: { color: '#dc2626', fontSize: 13, margin: 0, width: '100%' } as CSSProperties,
};

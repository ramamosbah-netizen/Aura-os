'use client';

import { useState, type CSSProperties } from 'react';
import { useRouter } from 'next/navigation';
import { useHydrated } from '@/lib/use-hydrated';

/**
 * NCR corrective-action bar. Renders only the commands legal from the current status and POSTs them
 * to the state-machine endpoints (never sets `status` directly). The backend enforces the transition;
 * on success we refresh the server-rendered 360 so records + lineage update.
 */
export default function NcrWorkflowActions({ id, status }: { id: string; status: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  // Controls stay inert until React attaches — see `useHydrated`. A click or a keystroke
  // landing on the server-rendered markup is otherwise swallowed without trace.
  const hydrated = useHydrated();
  const locked = busy || !hydrated;
  const [error, setError] = useState<string | null>(null);
  const [rootCause, setRootCause] = useState('');
  const [correctiveAction, setCorrectiveAction] = useState('');
  const [assignedTo, setAssignedTo] = useState('');
  const [note, setNote] = useState('');

  async function run(command: string, body: Record<string, unknown> = {}): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/quality/ncrs/${id}/${command}`, {
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

  const immutable = status === 'closed';

  return (
    <div style={st.wrap} data-testid="ncr-actions" data-status={status}>
      {status === 'raised' && (
        <div style={st.group}>
          <input style={st.input} placeholder="Root cause (required)" value={rootCause} onChange={(e) => setRootCause(e.target.value)} disabled={locked} />
          <input style={{ ...st.input, minWidth: 220 }} placeholder="Corrective action (required)" value={correctiveAction} onChange={(e) => setCorrectiveAction(e.target.value)} disabled={locked} />
          <input style={st.input} placeholder="Assign to" value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)} disabled={locked} />
          <button style={st.primary} disabled={locked} data-testid="btn-plan" onClick={() => run('plan', { rootCause, correctiveAction, assignedTo })}>
            Plan corrective action
          </button>
        </div>
      )}

      {status === 'action_planned' && (
        <button style={st.primary} disabled={locked} data-testid="btn-correct" onClick={() => run('correct')}>
          Mark corrected
        </button>
      )}

      {status === 'corrected' && (
        <div style={st.group}>
          <input style={{ ...st.input, minWidth: 260 }} placeholder="Verification note (required to reject)" value={note} onChange={(e) => setNote(e.target.value)} disabled={locked} />
          <button style={st.primary} disabled={locked} data-testid="btn-verify-accept" onClick={() => run('verify', { accepted: true, note })}>
            Verify &amp; close
          </button>
          <button style={st.danger} disabled={locked} data-testid="btn-verify-reject" onClick={() => run('verify', { accepted: false, note })}>
            Reject correction
          </button>
        </div>
      )}

      {immutable && <span style={st.locked} data-testid="ncr-locked">🔒 This NCR is closed and immutable.</span>}
      {error && <span style={st.error} data-testid="ncr-error">{error}</span>}
    </div>
  );
}

const st = {
  wrap: { display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', padding: '14px 16px', border: '1px solid var(--border, #e5e7eb)', borderRadius: 12, background: 'var(--surface, rgba(0,0,0,.02))' } as CSSProperties,
  group: { display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' } as CSSProperties,
  input: { padding: '7px 10px', borderRadius: 8, border: '1px solid var(--border, #d1d5db)', fontSize: 13, background: 'var(--bg, #fff)', color: 'inherit', minWidth: 170 } as CSSProperties,
  primary: { padding: '8px 14px', borderRadius: 8, border: 'none', background: '#2563eb', color: '#fff', fontWeight: 600, fontSize: 13, cursor: 'pointer' } as CSSProperties,
  danger: { padding: '8px 14px', borderRadius: 8, border: 'none', background: '#dc2626', color: '#fff', fontWeight: 600, fontSize: 13, cursor: 'pointer' } as CSSProperties,
  locked: { color: 'var(--muted)', fontSize: 13 } as CSSProperties,
  error: { color: '#dc2626', fontSize: 13, fontWeight: 600, width: '100%' } as CSSProperties,
};

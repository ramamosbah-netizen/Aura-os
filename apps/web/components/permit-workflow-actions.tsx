'use client';

import { useState, type CSSProperties } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Permit-to-work action bar (G-08 residue). Renders only the commands legal from the current
 * status and PUTs them to the state-machine endpoints — it never sets `status` directly.
 *
 * The approve button is disabled while any authorisation gate is failing, and says WHICH gate.
 * That is a UX choice with a safety rationale: the API refuses the approval either way, but a
 * permit system that only reports the refusal after the click teaches people to click and hope.
 * The disabled state is a convenience, never the control — the server is the control.
 */
export default function PermitWorkflowActions({
  permitId,
  status,
  blockingGates,
}: {
  permitId: string;
  status: string;
  blockingGates: string[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reason, setReason] = useState('');

  async function run(command: string, body: Record<string, unknown> = {}): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/hse/ptws/${permitId}/${command}`, {
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

  const terminal = status === 'closed' || status === 'expired';
  const blocked = blockingGates.length > 0;

  return (
    <div style={st.wrap} data-testid="permit-actions" data-status={status}>
      {status === 'draft' && (
        <button style={st.primary} disabled={busy} data-testid="btn-request" onClick={() => void run('request')}>
          Request approval
        </button>
      )}

      {status === 'requested' && (
        <>
          <button
            style={blocked ? st.primaryDisabled : st.primary}
            disabled={busy || blocked}
            title={blocked ? `Blocked: ${blockingGates.join('; ')}` : undefined}
            data-testid="btn-approve"
            onClick={() => void run('approve')}
          >
            Approve &amp; issue permit
          </button>
          <div style={st.group}>
            <input
              style={st.input}
              placeholder="Reason for rejection"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              data-testid="input-reject-reason"
            />
            <button style={st.danger} disabled={busy} data-testid="btn-reject" onClick={() => void run('reject', { reason })}>
              Reject
            </button>
          </div>
        </>
      )}

      {status === 'rejected' && (
        <button style={st.primary} disabled={busy} data-testid="btn-reopen" onClick={() => void run('reopen')}>
          Re-open to correct
        </button>
      )}

      {status === 'approved' && (
        <button style={st.primary} disabled={busy} data-testid="btn-close" onClick={() => void run('close')}>
          Close permit (work complete, area safe)
        </button>
      )}

      {(status === 'requested' || status === 'approved') && (
        <button style={st.ghost} disabled={busy} data-testid="btn-expire" onClick={() => void run('expire')}>
          Expire
        </button>
      )}

      {terminal && (
        <p style={st.terminal} data-testid="permit-terminal">
          This permit is {status}. A permit is never re-opened once it ends — raise a new one for further work.
        </p>
      )}

      {blocked && status === 'requested' ? (
        <p style={st.blocked} data-testid="permit-blocked">
          Approval blocked: {blockingGates.join('; ')}.
        </p>
      ) : null}

      {error ? (
        <p style={st.error} data-testid="permit-action-error">
          {error}
        </p>
      ) : null}
    </div>
  );
}

const st = {
  wrap: { display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', marginBottom: 18 } as CSSProperties,
  group: { display: 'flex', gap: 8, alignItems: 'center' } as CSSProperties,
  input: { border: '1px solid var(--border, #d1d5db)', borderRadius: 8, padding: '8px 11px', fontSize: 13.5, minWidth: 220 } as CSSProperties,
  primary: { background: 'var(--accent, #2563eb)', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 16px', fontSize: 13.5, fontWeight: 700, cursor: 'pointer' } as CSSProperties,
  primaryDisabled: { background: 'var(--border, #cbd5e1)', color: 'var(--muted, #64748b)', border: 'none', borderRadius: 8, padding: '9px 16px', fontSize: 13.5, fontWeight: 700, cursor: 'not-allowed' } as CSSProperties,
  danger: { background: 'transparent', color: '#dc2626', border: '1px solid rgba(239,68,68,.5)', borderRadius: 8, padding: '9px 14px', fontSize: 13.5, fontWeight: 600, cursor: 'pointer' } as CSSProperties,
  ghost: { background: 'transparent', color: 'var(--muted)', border: '1px solid var(--border, #d1d5db)', borderRadius: 8, padding: '9px 14px', fontSize: 13.5, cursor: 'pointer' } as CSSProperties,
  terminal: { color: 'var(--muted)', fontSize: 13, margin: 0, width: '100%' } as CSSProperties,
  blocked: { color: '#d97706', fontSize: 13, margin: 0, width: '100%' } as CSSProperties,
  error: { color: '#dc2626', fontSize: 13, margin: 0, width: '100%' } as CSSProperties,
};

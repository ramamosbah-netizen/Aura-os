'use client';

import { useState, type CSSProperties } from 'react';
import { useRouter } from 'next/navigation';
import { useHydrated } from '@/lib/use-hydrated';

/**
 * Drawing workflow action bar (G-32). Renders only the commands legal from the current status and
 * POSTs them to the state-machine endpoints — it never sets `status` directly. The backend enforces
 * the transition; on success we refresh the server-rendered 360 so records/lineage update.
 */
export default function DrawingWorkflowActions({ id, status }: { id: string; status: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  // Controls stay inert until React attaches — see `useHydrated`. A click or a keystroke
  // landing on the server-rendered markup is otherwise swallowed without trace.
  const hydrated = useHydrated();
  const locked = busy || !hydrated;
  const [error, setError] = useState<string | null>(null);
  // Inline field state for commands that carry a payload.
  const [recipient, setRecipient] = useState('');
  const [purpose, setPurpose] = useState('For Approval');
  const [comments, setComments] = useState('');
  const [reason, setReason] = useState('');

  async function run(command: string, body: Record<string, unknown> = {}): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/engineering/drawings/${id}/${command}`, {
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

  const immutable = status === 'closed' || status === 'superseded';

  return (
    <div style={st.wrap} data-testid="workflow-actions" data-status={status}>
      {status === 'draft' && (
        <div style={st.group}>
          <input style={st.input} placeholder="Recipient (e.g. Consultant)" value={recipient} onChange={(e) => setRecipient(e.target.value)} disabled={locked} />
          <input style={st.input} placeholder="Purpose" value={purpose} onChange={(e) => setPurpose(e.target.value)} disabled={locked} />
          <button style={st.primary} disabled={locked} data-testid="btn-submit" onClick={() => run('submit', { recipient, purpose })}>
            Submit for review
          </button>
        </div>
      )}

      {status === 'submitted' && (
        <button style={st.primary} disabled={locked} data-testid="btn-start-review" onClick={() => run('start-review')}>
          Start review
        </button>
      )}

      {status === 'under_review' && (
        <div style={st.group}>
          <input style={{ ...st.input, minWidth: 260 }} placeholder="Reviewer comments (required to reject/return)" value={comments} onChange={(e) => setComments(e.target.value)} disabled={locked} />
          <button style={st.primary} disabled={locked} data-testid="btn-approve" onClick={() => run('review', { outcome: 'approved', comments })}>
            Approve
          </button>
          <button style={st.warn} disabled={locked} data-testid="btn-return" onClick={() => run('review', { outcome: 'returned_for_revision', comments })}>
            Return for revision
          </button>
          <button style={st.danger} disabled={locked} data-testid="btn-reject" onClick={() => run('review', { outcome: 'rejected', comments })}>
            Reject
          </button>
        </div>
      )}

      {(status === 'rejected' || status === 'revision_required') && (
        <div style={st.group}>
          <input style={{ ...st.input, minWidth: 260 }} placeholder="Reason for revision (required)" value={reason} onChange={(e) => setReason(e.target.value)} disabled={locked} />
          <button style={st.primary} disabled={locked} data-testid="btn-revise" onClick={() => run('revise', { reason })}>
            Raise next revision
          </button>
        </div>
      )}

      {status === 'approved' && (
        <div style={st.group}>
          <input style={st.input} placeholder="Recipient" value={recipient} onChange={(e) => setRecipient(e.target.value)} disabled={locked} />
          <input style={st.input} placeholder="Purpose" value={purpose} onChange={(e) => setPurpose(e.target.value)} disabled={locked} />
          <button style={st.primary} disabled={locked} data-testid="btn-transmit" onClick={() => run('transmit', { recipient, purpose: purpose || 'For Construction' })}>
            Transmit
          </button>
        </div>
      )}

      {status === 'transmitted' && (
        <button style={st.primary} disabled={locked} data-testid="btn-close" onClick={() => run('close')}>
          Close
        </button>
      )}

      {immutable && <span style={st.locked} data-testid="workflow-locked">🔒 This revision is {status} and immutable — raise a new revision to make changes.</span>}

      {error && <span style={st.error} data-testid="workflow-error">{error}</span>}
    </div>
  );
}

const st = {
  wrap: { display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', padding: '14px 16px', border: '1px solid var(--border, #e5e7eb)', borderRadius: 12, background: 'var(--surface, rgba(0,0,0,.02))' } as CSSProperties,
  group: { display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' } as CSSProperties,
  input: { padding: '7px 10px', borderRadius: 8, border: '1px solid var(--border, #d1d5db)', fontSize: 13, background: 'var(--bg, #fff)', color: 'inherit', minWidth: 180 } as CSSProperties,
  primary: { padding: '8px 14px', borderRadius: 8, border: 'none', background: '#2563eb', color: '#fff', fontWeight: 600, fontSize: 13, cursor: 'pointer' } as CSSProperties,
  warn: { padding: '8px 14px', borderRadius: 8, border: 'none', background: '#d97706', color: '#fff', fontWeight: 600, fontSize: 13, cursor: 'pointer' } as CSSProperties,
  danger: { padding: '8px 14px', borderRadius: 8, border: 'none', background: '#dc2626', color: '#fff', fontWeight: 600, fontSize: 13, cursor: 'pointer' } as CSSProperties,
  locked: { color: 'var(--muted)', fontSize: 13 } as CSSProperties,
  error: { color: '#dc2626', fontSize: 13, fontWeight: 600, width: '100%' } as CSSProperties,
};

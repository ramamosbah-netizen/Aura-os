'use client';

import { useState, type CSSProperties } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Document approval action bar (G-33). Operates on the active revision, rendering only the commands
 * legal from its status and POSTing them to the state-machine endpoints (never sets `status`). The
 * backend enforces the transition; on success we refresh the server-rendered 360.
 */
export default function DocumentWorkflowActions({ revisionId, status }: { revisionId: string; status: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [comments, setComments] = useState('');
  const [reason, setReason] = useState('');

  async function run(command: string, body: Record<string, unknown> = {}): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/doccontrol/revisions/${revisionId}/${command}`, {
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

  const immutable = status === 'superseded';

  return (
    <div style={st.wrap} data-testid="document-actions" data-status={status}>
      {status === 'draft' && (
        <button style={st.primary} disabled={busy} data-testid="btn-submit" onClick={() => run('submit')}>Submit for review</button>
      )}
      {status === 'submitted' && (
        <button style={st.primary} disabled={busy} data-testid="btn-start-review" onClick={() => run('start-review')}>Start review</button>
      )}
      {status === 'under_review' && (
        <div style={st.group}>
          <input style={{ ...st.input, minWidth: 240 }} placeholder="Comments / rejection reason" value={comments} onChange={(e) => setComments(e.target.value)} />
          <button style={st.primary} disabled={busy} data-testid="btn-approve" onClick={() => run('approve', { comments })}>Approve</button>
          <button style={st.danger} disabled={busy} data-testid="btn-reject" onClick={() => run('reject', { reason: comments })}>Reject</button>
        </div>
      )}
      {status === 'approved' && (
        <button style={st.primary} disabled={busy} data-testid="btn-issue" onClick={() => run('issue')}>Issue</button>
      )}
      {(status === 'rejected' || status === 'issued') && (
        <div style={st.group}>
          <input style={{ ...st.input, minWidth: 240 }} placeholder="Reason for new revision (required)" value={reason} onChange={(e) => setReason(e.target.value)} />
          <button style={st.primary} disabled={busy} data-testid="btn-revise" onClick={() => run('revise', { reason })}>Raise next revision</button>
        </div>
      )}
      {immutable && <span style={st.locked} data-testid="document-locked">🔒 This revision is superseded and immutable.</span>}
      {error && <span style={st.error} data-testid="document-error">{error}</span>}
    </div>
  );
}

const st = {
  wrap: { display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', padding: '14px 16px', border: '1px solid var(--border, #e5e7eb)', borderRadius: 12, background: 'var(--surface, rgba(0,0,0,.02))' } as CSSProperties,
  group: { display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' } as CSSProperties,
  input: { padding: '7px 10px', borderRadius: 8, border: '1px solid var(--border, #d1d5db)', fontSize: 13, background: 'var(--bg, #fff)', color: 'inherit', minWidth: 180 } as CSSProperties,
  primary: { padding: '8px 14px', borderRadius: 8, border: 'none', background: '#2563eb', color: '#fff', fontWeight: 600, fontSize: 13, cursor: 'pointer' } as CSSProperties,
  danger: { padding: '8px 14px', borderRadius: 8, border: 'none', background: '#dc2626', color: '#fff', fontWeight: 600, fontSize: 13, cursor: 'pointer' } as CSSProperties,
  locked: { color: 'var(--muted)', fontSize: 13 } as CSSProperties,
  error: { color: '#dc2626', fontSize: 13, fontWeight: 600, width: '100%' } as CSSProperties,
};

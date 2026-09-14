'use client';

import { useState, type CSSProperties } from 'react';
import { useRouter } from 'next/navigation';
import { useHydrated } from '@/lib/use-hydrated';
import type { ReleaseResponsibility } from '@/components/drawing-360';

/**
 * Drawing workflow action bar (G-32). Renders only the commands legal from the current status and
 * POSTs them to the state-machine endpoints — it never sets `status` directly. The backend enforces
 * the transition; on success we refresh the server-rendered 360 so records/lineage update.
 */
export default function DrawingWorkflowActions({ id, projectId, status, responsibilities }: { id: string; projectId: string; status: string; responsibilities: ReleaseResponsibility[] }) {
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
  const [responsibilityId, setResponsibilityId] = useState('');

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
      if (command === 'transmit') {
        // The drawing and its DocControl conveyance are separate bounded contexts joined through
        // the durable outbox. Keep the action busy until the linked reference is observable so the
        // engineer sees completion rather than a misleading "not transmitted yet" refresh.
        for (let attempt = 0; attempt < 20; attempt += 1) {
          const [drawingResponse, responsibilityResponse] = await Promise.all([
            fetch(`/api/engineering/drawings/${id}?projectId=${encodeURIComponent(projectId)}`, { cache: 'no-store' }),
            responsibilityId
              ? fetch(`/api/projects/${projectId}/responsibilities`, { cache: 'no-store' })
              : Promise.resolve(null),
          ]);
          const current = (await drawingResponse.json().catch(() => ({}))) as { transmittalRef?: string | null };
          const receiptRows = responsibilityResponse
            ? await responsibilityResponse.json().catch(() => []) as ReleaseResponsibility[]
            : [];
          const receiptLinked = !responsibilityId || (
            responsibilityResponse?.ok
            && receiptRows.some((row) => row.id === responsibilityId && row.sourceId === id && row.transmittalRef)
          );
          if (drawingResponse.ok && current.transmittalRef && receiptLinked) break;
          await new Promise((resolve) => setTimeout(resolve, 250));
        }
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
          <label style={st.fieldLabel}>Recipient
            <input style={st.input} aria-label="Transmit recipient" placeholder="Consultant / client / contractor" value={recipient} onChange={(e) => setRecipient(e.target.value)} disabled={locked} data-testid="transmit-recipient" />
          </label>
          <label style={st.fieldLabel}>Purpose
            <select style={st.input} aria-label="Transmit purpose" value={purpose} onChange={(e) => setPurpose(e.target.value)} disabled={locked} data-testid="transmit-purpose">
              <option>For Approval</option>
              <option>For Construction</option>
              <option>For Information</option>
              <option>For Review</option>
            </select>
          </label>
          <label style={st.fieldLabel}>Internal delivery owner
            <select style={st.input} aria-label="Engineering release responsibility" value={responsibilityId} onChange={(e) => setResponsibilityId(e.target.value)} disabled={locked} data-testid="transmit-responsibility">
              <option value="">{purpose === 'For Construction' ? 'Choose responsibility…' : 'No internal receipt'}</option>
              {responsibilities.filter((row) => row.status !== 'completed' && (!row.sourceId || row.sourceId === id)).map((row) => (
                <option key={row.id} value={row.id}>{row.assigneeName} — {row.title}</option>
              ))}
            </select>
          </label>
          <button style={st.primary} disabled={locked || !recipient.trim() || !purpose.trim() || (purpose === 'For Construction' && !responsibilityId)} data-testid="btn-transmit" onClick={() => run('transmit', { recipient: recipient.trim(), purpose, responsibilityId: responsibilityId || undefined })}>
            Transmit
          </button>
          <span style={st.help}>Creates the controlled transmittal. A construction issue also links this exact revision to its named delivery owner in My Work.</span>
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
  wrap: { display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', padding: '14px 16px', border: '1px solid var(--border, #e5e7eb)', borderRadius: 12, background: 'var(--surface, var(--panel-2))' } as CSSProperties,
  group: { display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' } as CSSProperties,
  input: { padding: '7px 10px', borderRadius: 8, border: '1px solid var(--border, #d1d5db)', fontSize: 13, background: 'var(--bg, #fff)', color: 'inherit', minWidth: 180 } as CSSProperties,
  fieldLabel: { display: 'grid', gap: 4, fontSize: 11, color: 'var(--muted)' } as CSSProperties,
  help: { maxWidth: 280, fontSize: 11.5, color: 'var(--muted)', lineHeight: 1.35 } as CSSProperties,
  primary: { padding: '8px 14px', borderRadius: 8, border: 'none', background: 'var(--info)', color: 'var(--accent-ink)', fontWeight: 600, fontSize: 13, cursor: 'pointer' } as CSSProperties,
  warn: { padding: '8px 14px', borderRadius: 8, border: 'none', background: 'var(--warn)', color: 'var(--accent-ink)', fontWeight: 600, fontSize: 13, cursor: 'pointer' } as CSSProperties,
  danger: { padding: '8px 14px', borderRadius: 8, border: 'none', background: 'var(--bad)', color: 'var(--accent-ink)', fontWeight: 600, fontSize: 13, cursor: 'pointer' } as CSSProperties,
  locked: { color: 'var(--muted)', fontSize: 13 } as CSSProperties,
  error: { color: 'var(--bad)', fontSize: 13, fontWeight: 600, width: '100%' } as CSSProperties,
};

'use client';

import { type CSSProperties, useEffect, useState } from 'react';
import { useHydrated } from '@/lib/use-hydrated';

/** A defect as the routing needs it (TC-08). */
export interface RoutableDefect {
  id: string;
  commissioningId: string;
  status: string;
  routedTo?: string | null;
  routingReason?: string | null;
  correctiveAction?: string | null;
  correctionReference?: string | null;
  correctedBy?: string | null;
}

interface Member { userId: string; displayName: string; roleId: string }

/**
 * ROUTING A DEFECT TO ENGINEERING (TC-08, the owner's decision of 2026-09-25).
 *
 * Routed: who it is with, why, and the corrective action once the engineer records it — T&C still
 * closes it, after the retest. Not routed: T&C names one of the project's Design / Technical Engineers
 * and says what the design has to answer; the engineer receives it in My Work.
 */
export default function CommissioningDefectRouting({
  item, projectId, onDone,
}: { item: RoutableDefect; projectId: string; onDone: () => void }) {
  const hydrated = useHydrated();
  const [open, setOpen] = useState(false);
  const [engineers, setEngineers] = useState<Member[] | null>(null);
  const [assignee, setAssignee] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || engineers !== null) return;
    let live = true;
    void (async () => {
      try {
        const res = await fetch(`/api/projects/${encodeURIComponent(projectId)}/members`, { cache: 'no-store' });
        const body = res.ok ? ((await res.json()) as { members?: Member[] } | Member[]) : [];
        const list = Array.isArray(body) ? body : body.members ?? [];
        if (live) setEngineers(list.filter((m) => m.roleId === 'r-technical-engineer'));
      } catch {
        if (live) setEngineers([]);
      }
    })();
    return () => { live = false; };
  }, [open, engineers, projectId]);

  if (item.routedTo) {
    return (
      <span style={st.routed} data-testid={`defect-routing-${item.id}`}>
        With Engineering: <b>{item.routedTo}</b>{item.routingReason ? ` — ${item.routingReason}` : ''}
        {item.correctiveAction
          ? <span data-testid={`defect-correction-${item.id}`}> · corrected by {item.correctedBy}: {item.correctiveAction}{item.correctionReference ? ` (${item.correctionReference})` : ''} — close it once the retest passes</span>
          : <span> · awaiting the engineer&rsquo;s corrective action</span>}
      </span>
    );
  }
  if (item.status !== 'open') return null;

  async function route(): Promise<void> {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/commissioning/records/${item.commissioningId}/punch/${item.id}/route-to-engineering`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ assigneeId: assignee, reason }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { message?: string; error?: string };
        throw new Error(data.message || data.error || `Could not route the defect (${res.status})`);
      }
      setOpen(false);
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not route the defect');
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return <button style={st.btn} disabled={!hydrated} onClick={() => setOpen(true)} data-testid={`route-defect-${item.id}`}>Route to Engineering</button>;
  }
  return (
    <span style={st.form}>
      <select style={st.input} value={assignee} onChange={(e) => setAssignee(e.target.value)} disabled={busy || engineers === null} data-testid={`route-engineer-${item.id}`} aria-label="Engineer">
        <option value="">{engineers === null ? 'Reading the project…' : engineers.length === 0 ? 'No Design / Technical Engineer on this project' : 'Choose the engineer…'}</option>
        {(engineers ?? []).map((m) => <option key={m.userId} value={m.userId}>{m.displayName}</option>)}
      </select>
      <input style={{ ...st.input, minWidth: 220 }} placeholder="What the design has to answer" value={reason} onChange={(e) => setReason(e.target.value)} disabled={busy} data-testid={`route-reason-${item.id}`} aria-label="Reason" />
      <button style={st.btn} disabled={!hydrated || busy || !assignee || !reason.trim()} onClick={() => void route()} data-testid={`route-save-${item.id}`}>{busy ? 'Routing…' : 'Route'}</button>
      <button style={st.btn} onClick={() => { setOpen(false); setError(null); }} disabled={busy}>Cancel</button>
      {error && <span style={st.error} role="alert" data-testid={`route-error-${item.id}`}>{error}</span>}
    </span>
  );
}

const st = {
  routed: { fontSize: 12, color: 'var(--info)' } as CSSProperties,
  form: { display: 'inline-flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' } as CSSProperties,
  input: { padding: '4px 8px', borderRadius: 6, border: '1px solid var(--border, #d1d5db)', fontSize: 12, background: 'var(--bg, #fff)', color: 'inherit' } as CSSProperties,
  btn: { padding: '4px 10px', borderRadius: 6, border: '1px solid var(--border, #d1d5db)', background: 'transparent', color: 'inherit', fontSize: 12, cursor: 'pointer' } as CSSProperties,
  error: { color: 'var(--bad)', fontSize: 12, fontWeight: 600, flexBasis: '100%' } as CSSProperties,
};

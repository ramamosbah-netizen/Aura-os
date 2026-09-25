'use client';

import { type CSSProperties, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useHydrated } from '@/lib/use-hydrated';

export interface EscalationRow {
  id: string; sourceReference: string | null; system: string | null; description: string; severity: string | null;
  pointNo: string | null; failingRunNo: number | null; failingActual: string | null; failingRemarks: string | null;
  requestedBy: string; requestedAt: string; status: 'pending' | 'ncr_raised' | 'not_nonconformance';
  ncrNumber: string | null; decisionReason: string | null; decidedBy: string | null;
}

/**
 * WHAT TESTING & COMMISSIONING ESCALATED — Quality's queue (TC-08). Each is Quality's to decide: raise a
 * non-conformance from it, or record with a reason that it is not one. The person who escalated may
 * not decide it, and a decision is final.
 */
export default function QualityEscalationsClient({ rows }: { rows: EscalationRow[] }) {
  if (rows.length === 0) return <p style={st.muted} data-testid="escalations-empty">Testing &amp; Commissioning has escalated nothing on this project.</p>;
  return <ul style={st.list} data-testid="escalations">{rows.map((r) => <Escalation key={r.id} row={r} />)}</ul>;
}

function Escalation({ row }: { row: EscalationRow }) {
  const router = useRouter();
  const hydrated = useHydrated();
  const [ncrNumber, setNcrNumber] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function decide(action: 'raise-ncr' | 'decline', body: Record<string, unknown>): Promise<void> {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/quality/escalations/${row.id}/${action}`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { message?: string; error?: string };
        throw new Error(data.message || data.error || `Could not record the decision (${res.status})`);
      }
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not record the decision');
    } finally {
      setBusy(false);
    }
  }

  return (
    <li style={st.card} data-testid={`esc-${row.id}`}>
      <div style={st.head}>
        <b>{row.sourceReference ?? 'System'}</b>
        <span style={st.muted}>{row.system?.replace(/_/g, ' ')}{row.severity ? ` · ${row.severity}` : ''}</span>
        <span style={row.status === 'pending' ? st.warn : st.good}>{row.status === 'pending' ? 'awaiting Quality' : 'decided'}</span>
      </div>
      <div>{row.description}</div>
      {row.pointNo && (
        <div style={st.muted}>
          Failing test point {row.pointNo}{row.failingRunNo ? `, run ${row.failingRunNo}` : ''}{row.failingActual ? `: ${row.failingActual}` : ''}{row.failingRemarks ? ` — ${row.failingRemarks}` : ''}
        </div>
      )}
      <div style={st.muted}>Escalated by {row.requestedBy}</div>
      {row.status !== 'pending' ? (
        <div style={st.outcome} data-testid={`esc-outcome-${row.id}`}>
          {row.status === 'ncr_raised'
            ? `NCR ${row.ncrNumber ?? ''} raised by ${row.decidedBy}`
            : `Not a non-conformance — ${row.decisionReason} (${row.decidedBy})`}
        </div>
      ) : (
        <div style={st.form}>
          <input style={st.input} placeholder="NCR number" value={ncrNumber} onChange={(e) => setNcrNumber(e.target.value)} disabled={busy} data-testid={`esc-ncr-number-${row.id}`} aria-label="NCR number" />
          <button style={st.primary} disabled={!hydrated || busy || !ncrNumber.trim()} onClick={() => void decide('raise-ncr', { ncrNumber })} data-testid={`esc-raise-${row.id}`}>Raise NCR</button>
          <input style={{ ...st.input, minWidth: 260 }} placeholder="Why it is not a non-conformance" value={reason} onChange={(e) => setReason(e.target.value)} disabled={busy} data-testid={`esc-reason-${row.id}`} aria-label="Reason" />
          <button style={st.ghost} disabled={!hydrated || busy || !reason.trim()} onClick={() => void decide('decline', { reason })} data-testid={`esc-decline-${row.id}`}>Not a non-conformance</button>
          {error && <span style={st.error} role="alert" data-testid={`esc-error-${row.id}`}>{error}</span>}
        </div>
      )}
    </li>
  );
}

const st = {
  list: { listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 10 } as CSSProperties,
  card: { display: 'flex', flexDirection: 'column', gap: 6, padding: '12px 14px', border: '1px solid var(--border, #e5e7eb)', borderRadius: 10, fontSize: 13 } as CSSProperties,
  head: { display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' } as CSSProperties,
  muted: { color: 'var(--muted)', fontSize: 12 } as CSSProperties,
  good: { color: 'var(--good)', fontSize: 12, fontWeight: 700, marginLeft: 'auto' } as CSSProperties,
  warn: { color: 'var(--warn)', fontSize: 12, fontWeight: 700, marginLeft: 'auto' } as CSSProperties,
  outcome: { color: 'var(--info)', fontSize: 13, fontWeight: 600 } as CSSProperties,
  form: { display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' } as CSSProperties,
  input: { padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border, #d1d5db)', fontSize: 13, background: 'var(--bg, #fff)', color: 'inherit', minWidth: 140 } as CSSProperties,
  primary: { padding: '7px 14px', borderRadius: 8, border: 'none', background: 'var(--accent)', color: 'var(--accent-ink)', fontWeight: 700, fontSize: 12, cursor: 'pointer' } as CSSProperties,
  ghost: { padding: '6px 12px', borderRadius: 8, border: '1px solid var(--border, #d1d5db)', background: 'transparent', color: 'inherit', fontSize: 12, cursor: 'pointer' } as CSSProperties,
  error: { color: 'var(--bad)', fontSize: 12, fontWeight: 600, flexBasis: '100%' } as CSSProperties,
};

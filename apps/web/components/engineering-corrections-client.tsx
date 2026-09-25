'use client';

import { type CSSProperties, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useHydrated } from '@/lib/use-hydrated';

export interface RoutedDefect {
  id: string; commissioningId: string; description: string; severity: string; status: string;
  routedBy: string | null; routingReason: string | null;
  correctiveAction: string | null; correctionReference: string | null; correctedBy: string | null;
  systemCode: string | null; systemTitle: string | null;
  point: { pointNo: string; description: string; expected: string | null; actual: string | null; result: string } | null;
}

/**
 * THE ENGINEER'S COMMISSIONING CORRECTIONS (TC-08): the defects T&C routed to THIS engineer, with the
 * evidence each answers. The engineer records the corrective action — what changed, and the revised
 * drawing or RFI it rests on. T&C closes the defect, and only after its retest passes.
 */
export default function EngineeringCorrectionsClient({ defects }: { defects: RoutedDefect[] }) {
  if (defects.length === 0) {
    return <p style={st.muted} data-testid="corrections-empty">Nothing on this project is routed to you for a design correction.</p>;
  }
  return (
    <ul style={st.list} data-testid="corrections">
      {defects.map((d) => <Correction key={d.id} defect={d} />)}
    </ul>
  );
}

function Correction({ defect }: { defect: RoutedDefect }) {
  const router = useRouter();
  const hydrated = useHydrated();
  const [action, setAction] = useState('');
  const [reference, setReference] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function record(): Promise<void> {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/commissioning/records/${defect.commissioningId}/punch/${defect.id}/corrective-action`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action, reference: reference || undefined }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { message?: string; error?: string };
        throw new Error(data.message || data.error || `Could not record the correction (${res.status})`);
      }
      setAction(''); setReference('');
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not record the correction');
    } finally {
      setBusy(false);
    }
  }

  return (
    <li style={st.card} data-testid={`correction-${defect.id}`}>
      <div style={st.head}>
        <b>{defect.systemCode ?? 'System'}</b> <span style={st.muted}>{defect.systemTitle}</span>
        <span style={defect.status === 'closed' ? st.good : st.warn}>{defect.status === 'closed' ? 'closed by T&C' : defect.severity}</span>
      </div>
      <div>{defect.description}</div>
      <div style={st.muted}>Routed by {defect.routedBy ?? 'T&C'}: {defect.routingReason}</div>
      {defect.point && (
        <div style={st.muted} data-testid={`correction-point-${defect.id}`}>
          Test point {defect.point.pointNo} — {defect.point.description}; expected {defect.point.expected ?? '—'}; latest result <b>{defect.point.result}</b>{defect.point.actual ? ` (${defect.point.actual})` : ''}
        </div>
      )}
      {defect.correctiveAction && (
        <div style={st.recorded} data-testid={`correction-recorded-${defect.id}`}>
          Corrective action: {defect.correctiveAction}{defect.correctionReference ? ` · ${defect.correctionReference}` : ''}
          {defect.status === 'closed' ? '' : ' — awaiting T&C’s retest and closure'}
        </div>
      )}
      {defect.status !== 'closed' && (
        <div style={st.form}>
          <textarea style={{ ...st.input, minHeight: 48, flexBasis: '100%' }} placeholder="What was changed in the design"
            value={action} onChange={(e) => setAction(e.target.value)} disabled={busy} data-testid={`correction-action-${defect.id}`} aria-label="Corrective action" />
          <input style={st.input} placeholder="Revised drawing / RFI (optional)" value={reference}
            onChange={(e) => setReference(e.target.value)} disabled={busy} data-testid={`correction-reference-${defect.id}`} aria-label="Reference" />
          <button style={st.btn} disabled={!hydrated || busy || !action.trim()} onClick={() => void record()} data-testid={`correction-save-${defect.id}`}>
            {busy ? 'Recording…' : defect.correctiveAction ? 'Record a further correction' : 'Record corrective action'}
          </button>
          {error && <span style={st.error} role="alert" data-testid={`correction-error-${defect.id}`}>{error}</span>}
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
  recorded: { color: 'var(--info)', fontSize: 12 } as CSSProperties,
  form: { display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' } as CSSProperties,
  input: { padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border, #d1d5db)', fontSize: 13, background: 'var(--bg, #fff)', color: 'inherit', minWidth: 200 } as CSSProperties,
  btn: { padding: '7px 14px', borderRadius: 8, border: 'none', background: 'var(--accent)', color: 'var(--accent-ink)', fontWeight: 700, fontSize: 12, cursor: 'pointer' } as CSSProperties,
  error: { color: 'var(--bad)', fontSize: 12, fontWeight: 600, flexBasis: '100%' } as CSSProperties,
};

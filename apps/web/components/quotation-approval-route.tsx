'use client';

import { type CSSProperties, useEffect, useState } from 'react';
import { DISPLAY_LOCALE, DISPLAY_TIME_ZONE } from '@/lib/locale';

interface RouteStep {
  id: string; label: string; role: string; quorum: number; order: number; because: string;
  approvals: number; satisfied: boolean; decisions: Array<{ approverId: string; decidedAt: string }>;
}
interface ApprovalRun {
  id: string; policyVersion: number; status: 'open' | 'completed' | 'returned' | 'closed';
  amount: number; amountBasis: 'net' | 'gross'; currency: string; startedAt: string; startedBy: string;
  waitingOn: Array<{ id: string; label: string; role: string }>; steps: RouteStep[];
}

const when = (iso: string): string => new Date(iso).toLocaleString(DISPLAY_LOCALE, { dateStyle: 'medium', timeStyle: 'short', timeZone: DISPLAY_TIME_ZONE });
const money = (n: number): string => new Intl.NumberFormat(DISPLAY_LOCALE, { maximumFractionDigits: 2 }).format(n);
const RUN_STATUS: Record<ApprovalRun['status'], string> = { open: 'In progress', completed: 'Approved', returned: 'Returned for revision', closed: 'Closed' };

/**
 * THE APPROVAL ROUTE OF ONE OFFER (EST-17) — the company policy version it started under, every step
 * in sequence, who approved each, and what it waits on now. It reads the server's record; the
 * server alone decides who may approve which step.
 */
export default function QuotationApprovalRoute({ quotationId, refreshKey }: { quotationId: string; refreshKey: number }) {
  const [runs, setRuns] = useState<ApprovalRun[] | null>(null);
  useEffect(() => {
    let live = true;
    void fetch(`/api/crm/quotations/${encodeURIComponent(quotationId)}/approval`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((b: { runs?: ApprovalRun[] } | null) => { if (live) setRuns(Array.isArray(b?.runs) ? b!.runs : []); })
      .catch(() => { if (live) setRuns([]); });
    return () => { live = false; };
  }, [quotationId, refreshKey]);

  if (runs === null) return null;
  const run = runs[0];
  if (!run) {
    return (
      <div data-testid="approval-route" style={st.wrap}>
        <b style={st.head}>Approval route</b>
        <span style={st.muted}>No company approval policy applied when this offer was submitted: it is approved once.</span>
      </div>
    );
  }
  return (
    <div data-testid="approval-route" style={st.wrap}>
      <b style={st.head}>Approval route · policy version {run.policyVersion}</b>
      <span style={st.muted}>
        {RUN_STATUS[run.status]} · {run.currency} {money(run.amount)} {run.amountBasis === 'net' ? 'before VAT' : 'after VAT'} · started by {run.startedBy} on {when(run.startedAt)}
      </span>
      <ol style={st.list}>
        {run.steps.map((s) => {
          const waiting = run.waitingOn.some((w) => w.id === s.id);
          return (
            <li key={s.id} data-testid={`approval-step-${s.id}`} style={{ color: s.satisfied ? 'var(--good)' : waiting ? 'var(--warn)' : 'var(--muted)' }}>
              <b>{s.label}</b> ({s.role}) — {s.satisfied ? 'approved' : waiting ? 'waiting' : run.status === 'open' ? 'later' : 'not reached'}
              {s.decisions.length > 0 && <> by {s.decisions.map((d) => `${d.approverId} on ${when(d.decidedAt)}`).join(', ')}</>}
              {s.quorum > 1 && <> · {s.approvals}/{s.quorum}</>}
              <span style={st.because}> · {s.because}</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

const st = {
  wrap: { display: 'grid', gap: 6, fontSize: 13, marginBottom: 14 } as CSSProperties,
  head: { fontSize: 13 } as CSSProperties,
  muted: { color: 'var(--muted)', fontSize: 12.5 } as CSSProperties,
  list: { margin: 0, paddingLeft: 20, display: 'grid', gap: 4 } as CSSProperties,
  because: { color: 'var(--muted)', fontSize: 12 } as CSSProperties,
};

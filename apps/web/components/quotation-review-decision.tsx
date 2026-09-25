'use client';

import { type CSSProperties, useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { DISPLAY_LOCALE, DISPLAY_TIME_ZONE } from '@/lib/locale';

interface ReviewDecision { id: string; revision: number; outcome: string; decidedBy: string | null; decidedAt: string; reason: string }
interface Baseline { id: string; revision: number; total: number; lockedBy: string | null; lockedAt: string }

const when = (iso: string): string => new Date(iso).toLocaleString(DISPLAY_LOCALE, { dateStyle: 'medium', timeStyle: 'short', timeZone: DISPLAY_TIME_ZONE });
const money = (n: number): string => new Intl.NumberFormat(DISPLAY_LOCALE, { maximumFractionDigits: 2 }).format(n);

/**
 * THE REVIEW, BOTH OUTCOMES, AND WHAT EACH ONE LEFT BEHIND.
 *
 * A review has two outcomes and the API has always had both: approve, or return for revision with a
 * reason (step 4). Only the first was reachable on screen, so a reviewer who wanted a figure changed
 * could approve it or say nothing. The return is the reviewer's — the same authority as approving —
 * and the server refuses it to the offer's own preparer in words, which this shows as it comes back.
 *
 * The history is the record a reviewer most wants before deciding: every earlier send-back with who
 * made it and why, against the revision it was about, and — once decided — who approved it and when.
 */
export default function QuotationReviewDecision({ quotationId, status, canDecide }: {
  quotationId: string;
  status: string;
  /** Holds the review authority (the same permission as approving). */
  canDecide: boolean;
}) {
  const router = useRouter();
  const [decisions, setDecisions] = useState<ReviewDecision[]>([]);
  const [baseline, setBaseline] = useState<Baseline | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [d, b] = await Promise.all([
      fetch(`/api/crm/quotations/${encodeURIComponent(quotationId)}/review-decisions`, { cache: 'no-store' }),
      fetch(`/api/crm/quotations/${encodeURIComponent(quotationId)}/baseline`, { cache: 'no-store' }),
    ]);
    const list = d.ok ? await d.json().catch(() => []) : [];
    setDecisions(Array.isArray(list) ? list : []);
    setBaseline(b.ok ? await b.json().catch(() => null) : null);
  }, [quotationId]);

  useEffect(() => { void load(); }, [load]);

  async function returnForRevision(): Promise<void> {
    if (!reason.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/crm/quotations/${encodeURIComponent(quotationId)}/status`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'return_for_revision', reason: reason.trim() }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) { setError(body.message ?? body.error ?? `The offer could not be returned (HTTP ${res.status}).`); return; }
      setReason('');
      await load();
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={st.wrap} data-testid="review-decision">
      <b style={st.head}>Review</b>
      {status === 'internal_review' && canDecide && (
        <div style={st.form}>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="What must change before this can be approved — the preparer works from this"
            style={st.input}
            rows={2}
            aria-label="Reason for returning the offer"
            data-testid="return-reason"
          />
          <button type="button" className="btn" style={st.btn} disabled={busy || !reason.trim()} onClick={() => void returnForRevision()} data-testid="return-for-revision">
            Return for revision ↩
          </button>
        </div>
      )}
      {error && <p style={st.error} role="alert">{error}</p>}
      {decisions.length === 0 && !baseline ? (
        <p style={st.muted}>No review decision yet.</p>
      ) : (
        <ul style={st.list} data-testid="review-history">
          {decisions.map((d) => (
            <li key={d.id} style={st.row}>
              <span style={st.warn}>Returned</span> Rev {d.revision} · by {d.decidedBy ?? 'unknown'} · {when(d.decidedAt)} — <span style={st.reason}>{d.reason}</span>
            </li>
          ))}
          {baseline && (
            <li style={st.row}>
              <span style={st.good}>Approved</span> Rev {baseline.revision} · by {baseline.lockedBy ?? 'unknown'} · {when(baseline.lockedAt)} — baseline locked at {money(baseline.total)}
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

const st = {
  wrap: { marginTop: 14, borderTop: '1px solid var(--border)', paddingTop: 12 } as CSSProperties,
  head: { display: 'block', fontSize: 13, marginBottom: 8 } as CSSProperties,
  form: { display: 'flex', gap: 8, alignItems: 'flex-start', flexWrap: 'wrap', marginBottom: 8 } as CSSProperties,
  input: { flex: '1 1 320px', minHeight: 44, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--panel)', color: 'var(--text)', padding: '8px 10px', fontSize: 13 } as CSSProperties,
  btn: { whiteSpace: 'nowrap' } as CSSProperties,
  error: { color: 'var(--bad)', fontSize: 12.5, margin: '0 0 8px' } as CSSProperties,
  muted: { color: 'var(--muted)', fontSize: 12.5, margin: 0 } as CSSProperties,
  list: { listStyle: 'none', padding: 0, margin: 0, fontSize: 12.5 } as CSSProperties,
  row: { padding: '5px 0', borderBottom: '1px dashed var(--border)', lineHeight: 1.5 } as CSSProperties,
  warn: { color: 'var(--warn)', fontWeight: 700 } as CSSProperties,
  good: { color: 'var(--good)', fontWeight: 700 } as CSSProperties,
  reason: { color: 'var(--text)' } as CSSProperties,
};

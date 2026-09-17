'use client';

import { type CSSProperties, useCallback, useEffect, useState } from 'react';

/**
 * `SUP-01` on screen — the internal technical verdict on a supplier's offer.
 *
 * The screen exists to make three things impossible to miss, because each is a way a technical
 * decision goes wrong quietly:
 *
 *   WHAT WAS ACTUALLY ASKED FOR sits beside what was offered. An evaluator judging an offer without
 *   the requirement in front of them is guessing, and the requirement here is the one FROZEN on the
 *   requisition line when it was authored — a later catalogue edit cannot move it.
 *
 *   A QUANTITY THAT DIFFERS IS FLAGGED as a deviation. Derived, not stored, and surfaced rather than
 *   decided: whether 10 against a request for 12 is acceptable is the evaluator's judgement, and the
 *   point is only that they cannot overlook it.
 *
 *   THE SUPPLIER'S OWN COMPLIANCE CLAIM IS SHOWN AS A CLAIM. It is labelled as the supplier's words,
 *   never as a state of the offer, because a screen that renders "comply" as a tick is how a claim
 *   becomes a verdict without anybody deciding anything.
 *
 * A verdict costs a rationale, and amending one costs a reason — the previous decision is superseded
 * on the record rather than erased.
 */

type Verdict = 'compliant' | 'compliant_with_deviation' | 'non_compliant';

interface EvaluationCase {
  line: {
    id: string; quantity: number | null; uom: string | null; unitPrice: number | null;
    offeredManufacturer: string | null; offeredModel: string | null;
    complianceResponse: string | null; deviations: string | null; exclusions: string | null;
    isAlternate: boolean; leadTimeDays: number | null; warrantyMonths: number | null;
  };
  requirement: {
    quantity: number | null; uom: string | null;
    specification: string | null; manufacturer: string | null; model: string | null;
  } | null;
  quantityDeviation: { deviates: boolean; requested: number | null; offered: number | null; difference: number | null };
  current: { verdict: Verdict; rationale: string; decidedBy: string; decidedAt: string } | null;
  eligibility: 'eligible' | 'not_eligible' | 'unknown';
  history: Array<{ id: string; verdict: Verdict; rationale: string; decidedBy: string; supersededAt: string | null; amendmentReason: string | null }>;
}

const VERDICT_LABEL: Record<Verdict, string> = {
  compliant: 'Compliant',
  compliant_with_deviation: 'Compliant with deviation',
  non_compliant: 'Not compliant',
};

export default function TechnicalEvaluationPanel({ quotationLineId }: { quotationLineId: string }) {
  const [data, setData] = useState<EvaluationCase | null>(null);
  const [verdict, setVerdict] = useState<Verdict | ''>('');
  const [rationale, setRationale] = useState('');
  const [amendmentReason, setAmendmentReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    const res = await fetch(`/api/procurement/quotation-lines/${quotationLineId}/evaluation`, { cache: 'no-store' });
    setData(res.ok ? ((await res.json().catch(() => null)) as EvaluationCase) : null);
  }, [quotationLineId]);

  useEffect(() => { void load(); }, [load]);

  const decide = async (): Promise<void> => {
    if (!verdict) return;
    setBusy(true); setError(null);
    try {
      const res = await fetch(`/api/procurement/quotation-lines/${quotationLineId}/evaluation`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ verdict, rationale, amendmentReason: amendmentReason || undefined }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.message || body?.error || 'The verdict was refused');
      setRationale(''); setAmendmentReason(''); setVerdict('');
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'The verdict was refused');
    } finally {
      setBusy(false);
    }
  };

  if (!data) return <p style={st.muted} data-testid="evaluation-unavailable">This offer is not available for technical evaluation.</p>;

  const { line, requirement, quantityDeviation: dev, current, eligibility } = data;
  const amending = Boolean(current);

  return (
    <div style={st.wrap} data-testid={`evaluation-${quotationLineId}`}>
      {/* ── Asked for, versus offered ─────────────────────────────────────── */}
      <div style={st.compare}>
        <div style={st.col}>
          <div style={st.colHead}>Asked for</div>
          <div style={st.fact} data-testid="requirement-quantity">
            {requirement?.quantity ?? '—'} {requirement?.uom ?? ''}
          </div>
          <div style={st.sub}>{requirement?.manufacturer ?? '—'} {requirement?.model ?? ''}</div>
          <div style={st.spec}>{requirement?.specification ?? 'No specification recorded'}</div>
        </div>
        <div style={st.col}>
          <div style={st.colHead}>Offered</div>
          <div style={st.fact} data-testid="offered-quantity">
            {line.quantity ?? '—'} {line.uom ?? ''}
          </div>
          <div style={st.sub}>
            {line.offeredManufacturer ?? '—'} {line.offeredModel ?? ''}
            {line.isAlternate && <span style={st.alt} data-testid="offered-alternate">alternate</span>}
          </div>
          <div style={st.spec}>
            {/* The supplier's words, labelled as theirs. Never rendered as a state of the offer. */}
            {line.complianceResponse
              ? <span data-testid="supplier-claim">Supplier states: {line.complianceResponse.replace(/_/g, ' ')}</span>
              : <span style={st.muted}>Supplier stated no compliance response</span>}
          </div>
        </div>
      </div>

      {dev.deviates && (
        <p style={st.deviation} data-testid="quantity-deviation">
          Quantity deviates: {dev.offered} offered against {dev.requested} requested
          {dev.difference !== null ? ` (${dev.difference > 0 ? '+' : ''}${dev.difference})` : ''}.
          Whether that is acceptable is your judgement.
        </p>
      )}

      {(line.deviations || line.exclusions) && (
        <p style={st.sub} data-testid="declared-deviations">
          {line.deviations && <>Deviations: {line.deviations}. </>}
          {line.exclusions && <>Exclusions: {line.exclusions}.</>}
        </p>
      )}

      {/* ── The standing verdict ───────────────────────────────────────────── */}
      <p style={st.verdictLine} data-testid="evaluation-eligibility">
        {eligibility === 'unknown'
          ? 'Not yet evaluated — this offer cannot be recommended until somebody decides, however low its price.'
          : `${VERDICT_LABEL[current!.verdict]} — decided by ${current!.decidedBy}. ${current!.rationale}`}
      </p>

      {/* ── Record a verdict ───────────────────────────────────────────────── */}
      <div style={st.form}>
        <select className="select" style={st.field} value={verdict}
          onChange={(e) => setVerdict(e.target.value as Verdict | '')}
          data-testid="verdict" aria-label="Technical verdict">
          <option value="">Record a verdict…</option>
          <option value="compliant">Compliant</option>
          <option value="compliant_with_deviation">Compliant with deviation</option>
          <option value="non_compliant">Not compliant</option>
        </select>
        <input className="input" style={st.grow} value={rationale} onChange={(e) => setRationale(e.target.value)}
          placeholder="Why — a verdict nobody explained cannot be put to the supplier"
          data-testid="verdict-rationale" aria-label="Rationale" />
        {amending && (
          <input className="input" style={st.grow} value={amendmentReason} onChange={(e) => setAmendmentReason(e.target.value)}
            placeholder="Why this replaces the previous decision"
            data-testid="verdict-amendment-reason" aria-label="Amendment reason" />
        )}
        <button type="button" className="btn btn-primary" disabled={busy || !verdict}
          onClick={() => void decide()} data-testid="verdict-submit">
          {amending ? 'Amend verdict' : 'Record verdict'}
        </button>
      </div>

      {error && <p style={st.bad} data-testid="verdict-error">{error}</p>}

      {data.history.length > 1 && (
        <p style={st.sub} data-testid="verdict-history">
          {data.history.length} decisions on this offer — superseded verdicts are kept with their reasoning.
        </p>
      )}
    </div>
  );
}

const st = {
  wrap: { display: 'flex', flexDirection: 'column', gap: 10, padding: '4px 0' } as CSSProperties,
  compare: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 } as CSSProperties,
  col: { background: 'var(--panel-2)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px' } as CSSProperties,
  colHead: { color: 'var(--muted)', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 } as CSSProperties,
  fact: { fontSize: 17, fontWeight: 700, letterSpacing: -0.3 } as CSSProperties,
  sub: { color: 'var(--muted)', fontSize: 12.5, margin: '2px 0 0' } as CSSProperties,
  spec: { color: 'var(--muted)', fontSize: 12, marginTop: 6, lineHeight: 1.45 } as CSSProperties,
  alt: { marginLeft: 6, fontSize: 10.5, border: '1px solid var(--warn-soft)', color: 'var(--warn)', borderRadius: 999, padding: '0 6px' } as CSSProperties,
  deviation: { color: 'var(--warn)', fontSize: 12.5, margin: 0 } as CSSProperties,
  verdictLine: { fontSize: 13, margin: 0, lineHeight: 1.5 } as CSSProperties,
  form: { display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' } as CSSProperties,
  field: { flex: '0 1 220px', maxWidth: 260 } as CSSProperties,
  grow: { flex: '1 1 220px', maxWidth: 420 } as CSSProperties,
  muted: { color: 'var(--muted)', fontSize: 12.5, margin: 0 } as CSSProperties,
  bad: { color: 'var(--bad)', fontSize: 12.5, margin: 0 } as CSSProperties,
};

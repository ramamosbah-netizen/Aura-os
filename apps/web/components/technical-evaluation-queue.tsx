'use client';

import { type CSSProperties, useCallback, useEffect, useState } from 'react';
import TechnicalEvaluationPanel from './technical-evaluation-panel';

interface AwaitingLine {
  id: string;
  offeredManufacturer: string | null;
  offeredModel: string | null;
  quantity: number | null;
  uom: string | null;
  complianceResponse: string | null;
}

/**
 * The offers waiting on this evaluator.
 *
 * Derived from the ABSENCE of a verdict, so an offer leaves the queue precisely when somebody
 * decides about it — there is no separate "pending" flag that could disagree with the decisions.
 */
export default function TechnicalEvaluationQueue({ quotationId }: { quotationId: string }) {
  const [lines, setLines] = useState<AwaitingLine[] | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    const res = await fetch(`/api/procurement/quotation-lines/awaiting/${quotationId}`, { cache: 'no-store' });
    setLines(res.ok ? ((await res.json().catch(() => [])) as AwaitingLine[]) : null);
  }, [quotationId]);

  useEffect(() => { void load(); }, [load]);

  if (lines === null) {
    return <p style={st.muted} data-testid="queue-unavailable">You do not have access to technical evaluation.</p>;
  }

  if (lines.length === 0) {
    return <p style={st.muted} data-testid="queue-empty">Nothing on this quotation is waiting for a technical verdict.</p>;
  }

  return (
    <div data-testid="evaluation-queue">
      {lines.map((l) => (
        <section key={l.id} style={st.card} data-testid={`queue-item-${l.id}`}>
          <div style={st.head}>
            <div>
              <div style={st.title}>{l.offeredManufacturer ?? '—'} {l.offeredModel ?? ''}</div>
              <div style={st.sub}>
                {l.quantity ?? '—'} {l.uom ?? ''}
                {l.complianceResponse && <> · supplier states {l.complianceResponse.replace(/_/g, ' ')}</>}
              </div>
            </div>
            <button type="button" className="btn btn-ghost" style={st.sm}
              onClick={() => setOpenId(openId === l.id ? null : l.id)}
              data-testid={`queue-open-${l.id}`}>
              {openId === l.id ? 'Hide' : 'Evaluate'}
            </button>
          </div>
          {openId === l.id && (
            <TechnicalEvaluationPanel quotationLineId={l.id} />
          )}
        </section>
      ))}
    </div>
  );
}

const st = {
  muted: { color: 'var(--muted)', fontSize: 13, margin: 0 } as CSSProperties,
  card: { background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 14, padding: '12px 14px', marginBottom: 12 } as CSSProperties,
  head: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' } as CSSProperties,
  title: { fontSize: 15, fontWeight: 600 } as CSSProperties,
  sub: { color: 'var(--muted)', fontSize: 12.5, marginTop: 2 } as CSSProperties,
  sm: { padding: '4px 10px', fontSize: 12 } as CSSProperties,
};

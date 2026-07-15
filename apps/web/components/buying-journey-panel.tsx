'use client';

import { useCallback, useEffect, useState, type CSSProperties } from 'react';
import {
  buyingJourneyAlignment, scorePursuit, recommendPursuit, BUYING_LADDER, PURSUIT_DIMENSIONS,
  type BuyingStage, type PursuitDimensions, type PursuitDimensionKey,
} from '@aura/shared';

// Buying Journey + Pursue/No-Pursue — track where the CUSTOMER is (vs. our sales stage) and
// record a scored decision on whether the deal is worth chasing. Mounted on Opportunity 360.

interface Opp {
  id: string; title: string; stage: string; buyingStage: BuyingStage | null;
  pursuitDecision: string | null; pursuitScore: number | null; pursuitRationale: string | null;
}

const BUYING_OPTIONS: BuyingStage[] = [...BUYING_LADDER, 'DEFERRED'];
const RATING = { '': null, low: 30, medium: 60, high: 90 } as const;
type RatingKey = keyof typeof RATING;
const sevColor = (s: string | null): string => (s === 'HIGH' ? '#dc2626' : s === 'MEDIUM' ? '#d97706' : 'var(--muted)');
const nice = (s: string): string => s.replace(/_/g, ' ').toLowerCase();
const dimLabel = (k: string): string => k.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase());

export default function BuyingJourneyPanel({ opportunityId }: { opportunityId: string }) {
  const [opp, setOpp] = useState<Opp | null>(null);
  const [busy, setBusy] = useState(false);
  const [ratings, setRatings] = useState<Record<string, RatingKey>>({});
  const [rationale, setRationale] = useState('');

  const load = useCallback(async () => {
    const res = await fetch(`/api/crm/opportunities/${opportunityId}`, { cache: 'no-store' });
    if (res.ok) setOpp(await res.json());
  }, [opportunityId]);
  useEffect(() => { void load(); }, [load]);

  const setBuyingStage = async (buyingStage: string): Promise<void> => {
    setBusy(true);
    try {
      const res = await fetch(`/api/crm/opportunities/${opportunityId}`, {
        method: 'PATCH', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ buyingStage }),
      });
      if (res.ok) await load();
    } finally { setBusy(false); }
  };

  const dimensions = (): PursuitDimensions => {
    const d: PursuitDimensions = {};
    for (const k of PURSUIT_DIMENSIONS) {
      const v = RATING[ratings[k] ?? ''];
      if (v !== null) d[k as PursuitDimensionKey] = v;
    }
    return d;
  };
  const liveScore = scorePursuit(dimensions());
  const anyRated = Object.values(ratings).some((r) => r);

  const decide = async (decision: 'PURSUE' | 'NO_PURSUE'): Promise<void> => {
    setBusy(true);
    try {
      const res = await fetch(`/api/crm/opportunities/${opportunityId}/pursuit`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ decision, dimensions: anyRated ? dimensions() : undefined, rationale: rationale || undefined }),
      });
      if (res.ok) { setRationale(''); await load(); }
    } finally { setBusy(false); }
  };

  if (!opp) return <section style={st.panel}><p style={st.empty}>Loading buying journey…</p></section>;
  const align = buyingJourneyAlignment(opp.stage, opp.buyingStage);

  return (
    <section style={st.panel}>
      <h2 style={st.h2}>Buying Journey &amp; Pursuit</h2>

      <div style={st.block}>
        <div style={st.stageRow}>
          <div><span style={st.label}>Our sales stage</span><div style={st.stageVal}>{nice(opp.stage)}</div></div>
          <span style={st.arrow}>↔</span>
          <div>
            <span style={st.label}>Customer buying stage</span>
            <select style={st.sel} disabled={busy} value={opp.buyingStage ?? ''} onChange={(e) => void setBuyingStage(e.target.value)}>
              <option value="">— set —</option>
              {BUYING_OPTIONS.map((s) => <option key={s} value={s}>{nice(s)}</option>)}
            </select>
          </div>
        </div>
        {align.assessed && (
          <div style={{ ...st.alignBadge, color: align.aligned ? '#16a34a' : sevColor(align.severity) }}>
            {align.aligned ? '✓ aligned with the buyer' : `⚠ ${align.reason}`}
          </div>
        )}
      </div>

      <div style={st.block}>
        <div style={st.blockHead}>
          <h3 style={st.h3}>Pursue / No-Pursue</h3>
          {opp.pursuitDecision
            ? <span style={{ ...st.decisionTag, color: opp.pursuitDecision === 'PURSUE' ? '#16a34a' : '#dc2626' }}>
                {opp.pursuitDecision === 'PURSUE' ? 'Pursuing' : 'Not pursuing'}{opp.pursuitScore != null ? ` · ${opp.pursuitScore}` : ''}
              </span>
            : <span style={st.meta}>not yet assessed</span>}
        </div>
        <div style={st.grid}>
          {PURSUIT_DIMENSIONS.map((k) => (
            <label key={k} style={st.dimRow}>
              <span style={st.dimLabel}>{dimLabel(k)}</span>
              <select style={st.dimSel} value={ratings[k] ?? ''} onChange={(e) => setRatings({ ...ratings, [k]: e.target.value as RatingKey })}>
                <option value="">—</option>
                <option value="low">low</option>
                <option value="medium">med</option>
                <option value="high">high</option>
              </select>
            </label>
          ))}
        </div>
        {anyRated && (
          <div style={st.scoreRow}>
            score <b>{liveScore}</b> → recommendation <b>{recommendPursuit(liveScore).replace('_', '-').toLowerCase()}</b>
          </div>
        )}
        <div style={st.form}>
          <input style={st.input} placeholder="Rationale (why pursue / walk away)" value={rationale} onChange={(e) => setRationale(e.target.value)} />
          <button style={st.pursueBtn} disabled={busy} onClick={() => void decide('PURSUE')}>Pursue</button>
          <button style={st.walkBtn} disabled={busy} onClick={() => void decide('NO_PURSUE')}>No-Pursue</button>
        </div>
      </div>
    </section>
  );
}

const st = {
  panel: { border: '1px solid var(--border)', borderRadius: 10, background: 'var(--panel)', padding: 18, marginTop: 18 } as CSSProperties,
  h2: { fontSize: 17, margin: '0 0 12px', letterSpacing: -0.3 } as CSSProperties,
  block: { paddingTop: 12, marginTop: 12, borderTop: '1px solid var(--border)' } as CSSProperties,
  blockHead: { display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, marginBottom: 8 } as CSSProperties,
  h3: { fontSize: 14, margin: 0, fontWeight: 600 } as CSSProperties,
  stageRow: { display: 'flex', alignItems: 'flex-end', gap: 14, flexWrap: 'wrap' } as CSSProperties,
  label: { fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.3, display: 'block', marginBottom: 3 } as CSSProperties,
  stageVal: { fontSize: 15, fontWeight: 600, textTransform: 'capitalize' } as CSSProperties,
  arrow: { color: 'var(--muted)', fontSize: 16, paddingBottom: 2 } as CSSProperties,
  alignBadge: { marginTop: 10, fontSize: 13, fontWeight: 500 } as CSSProperties,
  decisionTag: { fontSize: 13, fontWeight: 700 } as CSSProperties,
  meta: { fontSize: 12, color: 'var(--muted)' } as CSSProperties,
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 6, marginBottom: 10 } as CSSProperties,
  dimRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, fontSize: 12.5 } as CSSProperties,
  dimLabel: { color: 'var(--fg)' } as CSSProperties,
  dimSel: { padding: '3px 6px', borderRadius: 5, border: '1px solid var(--border)', background: 'var(--panel-2)', color: 'var(--fg)', fontSize: 12 } as CSSProperties,
  sel: { padding: '5px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--panel-2)', color: 'var(--fg)', fontSize: 13, textTransform: 'capitalize' } as CSSProperties,
  scoreRow: { fontSize: 12.5, color: 'var(--muted)', marginBottom: 10 } as CSSProperties,
  form: { display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' } as CSSProperties,
  input: { flex: '1 1 220px', minWidth: 160, padding: '6px 9px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--panel-2)', color: 'var(--fg)', fontSize: 12.5 } as CSSProperties,
  pursueBtn: { fontSize: 12.5, padding: '6px 12px', borderRadius: 6, border: '1px solid #16a34a', background: '#16a34a', color: '#fff', cursor: 'pointer' } as CSSProperties,
  walkBtn: { fontSize: 12.5, padding: '6px 12px', borderRadius: 6, border: '1px solid var(--border)', background: 'transparent', color: 'var(--fg)', cursor: 'pointer' } as CSSProperties,
  empty: { color: 'var(--muted)', fontSize: 13, margin: 0 } as CSSProperties,
};

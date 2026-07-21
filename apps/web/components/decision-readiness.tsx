'use client';

import type { CSSProperties } from 'react';

// Decision readiness — what a commercial decision REQUIRES, and whether it exists.
//
// Evidence is a real document attached to the record, not a tick someone applied. "Vendor
// quotes: ✔" means three vendor-quote documents are on this quotation and can be opened; it
// does not mean somebody said so.
//
// LIMIT, stated plainly: with no DocumentRequirement store yet, requirements come from a fixed
// template and status is derived from what is attached. WAIVED and NOT_APPLICABLE cannot be
// expressed — a requirement that genuinely does not apply to a deal still reads as missing.
// That needs persistence, and pretending otherwise would make the score lie in the safe
// direction, which is the worse direction for a readiness check.

export interface EvidenceDoc {
  id: string;
  kind: string;
  title: string;
  aggregateId: string;
}

/** The evidence a commercial decision asks for. Small on purpose — a checklist nobody can finish gets ignored. */
const TEMPLATE: ReadonlyArray<{ kind: string; label: string; need: number }> = [
  { kind: 'technical_proposal', label: 'Technical proposal', need: 1 },
  { kind: 'commercial_offer', label: 'Commercial offer', need: 1 },
  // Three, because a single supplier price is not a market test.
  { kind: 'vendor_quote', label: 'Vendor quotes', need: 3 },
  { kind: 'datasheet', label: 'Datasheets', need: 1 },
];

export interface Readiness {
  score: number;
  ready: number;
  total: number;
  verdict: 'READY' | 'NEARLY_READY' | 'NOT_READY';
  items: Array<{ kind: string; label: string; have: number; need: number; met: boolean }>;
}

export function readinessFor(docs: EvidenceDoc[]): Readiness {
  const items = TEMPLATE.map((t) => {
    const have = docs.filter((d) => d.kind === t.kind).length;
    return { kind: t.kind, label: t.label, have, need: t.need, met: have >= t.need };
  });
  const ready = items.filter((i) => i.met).length;
  // Whole-requirement, never a weighted fraction of documents: 90% of the paperwork with the
  // vendor quotes missing is not a 90% decision.
  const score = Math.round((ready / items.length) * 100);
  return {
    score,
    ready,
    total: items.length,
    verdict: ready === items.length ? 'READY' : score >= 75 ? 'NEARLY_READY' : 'NOT_READY',
    items,
  };
}

const VERDICT: Record<Readiness['verdict'], { label: string; color: string }> = {
  READY: { label: 'Ready to decide', color: 'var(--good)' },
  NEARLY_READY: { label: 'Nearly ready', color: 'var(--warn)' },
  NOT_READY: { label: 'Not ready', color: 'var(--bad)' },
};

export default function DecisionReadiness({ docs, quotationId }: { docs: EvidenceDoc[]; quotationId: string }) {
  const r = readinessFor(docs);
  const v = VERDICT[r.verdict];

  return (
    <div style={st.wrap}>
      <div style={st.head}>
        <b>Decision readiness</b>
        <span style={{ ...st.verdict, color: v.color, borderColor: v.color }}>
          {v.label} · {r.score}%
        </span>
      </div>

      <ul style={st.list}>
        {r.items.map((i) => (
          <li key={i.kind} style={st.row}>
            <span style={{ ...st.tick, color: i.met ? 'var(--good)' : 'var(--bad)' }}>{i.met ? '✔' : '✖'}</span>
            <span style={st.label}>{i.label}</span>
            <span style={st.count}>
              {i.need > 1 ? `${i.have} of ${i.need}` : i.met ? 'attached' : 'missing'}
            </span>
          </li>
        ))}
      </ul>

      {r.verdict !== 'READY' && (
        <p style={st.note}>
          {r.total - r.ready} requirement{r.total - r.ready === 1 ? '' : 's'} outstanding — approving now
          means approving without them.
        </p>
      )}

      <p style={st.foot}>
        <a href={`/crm/quotations/${quotationId}`} style={st.link}>
          Open the quote to attach evidence →
        </a>
      </p>
    </div>
  );
}

const st = {
  wrap: { borderTop: '1px solid var(--border)', paddingTop: 12, marginTop: 12 } as CSSProperties,
  head: { display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', fontSize: 13.5, marginBottom: 8 } as CSSProperties,
  verdict: { border: '1px solid', borderRadius: 999, padding: '1px 9px', fontSize: 11.5 } as CSSProperties,
  list: { listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 4 } as CSSProperties,
  row: { display: 'grid', gridTemplateColumns: '16px 1fr auto', gap: 8, alignItems: 'baseline', fontSize: 12.5 } as CSSProperties,
  tick: { fontSize: 12 } as CSSProperties,
  label: { color: 'var(--text)' } as CSSProperties,
  count: { color: 'var(--muted)', fontSize: 11.5, fontVariantNumeric: 'tabular-nums' } as CSSProperties,
  note: { color: 'var(--muted)', fontSize: 12, lineHeight: 1.5, margin: '10px 0 0' } as CSSProperties,
  foot: { fontSize: 12, margin: '8px 0 0' } as CSSProperties,
  link: { color: 'var(--accent)', textDecoration: 'none' } as CSSProperties,
};

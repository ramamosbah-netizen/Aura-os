'use client';

import type { CSSProperties } from 'react';

// Decision readiness — what a commercial decision REQUIRES, and whether it exists.
//
// Evidence is a real document attached to the record, not a tick someone applied. "Vendor
// quotes: ✔" means three vendor-quote documents are on this quotation and can be opened; it
// does not mean somebody said so.
//
// TWO SOURCES, in priority order:
//
//   1. PERSISTED requirements (migration 0184). Once a record has a seeded checklist, that is
//      the truth — it can carry WAIVED ("we accepted its absence, here is who and why") and
//      NOT_APPLICABLE ("this deal never needed it"), which a template can never express.
//   2. Otherwise, the template matched against attached documents. Still useful, still honest,
//      but every requirement can only read met or missing.
//
// The fallback is deliberate rather than a stopgap: a quote nobody has set a checklist on
// should still say what it is missing, instead of showing nothing and reading as fine.

export interface EvidenceDoc {
  id: string;
  kind: string;
  title: string;
  aggregateId: string;
}

/** A persisted requirement, as the API returns it. */
export interface StoredRequirement {
  id: string;
  entityId: string;
  type: string;
  status: 'REQUIRED' | 'PROVIDED' | 'WAIVED' | 'NOT_APPLICABLE';
  requiredCount: number;
  evidence: Array<{ type: string; reference: string }>;
  note: string | null;
}

/** Requirement type -> the document kind that satisfies it, and how it reads. */
const TYPE_LABEL: Record<string, string> = {
  TECHNICAL_PROPOSAL: 'Technical proposal',
  COMMERCIAL_OFFER: 'Commercial offer',
  VENDOR_QUOTE: 'Vendor quotes',
  DATASHEET: 'Datasheets',
  DRAWING: 'Drawings',
  METHOD_STATEMENT: 'Method statement',
  WARRANTY_LETTER: 'Warranty letter',
  COMPLIANCE_CERTIFICATE: 'Compliance certificate',
  OTHER: 'Other',
};

/** The evidence a commercial decision asks for. Small on purpose — a checklist nobody can finish gets ignored. */
const TEMPLATE: ReadonlyArray<{ kind: string; label: string; need: number }> = [
  { kind: 'technical_proposal', label: 'Technical proposal', need: 1 },
  { kind: 'commercial_offer', label: 'Commercial offer', need: 1 },
  // Three, because a single supplier price is not a market test.
  { kind: 'vendor_quote', label: 'Vendor quotes', need: 3 },
  { kind: 'datasheet', label: 'Datasheets', need: 1 },
];

export interface ReadinessItem {
  kind: string;
  label: string;
  have: number;
  need: number;
  met: boolean;
  /** Only set when the item came from a persisted requirement. */
  status?: StoredRequirement['status'];
  note?: string | null;
}

export interface Readiness {
  score: number;
  ready: number;
  total: number;
  verdict: 'READY' | 'NEARLY_READY' | 'NOT_READY';
  items: ReadinessItem[];
  /** True when this came from a stored checklist rather than the fallback template. */
  persisted: boolean;
}

export function readinessFor(docs: EvidenceDoc[], requirements?: StoredRequirement[]): Readiness {
  if (requirements && requirements.length > 0) {
    // NOT_APPLICABLE leaves the calculation entirely — it is not a gap, it is a non-question.
    const applicable = requirements.filter((r) => r.status !== 'NOT_APPLICABLE');
    const items: ReadinessItem[] = applicable.map((r) => ({
      kind: r.type,
      label: TYPE_LABEL[r.type] ?? r.type,
      have: r.evidence.length,
      need: r.requiredCount,
      // WAIVED counts as settled: somebody with a name accepted its absence, which is a
      // decision, not a gap.
      met: r.status === 'PROVIDED' || r.status === 'WAIVED',
      status: r.status,
      note: r.note,
    }));
    const ready = items.filter((i) => i.met).length;
    const score = items.length === 0 ? 100 : Math.round((ready / items.length) * 100);
    return {
      score,
      ready,
      total: items.length,
      verdict: ready === items.length ? 'READY' : score >= 75 ? 'NEARLY_READY' : 'NOT_READY',
      items,
      persisted: true,
    };
  }

  const items: ReadinessItem[] = TEMPLATE.map((t) => {
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
    persisted: false,
  };
}

const VERDICT: Record<Readiness['verdict'], { label: string; color: string }> = {
  READY: { label: 'Ready to decide', color: 'var(--good)' },
  NEARLY_READY: { label: 'Nearly ready', color: 'var(--warn)' },
  NOT_READY: { label: 'Not ready', color: 'var(--bad)' },
};

export default function DecisionReadiness({ docs, requirements, quotationId, onSeed }: {
  docs: EvidenceDoc[];
  requirements?: StoredRequirement[];
  quotationId: string;
  onSeed?: () => void;
}) {
  const r = readinessFor(docs, requirements);
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
            <span style={{ ...st.tick, color: i.met ? 'var(--good)' : 'var(--bad)' }}>
              {i.status === 'WAIVED' ? '⊘' : i.met ? '✔' : '✖'}
            </span>
            <span style={st.label}>
              {i.label}
              {i.status === 'WAIVED' && i.note && <span style={st.why}> — {i.note}</span>}
            </span>
            <span style={st.count}>
              {i.status === 'WAIVED'
                ? 'waived'
                : i.need > 1
                  ? `${i.have} of ${i.need}`
                  : i.met
                    ? 'attached'
                    : 'missing'}
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
        {!r.persisted && onSeed && (
          <button type="button" style={st.seed} onClick={onSeed}>
            Set a checklist on this quote
          </button>
        )}
        <a href={`/crm/quotations/${quotationId}`} style={st.link}>
          Open the quote to attach evidence →
        </a>
      </p>
      {!r.persisted && (
        <p style={st.derived}>
          Derived from attached documents — no checklist set, so nothing here can be waived or
          marked not applicable.
        </p>
      )}
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
  foot: { fontSize: 12, margin: '8px 0 0', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' } as CSSProperties,
  seed: { background: 'var(--panel-2)', border: '1px solid var(--border-strong)', borderRadius: 7, color: 'var(--text)', padding: '4px 10px', fontSize: 12, cursor: 'pointer' } as CSSProperties,
  derived: { color: 'var(--muted)', fontSize: 11.5, lineHeight: 1.5, margin: '6px 0 0' } as CSSProperties,
  why: { color: 'var(--muted)', fontSize: 11.5 } as CSSProperties,
  link: { color: 'var(--accent)', textDecoration: 'none' } as CSSProperties,
};

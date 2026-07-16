'use client';

import { useCallback, useEffect, useState, type CSSProperties } from 'react';

// §14 Win Plan — the deal STRATEGY, written down: why the customer buys, why us, and how we
// intend to win. All fields optional; coverage is judged against deal SIZE server-side (a small
// deal with the need + the play reads complete), shown as gaps to fill — never a gate.

const FIELDS: Array<{ key: string; label: string; hint: string }> = [
  { key: 'customerNeed', label: 'Customer need', hint: 'What they need, in their words' },
  { key: 'businessOutcome', label: 'Business outcome', hint: 'What outcome they are buying' },
  { key: 'decisionCriteria', label: 'Decision criteria', hint: 'How offers get scored' },
  { key: 'decisionProcess', label: 'Decision process', hint: 'Who decides, in what order, by when' },
  { key: 'painUrgency', label: 'Pain / urgency', hint: 'Why now' },
  { key: 'differentiation', label: 'Differentiation', hint: 'Why us — defensibly' },
  { key: 'winStrategy', label: 'Win strategy', hint: 'The play for THIS deal' },
  { key: 'competitivePosition', label: 'Competitive position', hint: 'Where we stand vs. the field' },
  { key: 'procurementPath', label: 'Procurement path', hint: 'How the money moves' },
  { key: 'successConditions', label: 'Success conditions', hint: 'What "done well" means to them' },
];

interface Coverage { filled: number; total: number; coverage: number; gaps: Array<{ key: string; label: string }> }
interface Opp { id: string; value: number; winPlan: Record<string, string | null> | null }

export default function WinPlanPanel({ opportunityId }: { opportunityId: string }) {
  const [plan, setPlan] = useState<Record<string, string | null> | null>(null);
  const [coverage, setCoverage] = useState<Coverage | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/crm/opportunities/${opportunityId}`, { cache: 'no-store' });
    if (!res.ok) return;
    const opp = (await res.json()) as Opp;
    setPlan(opp.winPlan ?? {});
    // Coverage is server-derived on save; derive the initial read with one no-op merge.
    const cov = await fetch(`/api/crm/opportunities/${opportunityId}/win-plan`, {
      method: 'PATCH', headers: { 'content-type': 'application/json' }, body: '{}',
    });
    if (cov.ok) setCoverage(((await cov.json()) as { coverage: Coverage }).coverage);
  }, [opportunityId]);

  useEffect(() => { void load(); }, [load]);

  const save = async (key: string): Promise<void> => {
    setBusy(true);
    try {
      const res = await fetch(`/api/crm/opportunities/${opportunityId}/win-plan`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ [key]: draft }),
      });
      if (res.ok) {
        const d = (await res.json()) as { opportunity: Opp; coverage: Coverage };
        setPlan(d.opportunity.winPlan ?? {});
        setCoverage(d.coverage);
        setEditing(null);
      }
    } finally { setBusy(false); }
  };

  if (plan === null) return <section style={st.panel}><p style={st.muted}>Loading win plan…</p></section>;
  const gapKeys = new Set((coverage?.gaps ?? []).map((g) => g.key));

  return (
    <section style={st.panel}>
      <div style={st.head}>
        <h2 style={st.h2}>Win Plan</h2>
        {coverage && (
          <span style={{ ...st.cov, color: coverage.coverage >= 100 ? 'var(--good)' : coverage.coverage >= 50 ? '#d97706' : 'var(--bad)' }}
            title={coverage.gaps.length ? `Expected for this deal size and still empty: ${coverage.gaps.map((g) => g.label).join(', ')}` : 'Complete for this deal size'}>
            {coverage.coverage}% for this deal size · {coverage.filled}/{coverage.total} fields
          </span>
        )}
      </div>
      <div style={st.grid}>
        {FIELDS.map((f) => {
          const value = plan[f.key]?.trim() || null;
          const isGap = gapKeys.has(f.key);
          return (
            <div key={f.key} style={{ ...st.card, ...(isGap ? st.cardGap : {}) }}>
              <div style={st.label}>{f.label}{isGap && <span style={st.gapTag}> · expected</span>}</div>
              {editing === f.key ? (
                <div>
                  <textarea autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} rows={3} style={st.input} placeholder={f.hint} />
                  <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                    <button disabled={busy} onClick={() => void save(f.key)} style={st.saveBtn}>Save</button>
                    <button disabled={busy} onClick={() => setEditing(null)} style={st.ghostBtn}>Cancel</button>
                  </div>
                </div>
              ) : (
                <div style={{ ...st.value, ...(value ? {} : { color: 'var(--muted)', fontStyle: 'italic' }) }}
                  onClick={() => { setEditing(f.key); setDraft(value ?? ''); }} title="Click to edit">
                  {value ?? f.hint}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

const st = {
  panel: { border: '1px solid var(--border)', borderRadius: 10, background: 'var(--panel)', padding: 16, marginBottom: 22 } as CSSProperties,
  head: { display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginBottom: 12 } as CSSProperties,
  h2: { fontSize: 16, margin: 0, letterSpacing: -0.3 } as CSSProperties,
  cov: { fontSize: 12.5, fontWeight: 700, cursor: 'help' } as CSSProperties,
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 10 } as CSSProperties,
  card: { border: '1px solid var(--border)', borderRadius: 8, background: 'var(--panel-2)', padding: '8px 10px' } as CSSProperties,
  cardGap: { borderColor: '#d97706' } as CSSProperties,
  label: { fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--muted)', marginBottom: 4 } as CSSProperties,
  gapTag: { color: '#d97706', textTransform: 'none', letterSpacing: 0 } as CSSProperties,
  value: { fontSize: 13, lineHeight: 1.45, cursor: 'pointer', minHeight: 18, whiteSpace: 'pre-wrap' } as CSSProperties,
  input: { width: '100%', border: '1px solid var(--border)', background: 'var(--panel)', color: 'var(--fg)', borderRadius: 7, padding: '6px 8px', fontSize: 12.5, resize: 'vertical' } as CSSProperties,
  saveBtn: { fontSize: 12, padding: '3px 12px', borderRadius: 6, border: '1px solid var(--fg)', background: 'var(--fg)', color: 'var(--panel)', cursor: 'pointer', fontWeight: 600 } as CSSProperties,
  ghostBtn: { fontSize: 12, padding: '3px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'transparent', color: 'var(--muted)', cursor: 'pointer' } as CSSProperties,
  muted: { color: 'var(--muted)', fontSize: 13, margin: 0 } as CSSProperties,
};

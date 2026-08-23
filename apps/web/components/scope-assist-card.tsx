'use client';

import { useCallback, useEffect, useState, type CSSProperties } from 'react';

// AURA Scope Assist (Slice 5) — grounded, read-only suggestion over the deal's OWN evidence.
// Generate proposes evidence-backed items (+ assumptions + gaps, each item showing provenance); Accept
// spins the suggestion into an EDITABLE draft basis in the package (Accept ≠ Approve — the human then
// approves the basis on the Commercial chain below). This card never authors scope on its own and shows
// no readiness state; the backend is authoritative. It calls onAccepted so the parent re-reads the chain.

interface EvidenceRef { kind: string; sourceId: string; sourceRef?: string | null; excerpt?: string | null }
interface Item { id: string; description: string; unit: string; quantity: number | null; provenance: EvidenceRef[] }
interface Assumption { id: string; statement: string; rationale?: string | null }
interface Gap { id: string; question: string; hint?: string | null }
interface Proposal {
  id: string; version: number; status: string; generator: string; evidenceStale: boolean;
  items: Item[]; assumptions: Assumption[]; gaps: Gap[]; generatedAt: string; acceptedBasisRevisionId: string | null;
}

export default function ScopeAssistCard({ opportunityId, onAccepted }: { opportunityId: string; onAccepted?: () => void }) {
  const [proposals, setProposals] = useState<Proposal[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const base = `/api/crm/opportunities/${opportunityId}`;
  const load = useCallback(async () => {
    const res = await fetch(`${base}/scope-assist`, { cache: 'no-store' });
    if (res.ok) { const j = await res.json(); setProposals(Array.isArray(j.proposals) ? j.proposals : []); }
    else setProposals([]);
  }, [base]);
  useEffect(() => { void load(); }, [load]);

  const cmd = useCallback(async (path: string): Promise<boolean> => {
    setBusy(true); setErr(null);
    try {
      const res = await fetch(`${base}${path}`, { method: 'POST' });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setErr(typeof j?.message === 'string' ? j.message : `Request failed (${res.status})`);
        return false;
      }
      await load();
      return true;
    } finally { setBusy(false); }
  }, [base, load]);

  if (!proposals) return null;

  // The active suggestion (latest still-open); accepted/superseded ones become history.
  const active = proposals.find((p) => p.status === 'suggested') ?? null;
  const accepted = proposals.filter((p) => p.status === 'accepted');

  return (
    <div style={st.wrap}>
      <div style={st.head}>
        <span style={st.title}>✨ Scope Assist</span>
        <span style={st.muted}>grounded in this deal&apos;s evidence — you accept, edit, then approve</span>
        <button style={st.btn} disabled={busy} onClick={() => void cmd('/scope-assist/generate')}>
          {proposals.length === 0 ? 'Generate suggestion' : 'Regenerate'}
        </button>
      </div>

      {err && <p style={st.err}>{err}</p>}

      {active && (
        <div style={st.proposal}>
          <div style={st.pHead}>
            <span style={st.pVer}>Suggestion v{active.version}</span>
            <span style={st.tag}>{active.generator}</span>
            {active.evidenceStale && <span style={st.stale}>evidence changed — Regenerate for a fresh version</span>}
          </div>

          {active.items.length > 0 && (
            <div style={st.section}>
              <div style={st.secLabel}>Evidence-backed items</div>
              <ul style={st.list}>
                {active.items.map((it) => (
                  <li key={it.id} style={st.item}>
                    <div style={st.itemMain}>
                      <span style={st.itemDesc}>{it.description}</span>
                      <span style={st.muted}>{it.quantity != null ? `${it.quantity} ${it.unit}` : it.unit}</span>
                    </div>
                    <div style={st.prov}>
                      {it.provenance.map((p, i) => (
                        <span key={i} style={st.provChip} title={p.excerpt ?? ''}>⛓ {p.kind}{p.sourceRef ? ` · ${p.sourceRef}` : ''}</span>
                      ))}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {active.assumptions.length > 0 && (
            <div style={st.section}>
              <div style={st.secLabel}>Assumptions <span style={st.muted}>(confirm before relying on these)</span></div>
              <ul style={st.plainList}>
                {active.assumptions.map((a) => <li key={a.id} style={st.assume}>{a.statement}{a.rationale ? <span style={st.muted}> — {a.rationale}</span> : null}</li>)}
              </ul>
            </div>
          )}

          {active.gaps.length > 0 && (
            <div style={st.section}>
              <div style={st.secLabel}>Gaps / questions <span style={st.muted}>(nothing was filled in silently)</span></div>
              <ul style={st.plainList}>
                {active.gaps.map((g) => <li key={g.id} style={st.gap}>❓ {g.question}{g.hint ? <span style={st.muted}> — {g.hint}</span> : null}</li>)}
              </ul>
            </div>
          )}

          <div style={st.actions}>
            <button style={st.btnAccent} disabled={busy || active.items.length === 0}
              onClick={async () => { if (await cmd(`/scope-assist/${active.id}/accept`)) onAccepted?.(); }}>
              Accept → editable draft basis
            </button>
            <span style={st.muted}>Accept only creates a draft you can edit — approval stays a separate step below.</span>
          </div>
        </div>
      )}

      {accepted.length > 0 && (
        <p style={st.history}>{accepted.length} suggestion{accepted.length > 1 ? 's' : ''} accepted into the scope chain below.</p>
      )}
    </div>
  );
}

const st = {
  wrap: { border: '1px solid var(--border)', borderRadius: 8, background: 'var(--panel-2)', padding: 12, marginBottom: 10 } as CSSProperties,
  head: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' } as CSSProperties,
  title: { fontWeight: 700, fontSize: 13 } as CSSProperties,
  muted: { fontSize: 12, color: 'var(--muted)' } as CSSProperties,
  btn: { marginLeft: 'auto', fontSize: 12, padding: '5px 11px', borderRadius: 6, border: '1px solid var(--text)', background: 'var(--text)', color: 'var(--panel)', cursor: 'pointer' } as CSSProperties,
  err: { color: 'var(--bad)', fontSize: 12.5, margin: '8px 0 0' } as CSSProperties,
  proposal: { marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border)' } as CSSProperties,
  pHead: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 8 } as CSSProperties,
  pVer: { fontWeight: 600, fontSize: 12.5 } as CSSProperties,
  tag: { fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.3, color: 'var(--muted)', border: '1px solid var(--border)', borderRadius: 4, padding: '1px 6px' } as CSSProperties,
  stale: { fontSize: 11, fontWeight: 700, color: 'var(--warn)' } as CSSProperties,
  section: { marginBottom: 10 } as CSSProperties,
  secLabel: { fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.3, color: 'var(--muted)', marginBottom: 5 } as CSSProperties,
  list: { listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6 } as CSSProperties,
  item: { border: '1px solid var(--border)', borderRadius: 6, padding: '6px 8px', background: 'var(--panel)' } as CSSProperties,
  itemMain: { display: 'flex', gap: 8, alignItems: 'baseline', justifyContent: 'space-between' } as CSSProperties,
  itemDesc: { fontSize: 12.5, fontWeight: 600 } as CSSProperties,
  prov: { display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 4 } as CSSProperties,
  provChip: { fontSize: 10.5, color: 'var(--muted)', border: '1px solid var(--border)', borderRadius: 4, padding: '1px 5px' } as CSSProperties,
  plainList: { margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 3 } as CSSProperties,
  assume: { fontSize: 12.5 } as CSSProperties,
  gap: { fontSize: 12.5, listStyle: 'none', marginLeft: -18 } as CSSProperties,
  actions: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginTop: 6 } as CSSProperties,
  btnAccent: { fontSize: 12, padding: '6px 12px', borderRadius: 6, border: '1px solid var(--accent)', background: 'var(--accent)', color: '#fff', cursor: 'pointer' } as CSSProperties,
  history: { fontSize: 12, color: 'var(--muted)', margin: '8px 0 0' } as CSSProperties,
};

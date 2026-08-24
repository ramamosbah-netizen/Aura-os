'use client';

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import ScopeAssistCard from './scope-assist-card';
import ScopeEvidenceCard from './scope-evidence-card';

// Commercial (Pre-Award) — the ONE UI over a direct deal's Pre-Award package aggregate:
//   Scope basis → Estimate revision → Pricing sheet → Quotation.
// Every readiness gate and every button's enabled/disabled state is derived from the server's
// governance facts (GET .../pre-award-package). The panel holds NO readiness state of its own; it
// re-fetches after each command. The backend is the final enforcement — the UI only mirrors it.

interface Governance { governed: boolean; packageId: string | null; scopeApproved: boolean; estimateApproved: boolean; pricingFrozen: boolean }
interface Pkg { id: string; route: string; status: string }
interface BasisLine { lineId: string; description: string; unit: string; quantity: number | null; sourceLineId: string; editedBy?: string | null; editedAt?: string | null }
interface EditableLine { lineId: string; description: string; unit: string; quantity: string; sourceLineId: string }
interface Basis { id: string; revisionNo: number; status: string; sourceId: string; lines: BasisLine[]; approvedAt: string | null }
interface EstimateTotals { totalDirectCost?: number; estimatedCost?: number; totalSellingValue?: number; marginPercent?: number; lineCount?: number }
interface Estimate { id: string; revisionNo: number; status: string; basisRevisionId: string; totals: EstimateTotals; frozenAt: string | null; approvedAt: string | null }
interface PricingSheet { id: string; version: number; status: string; estimateRevisionId: string | null; totals: { totalCost: number; totalSell: number; marginPercent: number }; frozenAt: string | null; quotationId: string | null }
interface QuotationLite { id: string; quoteNumber: string; status: string; total: number }
interface Deal { executionType: string; tenderId: string | null; stage: string }
interface Aggregate { package: Pkg | null; basis: Basis[]; estimates: Estimate[]; pricing: PricingSheet[]; governance: Governance; quotations: QuotationLite[]; deal: Deal }

interface ScopeLineForm { description: string; unit: string; quantity: string }

const aed = (n: number | undefined): string => (Number(n) || 0).toLocaleString(undefined, { maximumFractionDigits: 0 });
const blankScopeLine = (): ScopeLineForm => ({ description: '', unit: 'no', quantity: '' });

/**
 * Load is a STATE MACHINE, not a nullable value. Collapsing "failed" into "no data yet" is what let a
 * 404 render as "Loading commercial workspace…" forever — the panel looked like it was working while
 * every request was failing, which is exactly the blindness that hid the missing BFF routes.
 */
type LoadState =
  | { state: 'loading' }
  | { state: 'error'; message: string }
  | { state: 'loaded'; aggregate: Aggregate };

export default function CommercialPanel({ opportunityId }: { opportunityId: string }) {
  const [load, setLoad] = useState<LoadState>({ state: 'loading' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [scopeLines, setScopeLines] = useState<ScopeLineForm[]>([blankScopeLine()]);
  const [editing, setEditing] = useState<{ basisId: string; lines: EditableLine[] } | null>(null);
  // Bumped whenever evidence changes, so the Scope Assist card re-reads and its staleness flag refreshes.
  const [evidenceVersion, setEvidenceVersion] = useState(0);

  const base = `/api/crm/opportunities/${opportunityId}`;
  const reload = useCallback(async () => {
    try {
      const res = await fetch(`${base}/pre-award-package`, { cache: 'no-store' });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        const detail = typeof j?.message === 'string' ? j.message : `HTTP ${res.status}`;
        setLoad({ state: 'error', message: `Could not load the commercial workspace — ${detail}` });
        return;
      }
      setLoad({ state: 'loaded', aggregate: await res.json() });
    } catch {
      setLoad({ state: 'error', message: 'The CRM API is unreachable from the web app.' });
    }
  }, [base]);
  useEffect(() => { void reload(); }, [reload]);
  const load_ = reload; // stable alias used by the command helper below
  const agg = load.state === 'loaded' ? load.aggregate : null;

  // Every command posts, then RE-READS the aggregate — the UI never advances its own state on success.
  const cmd = useCallback(async (path: string, body?: unknown): Promise<boolean> => {
    setBusy(true); setErr(null);
    try {
      const res = await fetch(`${base}${path}`, {
        method: 'POST', headers: body !== undefined ? { 'content-type': 'application/json' } : undefined,
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setErr(typeof j?.message === 'string' ? j.message : (Array.isArray(j?.message) ? j.message.join(', ') : `Request failed (${res.status})`));
        return false;
      }
      await load_();
      return true;
    } finally { setBusy(false); }
  }, [base, load_]);

  /** PATCH the draft basis lines — the human half of Accept ≠ Approve. */
  const saveEdit = useCallback(async (basisId: string, lines: EditableLine[]): Promise<boolean> => {
    setBusy(true); setErr(null);
    try {
      const payload = lines
        .filter((l) => l.description.trim())
        .map((l) => ({
          lineId: l.lineId,
          description: l.description.trim(),
          unit: l.unit.trim() || 'no',
          // Blank means the quantity is still UNKNOWN — send null, never 0.
          quantity: l.quantity.trim() === '' ? null : Number(l.quantity),
          sourceLineId: l.sourceLineId,
        }));
      if (payload.length === 0) { setErr('a scope basis needs at least one line'); return false; }
      const res = await fetch(`${base}/pre-award-package/scope/${basisId}/lines`, {
        method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ lines: payload }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setErr(typeof j?.message === 'string' ? j.message : `Request failed (${res.status})`);
        return false;
      }
      await load_();
      setEditing(null);
      return true;
    } finally { setBusy(false); }
  }, [base, load_]);

  const g = agg?.governance;
  const approvedBasis = useMemo(() => agg?.basis.find((b) => b.status === 'approved') ?? null, [agg]);

  const createBasis = async () => {
    const lines = scopeLines
      .filter((l) => l.description.trim() && Number(l.quantity) > 0)
      .map((l, i) => ({ lineId: `L${i + 1}`, description: l.description, unit: l.unit || 'no', quantity: Number(l.quantity), sourceLineId: `S${i + 1}` }));
    if (lines.length === 0) return;
    if (await cmd('/pre-award-package/scope', { sourceId: `scope-${Date.now()}`, lines })) setScopeLines([blankScopeLine()]);
  };

  /**
   * Open the Estimation Workspace (Slice 6B) in a new tab. Creates a fresh cost-only estimate revision
   * from the approved basis (seeded with a zero-cost row per line), then opens its dedicated page — so
   * a long estimating session keeps the Opportunity context here. No costs or pricing are entered here.
   */
  const openEstimation = async () => {
    if (!approvedBasis) return;
    setBusy(true); setErr(null);
    try {
      const lines = approvedBasis.lines.map((l) => ({ lineId: l.lineId, description: l.description, unit: l.unit, quantity: l.quantity, sourceLineId: l.sourceLineId }));
      const res = await fetch(`${base}/pre-award-package/estimate`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ basisRevisionId: approvedBasis.id, lines, buildUps: [] }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setErr(typeof j?.message === 'string' ? j.message : `Could not open estimation (${res.status})`);
        return;
      }
      const j = await res.json();
      const estId = j?.estimate?.id as string | undefined;
      await load_();
      if (estId) window.open(`/crm/opportunities/${opportunityId}/pre-award/estimate/${estId}`, '_blank', 'noreferrer');
    } finally { setBusy(false); }
  };

  // Four distinct states. A failure is never dressed up as "still loading".
  if (load.state === 'loading') return <section style={st.panel}><p style={st.empty}>Loading commercial workspace…</p></section>;
  if (load.state === 'error') {
    return (
      <section style={st.panel}>
        <h2 style={st.h2}>Commercial — Pre-Award</h2>
        <p style={st.err}>{load.message}</p>
        <button style={st.btn} onClick={() => { setLoad({ state: 'loading' }); void reload(); }}>Retry</button>
      </section>
    );
  }
  if (!agg) return null;

  // Tender-route deals are quoted through their tender, not a direct package.
  if (agg.deal.tenderId || agg.deal.executionType === 'tender') {
    return (
      <section style={st.panel}>
        <h2 style={st.h2}>Commercial</h2>
        <p style={st.notice}>This is a <b>tender-route</b> deal — its Pre-Award (scope, estimate, pricing) is managed by the linked tender. Quote through the tender, not a direct package.</p>
      </section>
    );
  }

  const ready = !!g?.governed && g.scopeApproved && g.estimateApproved && g.pricingFrozen;

  return (
    <section style={st.panel}>
      <h2 style={st.h2}>Commercial — Pre-Award</h2>
      <p style={st.sub}>Every quotation is earned through the chain: approve a Scope, build &amp; approve an Estimate, freeze the Pricing, then raise the Quotation.</p>

      {/* Readiness strip — derived ENTIRELY from server governance */}
      <div style={st.strip}>
        <Chip label="Package" ok={!!g?.governed} pend={!g?.governed ? 'not opened' : undefined} />
        <Arrow />
        <Chip label="Scope approved" ok={!!g?.scopeApproved} />
        <Arrow />
        <Chip label="Estimate approved" ok={!!g?.estimateApproved} />
        <Arrow />
        <Chip label="Pricing frozen" ok={!!g?.pricingFrozen} />
        <Arrow />
        <Chip label="Quotable" ok={ready} strong />
      </div>

      {err && <p style={st.err}>{err}</p>}

      {/* Evidence FIRST, then the suggestion built on it. Capturing a requirement changes the evidence
          fingerprint, so any live proposal is marked stale on the next read. */}
      <ScopeEvidenceCard opportunityId={opportunityId} onChanged={() => setEvidenceVersion((v) => v + 1)} />

      {/* AURA Scope Assist — a grounded suggestion over this deal's OWN evidence. Accept spins the
          suggestion off into an EDITABLE draft basis (opening the package if needed); approving that
          basis stays the separate human step in the chain below. */}
      <ScopeAssistCard key={evidenceVersion} opportunityId={opportunityId} onAccepted={() => void reload()} />

      {!g?.governed && (
        <div style={st.block}>
          <p style={st.empty}>No Pre-Award package yet for this direct deal.</p>
          <button style={st.btnAccent} disabled={busy} onClick={() => void cmd('/pre-award-package/open')}>Open Pre-Award package</button>
        </div>
      )}

      {g?.governed && (
        <>
          {/* ── Scope ── */}
          <div style={st.block}>
            <h3 style={st.h3}>1 · Scope basis {g.scopeApproved && <span style={st.done}>approved ✓</span>}</h3>
            {agg.basis.map((b) => {
              const isEditing = editing?.basisId === b.id;
              const unknownCount = b.lines.filter((l) => l.quantity === null || l.quantity === undefined).length;
              return (
              <div key={b.id} style={st.card}>
                <div style={st.cardHead}>
                  <span style={st.name}>Basis B-{String(b.revisionNo).padStart(3, '0')}</span>
                  <StatusTag status={b.status} />
                  <span style={st.meta}>{b.lines.length} line(s)</span>
                  {b.status === 'draft' && !isEditing && (
                    <button style={st.btnGhost} disabled={busy}
                      onClick={() => setEditing({ basisId: b.id, lines: b.lines.map((l) => ({ ...l, quantity: l.quantity === null || l.quantity === undefined ? '' : String(l.quantity) })) })}>
                      Edit lines
                    </button>
                  )}
                  {b.status === 'draft' && !isEditing && (
                    <button style={st.btn} disabled={busy || unknownCount > 0}
                      title={unknownCount > 0 ? `${unknownCount} line(s) still have an unknown quantity — edit the draft to supply them` : undefined}
                      onClick={() => void cmd(`/pre-award-package/scope/${b.id}/approve`)}>Approve scope ✓</button>
                  )}
                </div>

                {/* Unknown ≠ zero: the draft says so plainly, and approval stays blocked until it's resolved. */}
                {b.status === 'draft' && unknownCount > 0 && !isEditing && (
                  <p style={st.warnLine}>{unknownCount} line(s) have an <b>unknown</b> quantity. Edit the draft to supply them — an unknown quantity is not zero, so it cannot be estimated or priced.</p>
                )}

                {!isEditing && b.lines.length > 0 && (
                  <ul style={st.lineList}>{b.lines.map((l) => (
                    <li key={l.lineId} style={st.lineRow}>
                      <span>{l.description}{l.editedBy && <span style={st.editedTag} title={`Edited by ${l.editedBy}`}>human-edited</span>}</span>
                      <span style={st.meta}>{l.quantity === null || l.quantity === undefined ? <span style={st.unknown}>quantity unknown</span> : `${l.quantity} ${l.unit}`}</span>
                    </li>
                  ))}</ul>
                )}

                {/* The EDITABLE draft — change description/unit/quantity, add or remove lines, then save.
                    Provenance is preserved server-side; a changed line is stamped as human-edited. */}
                {isEditing && (
                  <div style={st.editBox}>
                    {editing.lines.map((l, i) => (
                      <div key={l.lineId} style={st.editRow}>
                        <input style={st.inputWide} value={l.description} placeholder="Scope item"
                          onChange={(e) => setEditing({ ...editing, lines: editing.lines.map((x, j) => j === i ? { ...x, description: e.target.value } : x) })} />
                        <input style={st.inputQty} value={l.quantity} placeholder="Qty (blank = unknown)" inputMode="decimal"
                          onChange={(e) => setEditing({ ...editing, lines: editing.lines.map((x, j) => j === i ? { ...x, quantity: e.target.value } : x) })} />
                        <input style={st.inputUnit} value={l.unit} placeholder="Unit"
                          onChange={(e) => setEditing({ ...editing, lines: editing.lines.map((x, j) => j === i ? { ...x, unit: e.target.value } : x) })} />
                        <button style={st.linkBtn} disabled={busy}
                          onClick={() => setEditing({ ...editing, lines: editing.lines.filter((_, j) => j !== i) })}>remove</button>
                      </div>
                    ))}
                    <div style={st.editActions}>
                      <button style={st.btnGhost} disabled={busy}
                        onClick={() => setEditing({ ...editing, lines: [...editing.lines, { lineId: `L-${Date.now()}`, description: '', unit: 'no', quantity: '', sourceLineId: `manual-${Date.now()}` }] })}>+ line</button>
                      <button style={st.btnAccent} disabled={busy} onClick={() => void saveEdit(b.id, editing.lines)}>Save draft</button>
                      <button style={st.linkBtn} disabled={busy} onClick={() => setEditing(null)}>cancel</button>
                      <span style={st.meta}>Leave a quantity blank to keep it unknown — it will block approval until supplied.</span>
                    </div>
                  </div>
                )}
              </div>
            );})}
            {/* A draft (or the very first) basis can be authored. Once approved it's immutable — a new
                basis becomes the next revision. */}
            <div style={st.builder}>
              <div style={st.builderTitle}>{agg.basis.length === 0 ? 'New scope basis' : `New basis revision (B-${String(agg.basis.length + 1).padStart(3, '0')})`}</div>
              {scopeLines.map((l, i) => (
                <div key={i} style={st.lineForm}>
                  <input style={st.input} placeholder="Scope item" value={l.description} onChange={(e) => setScopeLines(scopeLines.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)))} />
                  <input style={st.qtyIn} type="number" placeholder="Qty" value={l.quantity} onChange={(e) => setScopeLines(scopeLines.map((x, j) => (j === i ? { ...x, quantity: e.target.value } : x)))} />
                  <input style={st.qtyIn} placeholder="Unit" value={l.unit} onChange={(e) => setScopeLines(scopeLines.map((x, j) => (j === i ? { ...x, unit: e.target.value } : x)))} />
                </div>
              ))}
              <div style={st.form}>
                <button style={st.btnGhost} onClick={() => setScopeLines([...scopeLines, blankScopeLine()])}>+ line</button>
                <button style={st.btn} disabled={busy || scopeLines.every((l) => !l.description.trim())} onClick={() => void createBasis()}>Create scope basis (draft)</button>
              </div>
            </div>
          </div>

          {/* ── Estimate — a SUMMARY here; the detail lives in the Estimation Workspace (Slice 6B). ── */}
          <div style={st.block}>
            <h3 style={st.h3}>2 · Estimate {g.estimateApproved && <span style={st.done}>approved ✓</span>}</h3>
            {agg.estimates.map((e) => (
              <div key={e.id} style={st.card}>
                <div style={st.cardHead}>
                  <span style={st.name}>Estimate E-{String(e.revisionNo).padStart(3, '0')}</span>
                  <StatusTag status={e.status} />
                  {/* Cost only — no sell/margin here; those are Pricing. estimatedCost (falls back to
                      direct cost for legacy rows that predate the boundary). */}
                  <span style={st.meta}>{e.totals.lineCount ?? 0} line(s) · estimated cost AED {aed(e.totals.estimatedCost ?? e.totals.totalDirectCost)}</span>
                  <a style={st.btn} href={`/crm/opportunities/${opportunityId}/pre-award/estimate/${e.id}`} target="_blank" rel="noreferrer">Open Estimation ↗</a>
                </div>
              </div>
            ))}
            {!g.scopeApproved && <p style={st.empty}>Approve a scope basis first — the estimate is built on it.</p>}
            {g.scopeApproved && approvedBasis && (
              <div style={st.form}>
                <button style={st.btnAccent} disabled={busy} onClick={() => void openEstimation()}>
                  {agg.estimates.length === 0 ? 'Open Estimation Workspace →' : 'New estimate revision →'}
                </button>
                <span style={st.meta}>Enter Materials, Labour, Plant &amp; Subcontract per line in a dedicated tab. Cost only — pricing comes after.</span>
              </div>
            )}
          </div>

          {/* ── Pricing ── */}
          <div style={st.block}>
            <h3 style={st.h3}>3 · Pricing {g.pricingFrozen && <span style={st.done}>frozen ✓</span>}</h3>
            {agg.pricing.map((p) => (
              <div key={p.id} style={st.card}>
                <div style={st.cardHead}>
                  <span style={st.name}>Pricing v{p.version}</span>
                  <StatusTag status={p.status} />
                  <span style={st.meta}>cost AED {aed(p.totals.totalCost)} · sell AED {aed(p.totals.totalSell)} · {p.totals.marginPercent}%</span>
                </div>
              </div>
            ))}
            {!g.pricingFrozen && (
              g.estimateApproved
                ? <button style={st.btnAccent} disabled={busy} onClick={() => void cmd('/pre-award-package/pricing/freeze')}>Freeze pricing (from approved estimate)</button>
                : <p style={st.empty}>Approve an estimate first — pricing is frozen from it.</p>
            )}
          </div>

          {/* ── Quotation ── */}
          <div style={st.block}>
            <h3 style={st.h3}>4 · Quotation</h3>
            {agg.quotations.map((q) => (
              <div key={q.id} style={st.card}>
                <div style={st.cardHead}>
                  <span style={st.name}>{q.quoteNumber}</span>
                  <StatusTag status={q.status} />
                  <span style={st.meta}>AED {aed(q.total)}</span>
                  <a href="/crm/quotations" style={st.quoteLink}>Open →</a>
                </div>
              </div>
            ))}
            {ready
              ? <button style={st.btnAccent} disabled={busy} onClick={() => void cmd('/convert-to-quotation')}>Create quotation from this package</button>
              : <p style={st.empty}>Complete Scope → Estimate → Pricing above to raise a quotation.</p>}
          </div>
        </>
      )}
    </section>
  );
}

function Chip({ label, ok, pend, strong }: { label: string; ok: boolean; pend?: string; strong?: boolean }) {
  return (
    <span style={{ ...st.chip, ...(ok ? st.chipOk : st.chipOff), ...(strong && ok ? st.chipStrong : {}) }}>
      <span style={st.chipDot(ok)} /> {label}{pend ? ` · ${pend}` : ''}
    </span>
  );
}
function Arrow() { return <span style={st.arrow}>›</span>; }
function StatusTag({ status }: { status: string }) {
  const good = status === 'approved' || status === 'frozen';
  return <span style={{ ...st.statusTag, color: good ? 'var(--good)' : 'var(--muted)' }}>{status}</span>;
}

const st = {
  panel: { border: '1px solid var(--border)', borderRadius: 10, background: 'var(--panel)', padding: 18, marginTop: 18 } as CSSProperties,
  h2: { fontSize: 17, margin: '0 0 4px', letterSpacing: -0.3 } as CSSProperties,
  sub: { fontSize: 12.5, color: 'var(--muted)', margin: '0 0 14px' } as CSSProperties,
  notice: { fontSize: 13, color: 'var(--muted)', margin: 0, lineHeight: 1.5 } as CSSProperties,
  strip: { display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', padding: '10px 0', borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)' } as CSSProperties,
  chip: { display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5, fontWeight: 600, padding: '4px 9px', borderRadius: 20, border: '1px solid var(--border)' } as CSSProperties,
  chipOk: { color: 'var(--good)', borderColor: 'color-mix(in srgb, var(--good) 40%, var(--border))' } as CSSProperties,
  chipOff: { color: 'var(--muted)' } as CSSProperties,
  chipStrong: { background: 'color-mix(in srgb, var(--good) 14%, transparent)' } as CSSProperties,
  chipDot: (ok: boolean): CSSProperties => ({ width: 7, height: 7, borderRadius: '50%', background: ok ? 'var(--good)' : 'var(--muted)', display: 'inline-block' }),
  arrow: { color: 'var(--muted)', fontSize: 14 } as CSSProperties,
  block: { paddingTop: 12, marginTop: 12, borderTop: '1px solid var(--border)' } as CSSProperties,
  h3: { fontSize: 14, margin: '0 0 8px', fontWeight: 600, display: 'flex', gap: 8, alignItems: 'center' } as CSSProperties,
  done: { fontSize: 11, fontWeight: 700, color: 'var(--good)', textTransform: 'uppercase', letterSpacing: 0.3 } as CSSProperties,
  card: { border: '1px solid var(--border)', borderRadius: 8, padding: 10, marginBottom: 8, background: 'var(--panel-2)' } as CSSProperties,
  cardHead: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' } as CSSProperties,
  name: { fontWeight: 600, fontSize: 13 } as CSSProperties,
  meta: { fontSize: 12, color: 'var(--muted)' } as CSSProperties,
  statusTag: { fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.3, fontWeight: 700 } as CSSProperties,
  lineList: { listStyle: 'none', margin: '8px 0 0', padding: 0, display: 'flex', flexDirection: 'column', gap: 3 } as CSSProperties,
  lineRow: { display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'space-between', fontSize: 12 } as CSSProperties,
  builder: { border: '1px dashed var(--border)', borderRadius: 8, padding: 10, marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 } as CSSProperties,
  builderTitle: { fontSize: 12, fontWeight: 600, color: 'var(--muted)' } as CSSProperties,
  lineForm: { display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' } as CSSProperties,
  form: { display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginTop: 4 } as CSSProperties,
  input: { flex: '1 1 200px', minWidth: 140, padding: '6px 9px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--panel-2)', color: 'var(--text)', fontSize: 12.5 } as CSSProperties,
  qtyIn: { flex: '0 1 90px', width: 90, padding: '5px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--panel-2)', color: 'var(--text)', fontSize: 12 } as CSSProperties,
  btn: { fontSize: 12, padding: '5px 11px', borderRadius: 6, border: '1px solid var(--text)', background: 'var(--text)', color: 'var(--panel)', cursor: 'pointer' } as CSSProperties,
  btnAccent: { fontSize: 12, padding: '6px 12px', borderRadius: 6, border: '1px solid var(--accent)', background: 'var(--accent)', color: '#fff', cursor: 'pointer', alignSelf: 'flex-start' } as CSSProperties,
  btnGhost: { fontSize: 12, padding: '5px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text)', cursor: 'pointer' } as CSSProperties,
  // Editable draft basis (D1) + unknown-quantity surfacing (D2/D3).
  warnLine: { fontSize: 12, color: 'var(--warn)', margin: '6px 0 0' } as CSSProperties,
  unknown: { color: 'var(--warn)', fontWeight: 600 } as CSSProperties,
  editedTag: { fontSize: 10, marginLeft: 6, color: 'var(--muted)', border: '1px solid var(--border)', borderRadius: 4, padding: '0 4px' } as CSSProperties,
  editBox: { marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 } as CSSProperties,
  editRow: { display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' } as CSSProperties,
  editActions: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginTop: 2 } as CSSProperties,
  inputWide: { flex: '1 1 220px', minWidth: 160, fontSize: 12.5, padding: '5px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--panel)', color: 'var(--text)' } as CSSProperties,
  inputQty: { width: 150, fontSize: 12.5, padding: '5px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--panel)', color: 'var(--text)' } as CSSProperties,
  inputUnit: { width: 70, fontSize: 12.5, padding: '5px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--panel)', color: 'var(--text)' } as CSSProperties,
  linkBtn: { background: 'none', border: 'none', padding: 0, color: 'var(--muted)', fontSize: 11.5, textDecoration: 'underline', cursor: 'pointer' } as CSSProperties,
  quoteLink: { color: 'var(--accent)', textDecoration: 'none', fontSize: 12.5, fontWeight: 600, marginLeft: 'auto' } as CSSProperties,
  err: { color: 'var(--bad)', fontSize: 12.5, margin: '10px 0 0', padding: '8px 10px', borderRadius: 6, border: '1px solid color-mix(in srgb, var(--bad) 40%, var(--border))', background: 'color-mix(in srgb, var(--bad) 8%, transparent)' } as CSSProperties,
  empty: { color: 'var(--muted)', fontSize: 13, margin: '0 0 8px' } as CSSProperties,
};

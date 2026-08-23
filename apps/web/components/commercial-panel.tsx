'use client';

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';

// Commercial (Pre-Award) — the ONE UI over a direct deal's Pre-Award package aggregate:
//   Scope basis → Estimate revision → Pricing sheet → Quotation.
// Every readiness gate and every button's enabled/disabled state is derived from the server's
// governance facts (GET .../pre-award-package). The panel holds NO readiness state of its own; it
// re-fetches after each command. The backend is the final enforcement — the UI only mirrors it.

interface Governance { governed: boolean; packageId: string | null; scopeApproved: boolean; estimateApproved: boolean; pricingFrozen: boolean }
interface Pkg { id: string; route: string; status: string }
interface BasisLine { lineId: string; description: string; unit: string; quantity: number; sourceLineId: string }
interface Basis { id: string; revisionNo: number; status: string; sourceId: string; lines: BasisLine[]; approvedAt: string | null }
interface EstimateTotals { totalDirectCost?: number; totalSellingValue?: number; marginPercent?: number; lineCount?: number }
interface Estimate { id: string; revisionNo: number; status: string; basisRevisionId: string; totals: EstimateTotals; frozenAt: string | null; approvedAt: string | null }
interface PricingSheet { id: string; version: number; status: string; estimateRevisionId: string | null; totals: { totalCost: number; totalSell: number; marginPercent: number }; frozenAt: string | null; quotationId: string | null }
interface QuotationLite { id: string; quoteNumber: string; status: string; total: number }
interface Deal { executionType: string; tenderId: string | null; stage: string }
interface Aggregate { package: Pkg | null; basis: Basis[]; estimates: Estimate[]; pricing: PricingSheet[]; governance: Governance; quotations: QuotationLite[]; deal: Deal }

interface ScopeLineForm { description: string; unit: string; quantity: string }
interface BuildUpForm { unitCost: string; overheadPercent: string; profitPercent: string }

const aed = (n: number | undefined): string => (Number(n) || 0).toLocaleString(undefined, { maximumFractionDigits: 0 });
const blankScopeLine = (): ScopeLineForm => ({ description: '', unit: 'no', quantity: '' });

export default function CommercialPanel({ opportunityId }: { opportunityId: string }) {
  const [agg, setAgg] = useState<Aggregate | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [scopeLines, setScopeLines] = useState<ScopeLineForm[]>([blankScopeLine()]);
  const [buildUps, setBuildUps] = useState<Record<string, BuildUpForm>>({});

  const base = `/api/crm/opportunities/${opportunityId}`;
  const load = useCallback(async () => {
    const res = await fetch(`${base}/pre-award-package`, { cache: 'no-store' });
    if (res.ok) setAgg(await res.json());
    else setAgg(null);
  }, [base]);
  useEffect(() => { void load(); }, [load]);

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
      await load();
      return true;
    } finally { setBusy(false); }
  }, [base, load]);

  const g = agg?.governance;
  const approvedBasis = useMemo(() => agg?.basis.find((b) => b.status === 'approved') ?? null, [agg]);

  const createBasis = async () => {
    const lines = scopeLines
      .filter((l) => l.description.trim() && Number(l.quantity) > 0)
      .map((l, i) => ({ lineId: `L${i + 1}`, description: l.description, unit: l.unit || 'no', quantity: Number(l.quantity), sourceLineId: `S${i + 1}` }));
    if (lines.length === 0) return;
    if (await cmd('/pre-award-package/scope', { sourceId: `scope-${Date.now()}`, lines })) setScopeLines([blankScopeLine()]);
  };

  const createEstimate = async () => {
    if (!approvedBasis) return;
    const lines = approvedBasis.lines.map((l) => ({ lineId: l.lineId, description: l.description, unit: l.unit, quantity: l.quantity, sourceLineId: l.sourceLineId }));
    const ups = approvedBasis.lines.map((l) => {
      const f = buildUps[l.lineId] ?? { unitCost: '', overheadPercent: '', profitPercent: '' };
      return {
        basisLineId: l.lineId,
        components: [{ costType: 'material', description: l.description, quantity: 1, unitCost: Number(f.unitCost) || 0 }],
        overheadPercent: Number(f.overheadPercent) || 0,
        profitPercent: Number(f.profitPercent) || 0,
      };
    });
    if (await cmd('/pre-award-package/estimate', { basisRevisionId: approvedBasis.id, lines, buildUps: ups })) setBuildUps({});
  };

  if (!agg) return <section style={st.panel}><p style={st.empty}>Loading commercial workspace…</p></section>;

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
            {agg.basis.map((b) => (
              <div key={b.id} style={st.card}>
                <div style={st.cardHead}>
                  <span style={st.name}>Basis B-{String(b.revisionNo).padStart(3, '0')}</span>
                  <StatusTag status={b.status} />
                  <span style={st.meta}>{b.lines.length} line(s)</span>
                  {b.status === 'draft' && <button style={st.btn} disabled={busy} onClick={() => void cmd(`/pre-award-package/scope/${b.id}/approve`)}>Approve scope ✓</button>}
                </div>
                {b.lines.length > 0 && (
                  <ul style={st.lineList}>{b.lines.map((l) => (<li key={l.lineId} style={st.lineRow}><span>{l.description}</span><span style={st.meta}>{l.quantity} {l.unit}</span></li>))}</ul>
                )}
              </div>
            ))}
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

          {/* ── Estimate ── */}
          <div style={st.block}>
            <h3 style={st.h3}>2 · Estimate {g.estimateApproved && <span style={st.done}>approved ✓</span>}</h3>
            {agg.estimates.map((e) => (
              <div key={e.id} style={st.card}>
                <div style={st.cardHead}>
                  <span style={st.name}>Estimate E-{String(e.revisionNo).padStart(3, '0')}</span>
                  <StatusTag status={e.status} />
                  <span style={st.meta}>{e.totals.lineCount ?? 0} line(s) · cost AED {aed(e.totals.totalDirectCost)} · sell AED {aed(e.totals.totalSellingValue)} · {Number(e.totals.marginPercent) || 0}%</span>
                  {e.status === 'draft' && <button style={st.btn} disabled={busy} onClick={() => void cmd(`/pre-award-package/estimate/${e.id}/freeze`)}>Freeze</button>}
                  {e.status === 'frozen' && <button style={st.btn} disabled={busy} onClick={() => void cmd(`/pre-award-package/estimate/${e.id}/approve`)}>Approve ✓</button>}
                </div>
              </div>
            ))}
            {!g.scopeApproved && <p style={st.empty}>Approve a scope basis first — the estimate is built on it.</p>}
            {g.scopeApproved && approvedBasis && (
              <div style={st.builder}>
                <div style={st.builderTitle}>New estimate revision (E-{String(agg.estimates.length + 1).padStart(3, '0')}) on B-{String(approvedBasis.revisionNo).padStart(3, '0')}</div>
                {approvedBasis.lines.map((l) => {
                  const f = buildUps[l.lineId] ?? { unitCost: '', overheadPercent: '', profitPercent: '' };
                  const set = (patch: Partial<BuildUpForm>) => setBuildUps({ ...buildUps, [l.lineId]: { ...f, ...patch } });
                  return (
                    <div key={l.lineId} style={st.lineForm}>
                      <span style={{ ...st.name, flex: '1 1 160px' }}>{l.description} <span style={st.meta}>× {l.quantity} {l.unit}</span></span>
                      <input style={st.qtyIn} type="number" placeholder="Unit cost" value={f.unitCost} onChange={(e) => set({ unitCost: e.target.value })} />
                      <input style={st.qtyIn} type="number" placeholder="OH %" value={f.overheadPercent} onChange={(e) => set({ overheadPercent: e.target.value })} />
                      <input style={st.qtyIn} type="number" placeholder="Profit %" value={f.profitPercent} onChange={(e) => set({ profitPercent: e.target.value })} />
                    </div>
                  );
                })}
                <div style={st.form}>
                  <button style={st.btn} disabled={busy} onClick={() => void createEstimate()}>Create estimate revision (draft)</button>
                </div>
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
  quoteLink: { color: 'var(--accent)', textDecoration: 'none', fontSize: 12.5, fontWeight: 600, marginLeft: 'auto' } as CSSProperties,
  err: { color: 'var(--bad)', fontSize: 12.5, margin: '10px 0 0', padding: '8px 10px', borderRadius: 6, border: '1px solid color-mix(in srgb, var(--bad) 40%, var(--border))', background: 'color-mix(in srgb, var(--bad) 8%, transparent)' } as CSSProperties,
  empty: { color: 'var(--muted)', fontSize: 13, margin: '0 0 8px' } as CSSProperties,
};

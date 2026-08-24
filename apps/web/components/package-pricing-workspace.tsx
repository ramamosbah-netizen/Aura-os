'use client';

import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';

// Package Pricing Workspace (Slice 7B) — the commercial decision on a Pre-Award package, opened in its
// own tab after the estimate is approved. The estimated cost is a READ-ONLY baseline from the approved
// estimate; the only thing decided here is the selling price. Every number in the live preview comes
// from the backend engine (computeCommercialPricing), never from a formula in React — margin% and
// markup% are always shown together so the two can never be confused.
//
// (Distinct from components/pricing-workspace.tsx, which is the per-line quotation pricing surface.)

interface SellingFigures {
  estimatedCost: number; pricingMethod: 'target_margin' | 'markup'; inputPercent: number;
  markupPercent: number; marginPercent: number; grossProfit: number;
  preDiscountSell: number; discount: number; sellingPrice: number;
}
interface CommercialDecision {
  baselineCost: number; estimateRevisionId: string;
  policy: { method: 'target_margin' | 'markup'; percent: number } | null;
  discount: { kind: 'percent' | 'amount'; value: number } | null;
  figures: SellingFigures | null;
}
interface Sheet { id: string; version: number; status: 'draft' | 'frozen'; quotationId: string | null; totals: { totalCost: number; totalSell: number; marginPercent: number }; commercial: CommercialDecision | null }
export interface PricingView { sheet: Sheet; baselineCost: number; editable: boolean }

const aed = (n: number | undefined): string => (Number(n) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pct = (n: number | undefined): string => `${(Number(n) || 0).toFixed(2)}%`;

export default function PackagePricingWorkspace({ opportunityId, initial }: { opportunityId: string; initial: PricingView }) {
  const [view, setView] = useState<PricingView>(initial);
  const s = view.sheet;
  const c = s.commercial;
  const editable = view.editable;

  const [method, setMethod] = useState<'target_margin' | 'markup'>(c?.policy?.method ?? 'target_margin');
  const [percent, setPercent] = useState<string>(c?.policy ? String(c.policy.percent) : '15');
  const [discountKind, setDiscountKind] = useState<'none' | 'percent' | 'amount'>(c?.discount ? c.discount.kind : 'none');
  const [discountValue, setDiscountValue] = useState<string>(c?.discount ? String(c.discount.value) : '');
  const [figures, setFigures] = useState<SellingFigures | null>(c?.figures ?? null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const base = `/api/crm/opportunities/${opportunityId}/pre-award-package/pricing`;

  const policyBody = useCallback(() => ({
    method, percent: Number(percent) || 0,
    ...(discountKind !== 'none' ? { discountKind, discountValue: Number(discountValue) || 0 } : {}),
  }), [method, percent, discountKind, discountValue]);

  // Live preview — the numbers come from the engine on every change (debounced), never from React.
  const previewTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!editable) return;
    if (previewTimer.current) clearTimeout(previewTimer.current);
    previewTimer.current = setTimeout(async () => {
      setErr(null);
      try {
        const res = await fetch(`${base}/preview`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(policyBody()) });
        if (res.ok) { const j = await res.json(); setFigures(j.figures as SellingFigures); }
      } catch { /* preview is best-effort */ }
    }, 250);
    return () => { if (previewTimer.current) clearTimeout(previewTimer.current); };
  }, [base, editable, policyBody]);

  const reload = useCallback(async () => {
    const res = await fetch(`${base}/${s.id}`, { cache: 'no-store' });
    if (res.ok) { const v: PricingView = await res.json(); setView(v); setFigures(v.sheet.commercial?.figures ?? null); }
  }, [base, s.id]);

  const savePolicy = useCallback(async (): Promise<boolean> => {
    setBusy(true); setErr(null);
    try {
      const res = await fetch(`${base}/${s.id}/policy`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(policyBody()) });
      if (!res.ok) { const j = await res.json().catch(() => ({})); setErr(typeof j?.message === 'string' ? j.message : `Save failed (${res.status})`); return false; }
      await reload();
      return true;
    } finally { setBusy(false); }
  }, [base, s.id, policyBody, reload]);

  const freeze = useCallback(async () => {
    // Persist the policy first so the frozen sheet carries exactly the decision on screen, then commit.
    if (!(await savePolicy())) return;
    setBusy(true); setErr(null);
    try {
      const res = await fetch(`${base}/${s.id}/freeze`, { method: 'POST' });
      if (!res.ok) { const j = await res.json().catch(() => ({})); setErr(typeof j?.message === 'string' ? j.message : `Freeze failed (${res.status})`); return; }
      await reload();
    } finally { setBusy(false); }
  }, [base, s.id, savePolicy, reload]);

  const generateQuotation = useCallback(async () => {
    setBusy(true); setErr(null);
    try {
      const res = await fetch(`/api/crm/opportunities/${opportunityId}/convert-to-quotation`, { method: 'POST' });
      if (!res.ok) { const j = await res.json().catch(() => ({})); setErr(typeof j?.message === 'string' ? j.message : `Quotation failed (${res.status})`); return; }
      const q = await res.json();
      window.location.href = `/crm/quotations/${q.id}`;
    } finally { setBusy(false); }
  }, [opportunityId]);

  const newRevision = useCallback(async () => {
    setBusy(true); setErr(null);
    try {
      const res = await fetch(`${base}/revision`, { method: 'POST' });
      if (!res.ok) { const j = await res.json().catch(() => ({})); setErr(typeof j?.message === 'string' ? j.message : `Could not open a revision (${res.status})`); return; }
      const next = await res.json();
      window.location.href = `/crm/opportunities/${opportunityId}/pre-award/pricing/${next.id}`;
    } finally { setBusy(false); }
  }, [base, opportunityId]);

  const f = figures;

  return (
    <div style={st.wrap}>
      <header style={st.head}>
        <div>
          <div style={st.crumb}>Pricing Workspace</div>
          <h1 style={st.h1}>Pricing P-{String(s.version).padStart(3, '0')}</h1>
        </div>
        <div style={st.headRight}>
          <StatusTag status={s.status} />
          <span style={st.sellChip}>Selling price <b>AED {aed(f?.sellingPrice ?? s.totals.totalSell)}</b></span>
        </div>
      </header>

      <p style={st.note}>The estimated cost is fixed by the approved estimate and read-only here. This is the commercial decision: what we sell it for.</p>
      {err && <p style={st.err}>{err}</p>}
      {!editable && <p style={st.frozenBanner}>This pricing is <b>{s.status}</b> and read-only. To change the price, open a new revision.</p>}

      <section style={st.grid}>
        {/* LEFT — the decision */}
        <div style={st.card}>
          <h2 style={st.h2}>Commercial decision</h2>

          <div style={st.field}>
            <span style={st.label}>Method</span>
            <div style={st.methodRow}>
              <button style={method === 'target_margin' ? st.segOn : st.seg} disabled={!editable} onClick={() => setMethod('target_margin')}>Target margin</button>
              <button style={method === 'markup' ? st.segOn : st.seg} disabled={!editable} onClick={() => setMethod('markup')}>Markup</button>
            </div>
            <span style={st.hint}>{method === 'target_margin' ? 'Margin on the selling price: sell = cost / (1 − margin%).' : 'Markup on cost: sell = cost × (1 + markup%).'}</span>
          </div>

          <label style={st.field}>
            <span style={st.label}>{method === 'target_margin' ? 'Target margin %' : 'Markup %'}</span>
            <input style={st.input} type="number" value={percent} disabled={!editable} onChange={(e) => setPercent(e.target.value)} />
          </label>

          <div style={st.field}>
            <span style={st.label}>Discount / adjustment</span>
            <div style={st.methodRow}>
              <button style={discountKind === 'none' ? st.segOn : st.seg} disabled={!editable} onClick={() => setDiscountKind('none')}>None</button>
              <button style={discountKind === 'percent' ? st.segOn : st.seg} disabled={!editable} onClick={() => setDiscountKind('percent')}>%</button>
              <button style={discountKind === 'amount' ? st.segOn : st.seg} disabled={!editable} onClick={() => setDiscountKind('amount')}>AED</button>
            </div>
            {discountKind !== 'none' && (
              <input style={st.input} type="number" value={discountValue} disabled={!editable} placeholder={discountKind === 'percent' ? 'discount %' : 'discount AED'} onChange={(e) => setDiscountValue(e.target.value)} />
            )}
          </div>
        </div>

        {/* RIGHT — the live preview, straight from the engine */}
        <div style={st.card}>
          <h2 style={st.h2}>Live preview</h2>
          <Row k="Estimated cost (baseline)" v={`AED ${aed(view.baselineCost)}`} />
          <Row k={method === 'target_margin' ? `Target margin ${pct(Number(percent))}` : `Markup ${pct(Number(percent))}`} v={`AED ${aed(f?.grossProfit)}`} />
          <Row k="Gross selling price" v={`AED ${aed(f?.preDiscountSell)}`} />
          {discountKind !== 'none' && <Row k="Less discount" v={`− AED ${aed(f?.discount)}`} />}
          <div style={st.finalRow}><span>Final selling price</span><b>AED {aed(f?.sellingPrice)}</b></div>
          {/* BOTH figures, always — never a bare "%". */}
          <div style={st.bothRow}>
            <span style={st.bothChip}>Realised margin <b>{pct(f?.marginPercent)}</b></span>
            <span style={st.bothChip}>Realised markup <b>{pct(f?.markupPercent)}</b></span>
            <span style={st.bothChip}>Gross profit <b>AED {aed(f?.grossProfit)}</b></span>
          </div>
        </div>
      </section>

      <footer style={st.footer}>
        {editable && <button style={st.btn} disabled={busy} onClick={() => void savePolicy()}>Save draft</button>}
        {editable && <button style={st.btnAccent} disabled={busy} onClick={() => void freeze()}>Freeze pricing</button>}
        {s.status === 'frozen' && !s.quotationId && <button style={st.btnAccent} disabled={busy} onClick={() => void generateQuotation()}>Generate quotation →</button>}
        {s.status === 'frozen' && s.quotationId && <a style={st.btnAccent} href={`/crm/quotations/${s.quotationId}`}>Open quotation →</a>}
        {s.status === 'frozen' && <button style={st.btn} disabled={busy} onClick={() => void newRevision()}>New pricing revision</button>}
        <a style={st.btnGhost} href={`/crm/opportunities/${opportunityId}`}>← Back to Commercial</a>
      </footer>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return <div style={st.row}><span>{k}</span><span>{v}</span></div>;
}
function StatusTag({ status }: { status: string }) {
  const tone = status === 'frozen' ? 'var(--good)' : 'var(--muted)';
  return <span style={{ ...st.status, color: tone, borderColor: tone }}>{status}</span>;
}

const st = {
  wrap: { maxWidth: 980, margin: '0 auto', padding: 24 } as CSSProperties,
  head: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, borderBottom: '1px solid var(--border)', paddingBottom: 12 } as CSSProperties,
  crumb: { fontSize: 12, color: 'var(--muted)' } as CSSProperties,
  h1: { fontSize: 22, margin: '2px 0 0' } as CSSProperties,
  headRight: { display: 'flex', gap: 10, alignItems: 'center' } as CSSProperties,
  sellChip: { fontSize: 13, background: 'var(--panel-2)', border: '1px solid var(--border)', borderRadius: 8, padding: '6px 10px' } as CSSProperties,
  note: { fontSize: 12.5, color: 'var(--muted)', margin: '10px 0' } as CSSProperties,
  err: { color: 'var(--bad)', fontSize: 13, margin: '8px 0' } as CSSProperties,
  frozenBanner: { fontSize: 13, background: 'var(--panel-2)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px' } as CSSProperties,
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 14, marginTop: 8 } as CSSProperties,
  card: { border: '1px solid var(--border)', borderRadius: 10, padding: 16, background: 'var(--panel)' } as CSSProperties,
  h2: { fontSize: 15, margin: '0 0 12px' } as CSSProperties,
  field: { display: 'flex', flexDirection: 'column', gap: 5, marginBottom: 14 } as CSSProperties,
  label: { fontSize: 12, fontWeight: 600, color: 'var(--muted)' } as CSSProperties,
  hint: { fontSize: 11.5, color: 'var(--muted)' } as CSSProperties,
  methodRow: { display: 'flex', gap: 6 } as CSSProperties,
  seg: { fontSize: 12.5, padding: '6px 12px', borderRadius: 6, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text)', cursor: 'pointer' } as CSSProperties,
  segOn: { fontSize: 12.5, padding: '6px 12px', borderRadius: 6, border: '1px solid var(--text)', background: 'var(--text)', color: 'var(--panel)', cursor: 'pointer' } as CSSProperties,
  input: { fontSize: 14, padding: '7px 9px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--panel-2)', color: 'var(--text)' } as CSSProperties,
  row: { display: 'flex', justifyContent: 'space-between', fontSize: 13.5, padding: '5px 0', color: 'var(--muted)' } as CSSProperties,
  finalRow: { display: 'flex', justifyContent: 'space-between', fontSize: 17, fontWeight: 700, padding: '10px 0 4px', borderTop: '1px solid var(--border)', marginTop: 6 } as CSSProperties,
  bothRow: { display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 } as CSSProperties,
  bothChip: { fontSize: 12, background: 'var(--panel-2)', border: '1px solid var(--border)', borderRadius: 8, padding: '5px 9px' } as CSSProperties,
  footer: { display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginTop: 18 } as CSSProperties,
  btn: { fontSize: 13, padding: '8px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text)', cursor: 'pointer' } as CSSProperties,
  btnAccent: { fontSize: 13, padding: '8px 14px', borderRadius: 8, border: '1px solid var(--text)', background: 'var(--text)', color: 'var(--panel)', cursor: 'pointer', textDecoration: 'none' } as CSSProperties,
  btnGhost: { fontSize: 13, padding: '8px 14px', borderRadius: 8, border: 'none', background: 'transparent', color: 'var(--muted)', cursor: 'pointer', textDecoration: 'none' } as CSSProperties,
  status: { fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4, border: '1px solid', borderRadius: 6, padding: '2px 8px' } as CSSProperties,
};

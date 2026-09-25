'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { announcePricingChanged, onPricingChanged } from '@/lib/tender-pricing-events';

// SUPPLY SOURCING for a tender — the estimator's half of the real three-quotation path.
//
//   1. PUT TO SUPPLIERS. Each BOQ item is mapped BY A PERSON to one material-master record of the
//      same unit. Nothing is matched from the description: the pricing requisition this raises prices
//      the bid and buys nothing, and the buyer runs the RFQ from it in Procurement.
//   2. COVERAGE. Per item, which suppliers COUNT — independent, on a confirmed live revision, judged
//      eligible, commercially comparable — and which do not, with the reason. The offer's
//      "three supplier quotations" requirement is this answer; it cannot be typed in.
//   3. USE A SUPPLIER'S PRICE. A counted offer can price the item's material component. The figure is
//      the governed comparison's, taken by the server from the line id — never a number sent from here.

interface BoqItem { id: string; itemCode: string; description: string; unit: string; quantity: number }
interface CostComponent { id?: string; costType: string; description: string; unitCost: number }
interface BuildUp { id: string; boqItemId: string; components: CostComponent[] }
interface PricingPayload { items: BoqItem[]; buildUps: Record<string, BuildUp>; locked: boolean }
interface Requisition { id: string; title: string; reference: string | null; status: string }
interface RequisitionLine { id: string; materialCode: string; materialName: string; uom: string; quantity: number; sourceBoqItemId: string | null; materialMappedBy: string | null }
interface PricingRequisition { requisition: Requisition; lines: RequisitionLine[] }
interface Material { id: string; code: string; name: string; uom: string; status: string }
interface QualifyingOffer { supplierName: string; revisionId: string; quotationLineId: string; unitValue: number; currency: string }
interface RequirementCoverage { prLineId: string; materialCode: string; qualifying: QualifyingOffer[]; excluded: Array<{ supplierName: string; reason: string }>; covered: boolean }
interface ItemCoverage { boqItemId: string; itemCode: string; description: string; requiredBecause: string; requirements: RequirementCoverage[]; covered: boolean; gap: string | null }
interface Coverage { comparisonDate: string; baseCurrency: string; independentSuppliersRequired: number; items: ItemCoverage[]; covered: boolean }
interface Source { buildUpId: string; componentId: string; boqItemId: string; supplierName: string; sourcedUnitCost: number; stale: boolean; governed: { quotationLineId: string; currency: string; comparisonDate: string } | null }

const unitOf = (value: string | null | undefined): string => (value ?? '').trim().toLowerCase();
const money = (n: number): string => new Intl.NumberFormat('en-AE', { maximumFractionDigits: 2 }).format(n);

async function readJson<T>(res: Response): Promise<T | null> {
  return res.ok ? ((await res.json().catch(() => null)) as T | null) : null;
}

export default function TenderSupplySourcing({ tenderId }: { tenderId: string }) {
  const [pricing, setPricing] = useState<PricingPayload | null>(null);
  const [requisitions, setRequisitions] = useState<PricingRequisition[]>([]);
  const [coverage, setCoverage] = useState<Coverage | null>(null);
  const [coverageError, setCoverageError] = useState<string | null>(null);
  const [sources, setSources] = useState<Source[]>([]);
  const [materials, setMaterials] = useState<Material[] | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    const [p, r, c, s] = await Promise.all([
      fetch(`/api/tendering/tenders/${tenderId}/pricing`, { cache: 'no-store' }),
      fetch(`/api/tendering/tenders/${tenderId}/pricing-requisitions`, { cache: 'no-store' }),
      fetch(`/api/tendering/tenders/${tenderId}/supply-coverage`, { cache: 'no-store' }),
      fetch(`/api/tendering/tenders/${tenderId}/pricing/sources`, { cache: 'no-store' }),
    ]);
    setPricing(await readJson<PricingPayload>(p));
    setRequisitions((await readJson<PricingRequisition[]>(r)) ?? []);
    if (c.ok) {
      setCoverage(await c.json());
      setCoverageError(null);
    } else {
      const body = await c.json().catch(() => ({}));
      setCoverage(null);
      setCoverageError(body.message ?? body.error ?? 'Supply coverage is unavailable.');
    }
    setSources((await readJson<Source[]>(s)) ?? []);
  }, [tenderId]);

  useEffect(() => {
    void load();
    return onPricingChanged(tenderId, () => void load());
  }, [load, tenderId]);

  /** BOQ items already put to suppliers, by item — a mapping is made once and not edited here. */
  const mapped = useMemo(() => {
    const byItem = new Map<string, RequisitionLine[]>();
    for (const { lines } of requisitions) {
      for (const line of lines) {
        if (!line.sourceBoqItemId) continue;
        byItem.set(line.sourceBoqItemId, [...(byItem.get(line.sourceBoqItemId) ?? []), line]);
      }
    }
    return byItem;
  }, [requisitions]);

  const unmapped = (pricing?.items ?? []).filter((item) => !mapped.has(item.id));

  async function loadMaterials(): Promise<void> {
    if (materials) return;
    const res = await fetch('/api/inventory/materials', { cache: 'no-store' });
    const list = await readJson<Material[] | { items: Material[] }>(res);
    setMaterials(Array.isArray(list) ? list : list?.items ?? []);
  }

  async function putToSuppliers(): Promise<void> {
    const lines = Object.entries(mapping).filter(([, materialId]) => materialId).map(([boqItemId, materialId]) => ({ boqItemId, materialId }));
    if (lines.length === 0) return;
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      const res = await fetch(`/api/tendering/tenders/${tenderId}/pricing-requisitions`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ lines }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) { setErr(body.message ?? body.error ?? `The supply scope could not be put to suppliers (HTTP ${res.status}).`); return; }
      setMapping({});
      setMsg(`${lines.length} item${lines.length === 1 ? '' : 's'} put to suppliers on ${body.requisition?.reference ?? body.requisition?.title ?? 'a pricing requisition'} — the buyer raises the RFQ from it in Procurement. It prices this bid and buys nothing.`);
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function useOffer(item: ItemCoverage, offer: QualifyingOffer): Promise<void> {
    const buildUp = pricing?.buildUps[item.boqItemId];
    const component = buildUp?.components.find((c) => c.costType === 'material' && c.id);
    if (!buildUp || !component?.id) return;
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      const res = await fetch(`/api/tendering/tenders/${tenderId}/pricing/buildups/${buildUp.id}/components/${component.id}/source`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ quotationLineId: offer.quotationLineId, comparisonDate: coverage?.comparisonDate }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) { setErr(body.message ?? body.error ?? `That supplier price could not be used (HTTP ${res.status}).`); return; }
      setMsg(`${item.itemCode} supply priced from ${offer.supplierName} at ${money(offer.unitValue)} ${offer.currency} — the comparison's figure on ${coverage?.comparisonDate}.`);
      announcePricingChanged(tenderId);
      await load();
    } finally {
      setBusy(false);
    }
  }

  if (!pricing) return null;
  const locked = pricing.locked;
  const covered = coverage?.items.filter((i) => i.covered).length ?? 0;

  return (
    <section id="supply-coverage" style={st.wrap} data-testid="supply-sourcing">
      <h2 style={st.h2}>Supply prices from suppliers</h2>
      <p style={st.sub}>
        Supplier prices for this bid come from real supplier quotations: each BOQ item is put to suppliers against one material,
        answered on confirmed revisions, judged by the Technical Manager and compared commercially. The offer&apos;s
        &ldquo;three supplier quotations&rdquo; requirement is counted from here — per item, three independent suppliers.
      </p>
      {err && <div style={st.err} role="alert">{err}</div>}
      {msg && <div style={st.ok}>{msg}</div>}
      {locked && <div style={st.note}>The pricing sheet is locked by a committed offer — supply prices can be read, not changed.</div>}

      {/* ── 1. Put to suppliers ─────────────────────────────────────────────────────────────── */}
      <h3 style={st.h3}>1 · Put the supply scope to suppliers</h3>
      {requisitions.length > 0 && (
        <ul style={st.list}>
          {requisitions.map(({ requisition, lines }) => (
            <li key={requisition.id} style={st.listRow} data-testid={`pricing-requisition-${requisition.id}`}>
              <b>{requisition.reference ?? requisition.title}</b> · {lines.length} line{lines.length === 1 ? '' : 's'} · prices this bid, buys nothing ·{' '}
              <a href={`/procurement/purchase-requests?record=${requisition.id}`} style={st.link}>open in Procurement →</a>
            </li>
          ))}
        </ul>
      )}
      {unmapped.length === 0 ? (
        <p style={st.muted}>Every BOQ item has been put to suppliers.</p>
      ) : (
        <div style={st.tableWrap}>
          <table style={st.table}>
            <thead>
              <tr><th style={st.th}>Item</th><th style={st.th}>Description</th><th style={st.th}>Qty</th><th style={st.th}>Material (same unit — chosen by you)</th></tr>
            </thead>
            <tbody>
              {unmapped.map((item) => {
                const options = (materials ?? []).filter((m) => m.status !== 'obsolete' && unitOf(m.uom) === unitOf(item.unit));
                return (
                  <tr key={item.id}>
                    <td style={st.td}>{item.itemCode}</td>
                    <td style={st.td}>{item.description}</td>
                    <td style={st.td}>{item.quantity} {item.unit}</td>
                    <td style={st.td}>
                      <select
                        value={mapping[item.id] ?? ''}
                        onFocus={() => void loadMaterials()}
                        onMouseDown={() => void loadMaterials()}
                        onChange={(e) => setMapping((prev) => ({ ...prev, [item.id]: e.target.value }))}
                        disabled={busy || locked}
                        style={st.select}
                        data-testid={`map-material-${item.id}`}
                        aria-label={`Material for ${item.itemCode}`}
                      >
                        <option value="">— not put to suppliers —</option>
                        {options.map((m) => <option key={m.id} value={m.id}>{m.code} · {m.name}</option>)}
                      </select>
                      {materials && options.length === 0 && <span style={st.warn}> no active material in {item.unit}</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {unmapped.length > 0 && (
        <button
          type="button"
          style={st.btnPrimary}
          disabled={busy || locked || !Object.values(mapping).some(Boolean)}
          onClick={() => void putToSuppliers()}
          data-testid="put-to-suppliers"
        >
          Put {Object.values(mapping).filter(Boolean).length || ''} item{Object.values(mapping).filter(Boolean).length === 1 ? '' : 's'} to suppliers
        </button>
      )}

      {/* ── 2. Coverage, 3. Use a price ─────────────────────────────────────────────────────── */}
      <h3 style={st.h3}>2 · Coverage and supply prices</h3>
      {coverageError && <p style={st.err}>{coverageError}</p>}
      {coverage && (
        <>
          <p style={{ ...st.verdict, color: coverage.covered ? 'var(--good)' : 'var(--bad)' }} data-testid="coverage-verdict">
            {coverage.covered ? 'Supply scope covered' : 'Supply scope NOT covered'} — {covered} of {coverage.items.length} supply item{coverage.items.length === 1 ? '' : 's'} have{' '}
            {coverage.independentSuppliersRequired} independent suppliers that count · compared {coverage.comparisonDate} in {coverage.baseCurrency}
          </p>
          <div style={st.items}>
            {coverage.items.map((item) => {
              const buildUp = pricing.buildUps[item.boqItemId];
              const material = buildUp?.components.find((c) => c.costType === 'material' && c.id);
              const source = material ? sources.find((s) => s.buildUpId === buildUp!.id && s.componentId === material.id) : undefined;
              return (
                <div key={item.boqItemId} style={st.item} data-testid={`coverage-item-${item.boqItemId}`}>
                  <div style={st.itemHead}>
                    <span style={{ ...st.pill, color: item.covered ? 'var(--good)' : 'var(--bad)', borderColor: 'currentColor' }}>
                      {item.covered ? 'covered' : 'not covered'}
                    </span>
                    <b>{item.itemCode}</b> {item.description}
                  </div>
                  {item.gap && <p style={st.gap}>{item.gap}</p>}
                  {!buildUp && <p style={st.muted}>Not built up yet — its supply content is unknown, so it needs supplier prices too. Price it on the sheet above to take one.</p>}
                  {source && (
                    <p style={source.stale ? st.warnLine : st.sourced} data-testid={`sourced-${item.boqItemId}`}>
                      Supply priced from {source.supplierName} at {money(source.sourcedUnitCost)} {source.governed?.currency ?? ''}
                      {source.governed ? ` (compared ${source.governed.comparisonDate})` : ''}
                      {source.stale ? ' — the supplier’s offer has moved since; take it again or choose another' : ''}
                    </p>
                  )}
                  {item.requirements.map((req) => (
                    <div key={req.prLineId} style={st.req}>
                      <div style={st.reqHead}>
                        {req.materialCode} — {req.qualifying.length} of {coverage.independentSuppliersRequired} count ·{' '}
                        {/* Procurement's own comparison of this requirement — the authority the counts come from. */}
                        <a href={`/procurement/requirements/${req.prLineId}/comparison`} style={st.link} data-testid={`comparison-${req.prLineId}`}>comparison</a>
                        {' · '}
                        <a href={`/api/procurement/requirements/${req.prLineId}/comparison.pdf`} style={st.link} data-testid={`comparison-pdf-${req.prLineId}`}>sheet (PDF)</a>
                      </div>
                      <ul style={st.offers}>
                        {req.qualifying.map((offer) => {
                          const inUse = source?.governed?.quotationLineId === offer.quotationLineId;
                          return (
                            <li key={offer.quotationLineId} style={st.offer}>
                              <span>✔ {offer.supplierName} — {money(offer.unitValue)} {offer.currency}</span>
                              {material && !locked && (
                                <button
                                  type="button"
                                  style={inUse ? st.btnDone : st.btnGhost}
                                  disabled={busy || inUse}
                                  onClick={() => void useOffer(item, offer)}
                                  data-testid={`use-offer-${offer.quotationLineId}`}
                                >
                                  {inUse ? 'in use' : 'Use this price'}
                                </button>
                              )}
                            </li>
                          );
                        })}
                        {req.excluded.map((x, i) => (
                          <li key={`x-${i}`} style={st.excluded}>✖ {x.supplierName} — {x.reason}</li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}

const st = {
  wrap: { marginTop: 22, padding: '18px 20px', border: '1px solid var(--border)', borderRadius: 14, background: 'var(--panel)' } as CSSProperties,
  h2: { margin: '0 0 6px', fontSize: 17 } as CSSProperties,
  h3: { margin: '18px 0 8px', fontSize: 13, textTransform: 'uppercase', letterSpacing: 0.6, color: 'var(--muted)' } as CSSProperties,
  sub: { color: 'var(--muted)', fontSize: 13, lineHeight: 1.5, margin: '0 0 10px', maxWidth: 860 } as CSSProperties,
  muted: { color: 'var(--muted)', fontSize: 12.5, margin: '4px 0' } as CSSProperties,
  note: { fontSize: 12.5, color: 'var(--text)', background: 'var(--warn-soft)', borderRadius: 10, padding: '8px 12px', margin: '6px 0' } as CSSProperties,
  err: { padding: '10px 12px', border: '1px solid var(--bad)', borderRadius: 10, color: 'var(--bad)', margin: '8px 0', fontSize: 13 } as CSSProperties,
  ok: { padding: '10px 12px', border: '1px solid var(--good)', borderRadius: 10, color: 'var(--good)', margin: '8px 0', fontSize: 13 } as CSSProperties,
  list: { listStyle: 'none', padding: 0, margin: '0 0 10px', fontSize: 13 } as CSSProperties,
  listRow: { padding: '6px 0', borderBottom: '1px dashed var(--border)' } as CSSProperties,
  link: { color: 'var(--accent)', textDecoration: 'none', fontWeight: 600 } as CSSProperties,
  tableWrap: { overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 12, marginBottom: 10 } as CSSProperties,
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 13 } as CSSProperties,
  th: { textAlign: 'left', padding: '8px 10px', borderBottom: '1px solid var(--border)', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.6, color: 'var(--muted)' } as CSSProperties,
  td: { padding: '8px 10px', borderBottom: '1px solid var(--border)', verticalAlign: 'top' } as CSSProperties,
  select: { minWidth: 260, maxWidth: '100%', padding: '6px 8px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--panel)', color: 'var(--text)', fontSize: 13 } as CSSProperties,
  warn: { color: 'var(--warn)', fontSize: 12 } as CSSProperties,
  verdict: { fontWeight: 700, fontSize: 13.5, margin: '4px 0 10px' } as CSSProperties,
  items: { display: 'grid', gap: 10 } as CSSProperties,
  item: { border: '1px solid var(--border)', borderRadius: 12, padding: '10px 14px' } as CSSProperties,
  itemHead: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', fontSize: 13.5 } as CSSProperties,
  pill: { fontSize: 11, fontWeight: 800, border: '1px solid', borderRadius: 999, padding: '1px 8px', textTransform: 'uppercase', letterSpacing: 0.5 } as CSSProperties,
  gap: { color: 'var(--bad)', fontSize: 12.5, margin: '6px 0' } as CSSProperties,
  sourced: { color: 'var(--good)', fontSize: 12.5, margin: '6px 0', fontWeight: 600 } as CSSProperties,
  warnLine: { color: 'var(--warn)', fontSize: 12.5, margin: '6px 0', fontWeight: 600 } as CSSProperties,
  req: { marginTop: 6 } as CSSProperties,
  reqHead: { fontSize: 12, fontWeight: 700, color: 'var(--muted)' } as CSSProperties,
  offers: { listStyle: 'none', padding: 0, margin: '4px 0 0', fontSize: 13 } as CSSProperties,
  offer: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, padding: '3px 0', flexWrap: 'wrap' } as CSSProperties,
  excluded: { color: 'var(--muted)', padding: '3px 0' } as CSSProperties,
  btnGhost: { border: '1px solid var(--border)', background: 'transparent', color: 'var(--text)', borderRadius: 8, padding: '4px 10px', fontSize: 12, cursor: 'pointer' } as CSSProperties,
  btnDone: { border: '1px solid var(--good)', background: 'transparent', color: 'var(--good)', borderRadius: 8, padding: '4px 10px', fontSize: 12 } as CSSProperties,
  btnPrimary: { border: 'none', background: 'var(--accent-grad, var(--accent))', color: 'var(--accent-ink, #fff)', borderRadius: 9, padding: '9px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer' } as CSSProperties,
};

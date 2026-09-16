'use client';

import { type CSSProperties, useCallback, useEffect, useState } from 'react';

/**
 * What a purchase order actually buys, and how it came to buy it (Wave 4 slices 2 and 1b).
 *
 * The order screen showed a title, a supplier and one number. Three things have to be visible here
 * that a single value cannot carry, and each of them exists because leaving it invisible lets a
 * reader believe something untrue:
 *
 *   THE MATERIALS, each in its OWN unit. "12" is meaningless; "12 nr" and "250 m" are not.
 *
 *   WHETHER A PRICE IS AGREED OR STILL AN ESTIMATE. A figure carried from a requisition is the
 *   requisitioner's budget guess, binding on nobody. Shown identically to a negotiated price, it
 *   becomes a commitment the moment somebody issues the order.
 *
 *   HOW THE ORDER WAS ARRIVED AT. `direct` is an explicit statement that nothing was competitively
 *   sourced; `legacy` is an order raised before lines existed and is NOT evidence of either. A
 *   screen that showed nothing here would let a reader assume the cheapest thing was bought.
 *
 * Presentation uses the shared `panel` / `data-table` / `badge` / `btn` / `input` system, so this
 * reads as the same application as every other register rather than a page of its own.
 */

interface OrderLine {
  id: string;
  lineNo: number;
  materialCode: string;
  materialName: string;
  manufacturer: string | null;
  model: string | null;
  uom: string;
  quantity: number;
  unitPrice: number;
  unitPriceBasis: 'estimate' | 'agreed' | null;
  sourceType: 'direct' | 'sourced';
  sourcePrLineId: string | null;
}

interface Summary {
  total: { lineCount: number; value: number };
  provenance: 'legacy' | 'direct' | 'sourced' | 'mixed';
  derived: boolean;
}

interface MaterialOption { id: string; code: string; name: string; uom: string }

const PROVENANCE: Record<Summary['provenance'], { label: string; note: string }> = {
  legacy: {
    label: 'Raised before order lines existed',
    note: 'This order has no lines, so how it was bought is not recorded — not that it was bought direct.',
  },
  direct: { label: 'Bought direct', note: 'No competitive sourcing — stated, not assumed.' },
  sourced: { label: 'Competitively sourced', note: 'Every line came from a selected supplier quotation.' },
  mixed: { label: 'Partly sourced', note: 'Some lines were competitively sourced and some were bought direct.' },
};

export default function OrderLinesPanel({ poId, currency, editable }: {
  poId: string;
  /** The order's currency. Never a hardcoded symbol. */
  currency: string;
  /** Lines may only be authored while the order is a draft; the server enforces it regardless. */
  editable: boolean;
}) {
  const [lines, setLines] = useState<OrderLine[] | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [materials, setMaterials] = useState<MaterialOption[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [material, setMaterial] = useState('');
  const [quantity, setQuantity] = useState('');
  const [unitPrice, setUnitPrice] = useState('');

  const money = (n: number): string =>
    `${currency} ${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const load = useCallback(async () => {
    try {
      const [l, s] = await Promise.all([
        fetch(`/api/procurement/purchase-orders/${poId}/lines`, { cache: 'no-store' }),
        fetch(`/api/procurement/purchase-orders/${poId}/lines/summary`, { cache: 'no-store' }),
      ]);
      const lb = await l.json().catch(() => []);
      if (!l.ok) throw new Error(lb?.message || lb?.error || 'Could not read the order lines');
      setLines(lb as OrderLine[]);
      setSummary(s.ok ? ((await s.json().catch(() => null)) as Summary) : null);
    } catch (e: unknown) {
      // Says it could not answer rather than rendering an empty table, which would read as
      // "this order buys nothing".
      setError(e instanceof Error ? e.message : 'Could not read the order lines');
      setLines(null);
    }
  }, [poId]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    void (async () => {
      const res = await fetch('/api/inventory/materials', { cache: 'no-store' });
      if (res.ok) setMaterials((await res.json().catch(() => [])) as MaterialOption[]);
    })();
  }, []);

  const chosen = materials.find((m) => m.id === material) ?? null;

  const act = async (run: () => Promise<Response>): Promise<void> => {
    setBusy(true); setError(null);
    try {
      const res = await run();
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.message || body?.error || 'The order refused that');
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'The order refused that');
    } finally {
      setBusy(false);
    }
  };

  const addLine = () =>
    act(async () => {
      const res = await fetch(`/api/procurement/purchase-orders/${poId}/lines`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ material, quantity: Number(quantity), unitPrice: Number(unitPrice) }),
      });
      if (res.ok) { setMaterial(''); setQuantity(''); setUnitPrice(''); }
      return res;
    });

  if (error && lines === null) {
    return (
      <section className="panel" style={st.section}>
        <div style={st.head}>What this order buys</div>
        <p style={st.bad} data-testid="order-lines-error">{error}</p>
      </section>
    );
  }
  if (lines === null) {
    return (
      <section className="panel" style={st.section}>
        <div style={st.head}>What this order buys</div>
        <p style={st.muted}>Loading…</p>
      </section>
    );
  }

  const provenance = summary ? PROVENANCE[summary.provenance] : null;

  return (
    <section className="panel" style={st.section} data-testid={`order-lines-${poId}`}>
      <div style={st.head}>
        What this order buys
        {provenance && (
          <span className={summary?.provenance === 'sourced' ? 'badge badge-good' : 'badge'} data-testid="order-provenance">
            {provenance.label}
          </span>
        )}
      </div>
      {provenance && <p style={st.note}>{provenance.note}</p>}

      {lines.length === 0 ? (
        <p style={st.muted} data-testid="order-lines-empty">
          No lines on this order. Its value is the figure somebody entered on the header, not a sum
          of materials.
        </p>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th style={st.wNum}>#</th>
              <th>Material</th>
              <th style={st.right}>Quantity</th>
              <th style={st.right}>Unit price</th>
              <th style={st.right}>Line total</th>
              <th>Bought</th>
              {editable && <th />}
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => (
              <tr key={l.id} data-testid={`order-line-${l.lineNo}`}>
                <td style={st.wNum}>{l.lineNo}</td>
                <td>
                  <div style={st.strong}>{l.materialCode}</div>
                  <div style={st.sub}>{l.materialName}</div>
                  {(l.manufacturer || l.model) && (
                    <div style={st.sub}>{[l.manufacturer, l.model].filter(Boolean).join(' · ')}</div>
                  )}
                </td>
                <td style={st.right} data-testid={`order-line-qty-${l.lineNo}`}>{l.quantity} {l.uom}</td>
                <td style={st.right}>
                  {money(l.unitPrice)}
                  {/*
                    A provisional figure must LOOK provisional. Identical numbers with different
                    commercial standing, shown identically, is how an estimate becomes a commitment.
                  */}
                  {l.unitPriceBasis === 'estimate' && (
                    <div style={st.warn} data-testid={`order-line-basis-${l.lineNo}`}>
                      estimate — not agreed with a supplier
                    </div>
                  )}
                  {l.unitPriceBasis === null && (
                    <div style={st.sub} data-testid={`order-line-basis-${l.lineNo}`}>basis not recorded</div>
                  )}
                </td>
                <td style={st.right}>{money(l.quantity * l.unitPrice)}</td>
                <td>
                  <span className={l.sourceType === 'sourced' ? 'badge badge-good' : 'badge'}
                    data-testid={`order-line-source-${l.lineNo}`}>
                    {l.sourceType}
                  </span>
                  {l.sourcePrLineId && <div style={st.sub}>answers a requisition line</div>}
                </td>
                {editable && (
                  <td style={st.nowrap}>
                    <button type="button" className="btn btn-ghost" style={st.sm} disabled={busy}
                      onClick={() => void act(() => fetch(`/api/procurement/purchase-orders/${poId}/lines/${l.id}`, { method: 'DELETE' }))}
                      data-testid={`order-line-remove-${l.lineNo}`}>
                      Remove
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {summary && summary.total.lineCount > 0 && (
        <div style={st.foot}>
          <strong data-testid="order-lines-value">{money(summary.total.value)}</strong>
          <span style={st.sub}>the sum of the lines above — one order, one total</span>
        </div>
      )}

      {editable && (
        <div style={st.form}>
          <select className="select" value={material} onChange={(e) => setMaterial(e.target.value)}
            data-testid="order-line-material" aria-label="Material">
            <option value="">Choose a material…</option>
            {materials.map((m) => <option key={m.id} value={m.id}>{m.code} — {m.name}</option>)}
          </select>
          <div style={st.qty}>
            <input className="input" style={st.narrow} value={quantity} onChange={(e) => setQuantity(e.target.value)}
              inputMode="decimal" placeholder="Quantity" data-testid="order-line-quantity" aria-label="Quantity" />
            {/* The unit belongs to the material and is shown, never entered. */}
            <span style={st.uom} data-testid="order-line-uom">{chosen?.uom ?? '—'}</span>
          </div>
          <input className="input" style={st.narrow} value={unitPrice} onChange={(e) => setUnitPrice(e.target.value)}
            inputMode="decimal" placeholder={`Agreed unit price (${currency})`}
            data-testid="order-line-price" aria-label={`Agreed unit price in ${currency}`} />
          <button type="button" className="btn btn-primary" disabled={busy || !material || !quantity || !unitPrice}
            onClick={() => void addLine()} data-testid="order-line-add">
            Add material
          </button>
        </div>
      )}

      {error && <p style={st.bad} data-testid="order-lines-refusal">{error}</p>}
    </section>
  );
}

const st = {
  section: { marginTop: 16, padding: '14px 16px' } as CSSProperties,
  head: { display: 'flex', alignItems: 'center', gap: 10, fontWeight: 600, fontSize: 14, marginBottom: 4 } as CSSProperties,
  note: { color: 'var(--muted)', fontSize: 12, margin: '0 0 12px', lineHeight: 1.5 } as CSSProperties,
  strong: { fontWeight: 600 } as CSSProperties,
  sub: { color: 'var(--muted)', fontSize: 11.5, marginTop: 2 } as CSSProperties,
  warn: { color: 'var(--warn, #b7791f)', fontSize: 11.5, marginTop: 2, fontWeight: 600 } as CSSProperties,
  bad: { color: 'var(--bad)', fontSize: 12.5, margin: '10px 0 0' } as CSSProperties,
  muted: { color: 'var(--muted)', fontSize: 13, margin: '6px 0' } as CSSProperties,
  right: { textAlign: 'right', whiteSpace: 'nowrap' } as CSSProperties,
  nowrap: { whiteSpace: 'nowrap' } as CSSProperties,
  wNum: { width: 44 } as CSSProperties,
  foot: { display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'flex-end', marginTop: 12 } as CSSProperties,
  form: { display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 14, alignItems: 'center' } as CSSProperties,
  qty: { display: 'flex', alignItems: 'center', gap: 6 } as CSSProperties,
  narrow: { maxWidth: 190 } as CSSProperties,
  uom: { color: 'var(--muted)', fontSize: 12.5, minWidth: 26 } as CSSProperties,
  sm: { padding: '4px 10px', fontSize: 12 } as CSSProperties,
};

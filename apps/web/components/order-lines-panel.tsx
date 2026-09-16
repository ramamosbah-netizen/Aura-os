'use client';

import { useCallback, useEffect, useState } from 'react';

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

  if (error && lines === null) return <p style={s.error} data-testid="order-lines-error">{error}</p>;
  if (lines === null) return <p style={s.muted}>Loading what this order buys…</p>;

  const provenance = summary ? PROVENANCE[summary.provenance] : null;

  return (
    <section style={s.wrap} data-testid={`order-lines-${poId}`}>
      <h3 style={s.h3}>What this order buys</h3>

      {provenance && (
        <p style={s.provenance} data-testid="order-provenance">
          <strong>{provenance.label}.</strong> {provenance.note}
        </p>
      )}

      {lines.length === 0 ? (
        <p style={s.muted} data-testid="order-lines-empty">
          No lines on this order. Its value is the figure somebody entered on the header, not a sum
          of materials.
        </p>
      ) : (
        <table style={s.table}>
          <thead>
            <tr>
              <th style={s.th}>#</th>
              <th style={s.th}>Material</th>
              <th style={s.thNum}>Quantity</th>
              <th style={s.thNum}>Unit price</th>
              <th style={s.thNum}>Line total</th>
              <th style={s.th}>Bought</th>
              {editable && <th style={s.th} />}
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => (
              <tr key={l.id} data-testid={`order-line-${l.lineNo}`}>
                <td style={s.td}>{l.lineNo}</td>
                <td style={s.td}>
                  <strong>{l.materialCode}</strong>
                  <div style={s.sub}>{l.materialName}</div>
                  {(l.manufacturer || l.model) && (
                    <div style={s.sub}>{[l.manufacturer, l.model].filter(Boolean).join(' · ')}</div>
                  )}
                </td>
                <td style={s.tdNum} data-testid={`order-line-qty-${l.lineNo}`}>{l.quantity} {l.uom}</td>
                <td style={s.tdNum}>
                  {money(l.unitPrice)}
                  {/*
                    A provisional figure must LOOK provisional. Identical numbers with different
                    commercial standing, shown identically, is how an estimate becomes a commitment.
                  */}
                  {l.unitPriceBasis === 'estimate' && (
                    <div style={s.estimate} data-testid={`order-line-basis-${l.lineNo}`}>
                      estimate — not agreed with a supplier
                    </div>
                  )}
                  {l.unitPriceBasis === null && (
                    <div style={s.unknown} data-testid={`order-line-basis-${l.lineNo}`}>basis not recorded</div>
                  )}
                </td>
                <td style={s.tdNum}>{money(l.quantity * l.unitPrice)}</td>
                <td style={s.td}>
                  <span style={l.sourceType === 'sourced' ? s.sourced : s.direct} data-testid={`order-line-source-${l.lineNo}`}>
                    {l.sourceType === 'sourced' ? 'sourced' : 'direct'}
                  </span>
                  {l.sourcePrLineId && <div style={s.sub}>answers a requisition line</div>}
                </td>
                {editable && (
                  <td style={s.td}>
                    <button type="button" style={s.link} disabled={busy}
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
        <div style={s.totals}>
          <strong data-testid="order-lines-value">{money(summary.total.value)}</strong>
          <span style={s.sub}>the sum of the lines above — one order, one total</span>
        </div>
      )}

      {editable && (
        <div style={s.form}>
          <select style={s.input} value={material} onChange={(e) => setMaterial(e.target.value)}
            data-testid="order-line-material" aria-label="Material">
            <option value="">Choose a material…</option>
            {materials.map((m) => <option key={m.id} value={m.id}>{m.code} — {m.name}</option>)}
          </select>
          <div style={s.qtyWrap}>
            <input style={s.input} value={quantity} onChange={(e) => setQuantity(e.target.value)}
              inputMode="decimal" placeholder="Quantity" data-testid="order-line-quantity" aria-label="Quantity" />
            {/* The unit belongs to the material and is shown, never entered. */}
            <span style={s.uom} data-testid="order-line-uom">{chosen?.uom ?? '—'}</span>
          </div>
          <input style={s.input} value={unitPrice} onChange={(e) => setUnitPrice(e.target.value)}
            inputMode="decimal" placeholder={`Agreed unit price (${currency})`}
            data-testid="order-line-price" aria-label={`Agreed unit price in ${currency}`} />
          <button type="button" style={s.btn} disabled={busy || !material || !quantity || !unitPrice}
            onClick={() => void addLine()} data-testid="order-line-add">
            Add material
          </button>
        </div>
      )}

      {error && <p style={s.error} data-testid="order-lines-refusal">{error}</p>}
    </section>
  );
}

const s = {
  wrap: { marginTop: 18, border: '1px solid var(--border)', borderRadius: 12, padding: '14px 16px', background: 'var(--panel)' },
  h3: { fontSize: 15, margin: '0 0 8px', letterSpacing: -0.2 },
  provenance: { fontSize: 12, color: 'var(--muted)', margin: '0 0 10px', lineHeight: 1.5 },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 13 },
  th: { textAlign: 'left', padding: '6px 8px', borderBottom: '1px solid var(--border)', fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.5 },
  thNum: { textAlign: 'right', padding: '6px 8px', borderBottom: '1px solid var(--border)', fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.5 },
  td: { padding: '7px 8px', borderBottom: '1px solid var(--border)', verticalAlign: 'top' },
  tdNum: { padding: '7px 8px', borderBottom: '1px solid var(--border)', textAlign: 'right', verticalAlign: 'top', whiteSpace: 'nowrap' },
  sub: { color: 'var(--muted)', fontSize: 11, marginTop: 2 },
  estimate: { color: 'var(--warn, #b7791f)', fontSize: 11, marginTop: 2, fontWeight: 600 },
  unknown: { color: 'var(--muted)', fontSize: 11, marginTop: 2 },
  direct: { fontSize: 11, color: 'var(--muted)', border: '1px solid var(--border)', borderRadius: 6, padding: '1px 6px' },
  sourced: { fontSize: 11, color: 'var(--good)', border: '1px solid var(--good)', borderRadius: 6, padding: '1px 6px' },
  totals: { display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'flex-end', marginTop: 10 },
  form: { display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12, alignItems: 'center' },
  qtyWrap: { display: 'flex', alignItems: 'center', gap: 6 },
  uom: { color: 'var(--muted)', fontSize: 12, minWidth: 28 },
  input: { padding: '6px 9px', fontSize: 13, border: '1px solid var(--border)', borderRadius: 8, background: 'var(--bg)', color: 'var(--text)' },
  btn: { padding: '6px 12px', fontSize: 13, fontWeight: 600, cursor: 'pointer', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--bg)', color: 'var(--text)' },
  link: { background: 'none', border: 'none', color: 'var(--bad)', fontSize: 12, cursor: 'pointer', padding: 0 },
  muted: { color: 'var(--muted)', fontSize: 12, margin: '4px 0' },
  error: { color: 'var(--bad)', fontSize: 12, margin: '8px 0 0' },
} as const satisfies Record<string, React.CSSProperties>;

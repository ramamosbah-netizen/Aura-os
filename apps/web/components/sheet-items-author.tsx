'use client';

import { type CSSProperties, useState } from 'react';

// Define items → generate the quote lines. The sheet-first authoring surface: each row is an item
// with a unit cost and a target margin; the sell price is derived (cost / (1 − margin)) and shown
// live, and "Generate lines" writes these as the quote's line items with those sell prices.
//
// This is the quick way in — enough to turn an empty shell into a priced quote. The detailed
// build-up grid below refines any line further (manpower, wastage, subcontract, …) and re-derives.
//
// Cost here is the item's all-in unit cost, entered as supply price; the detailed grid is where a
// cost gets decomposed. Kept deliberately small so a fast quote is fast.

interface Item { description: string; quantity: number; unitCost: number; margin: number }

const blank = (): Item => ({ description: '', quantity: 1, unitCost: 0, margin: 25 });
const money = (n: number): string => n.toLocaleString('en-AE', { maximumFractionDigits: 2 });
// Mirror of the domain's deriveSellUnitPrice, for the live preview only — the server recomputes.
const sell = (cost: number, margin: number): number => {
  const m = Math.min(Math.max(margin, 0), 99.9) / 100;
  return m <= 0 ? cost : Math.round((cost / (1 - m)) * 100) / 100;
};

export default function SheetItemsAuthor({ id, locked }: { id: string; locked: boolean }) {
  const [items, setItems] = useState<Item[]>([blank()]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null);

  const set = (i: number, patch: Partial<Item>): void =>
    setItems((prev) => prev.map((it, j) => (j === i ? { ...it, ...patch } : it)));
  const add = (): void => setItems((prev) => [...prev, blank()]);
  const remove = (i: number): void => setItems((prev) => (prev.length > 1 ? prev.filter((_, j) => j !== i) : prev));
  const num = (v: string): number => { const x = Number(v); return Number.isFinite(x) && x >= 0 ? x : 0; };

  const ready = items.filter((it) => it.description.trim());
  const grandSell = ready.reduce((s, it) => s + sell(it.unitCost, it.margin) * it.quantity, 0);

  async function generate(): Promise<void> {
    if (busy || ready.length === 0) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/crm/quotations/${id}/pricing/generate-lines`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          items: ready.map((it) => ({
            description: it.description.trim(),
            quantity: it.quantity,
            supplyUnitPrice: it.unitCost,
            targetMarginPercent: it.margin,
          })),
        }),
      });
      if (res.status === 409) {
        setMsg({ tone: 'bad', text: 'This quote is past draft — raise a revision to re-price.' });
        return;
      }
      if (!res.ok) { setMsg({ tone: 'bad', text: 'Could not generate the lines.' }); return; }
      setMsg({ tone: 'ok', text: 'Lines generated ✓' });
      // Reload so the quote's new lines + totals surface in the sheet and everywhere else.
      window.location.reload();
    } catch {
      setMsg({ tone: 'bad', text: 'Could not reach the server — nothing was generated.' });
    } finally {
      setBusy(false);
    }
  }

  if (locked) {
    return (
      <div style={st.wrap}>
        <p style={st.lockedNote}>
          This quote is priced and locked — its lines were generated from the sheet. Raise a
          revision to change the items.
        </p>
      </div>
    );
  }

  return (
    <div style={st.wrap}>
      <div style={st.head}>
        <b>Define items → generate quote lines</b>
        <span style={st.hint}>Each item's sell price is its cost lifted to the target margin.</span>
      </div>

      <div style={st.grid}>
        <div style={{ ...st.row, ...st.headerRow }}>
          <span>Item</span><span>Qty</span><span>Unit cost</span><span>Margin %</span><span>Sell / unit</span><span></span>
        </div>
        {items.map((it, i) => (
          <div key={i} style={st.row}>
            <input value={it.description} onChange={(e) => set(i, { description: e.target.value })} placeholder="e.g. CCTV camera, 4MP dome" style={st.desc} aria-label={`item ${i + 1} description`} />
            <input type="number" min={1} value={it.quantity} onChange={(e) => set(i, { quantity: num(e.target.value) || 1 })} style={st.num} aria-label={`item ${i + 1} quantity`} />
            <input type="number" min={0} step="0.01" value={it.unitCost} onChange={(e) => set(i, { unitCost: num(e.target.value) })} style={st.num} aria-label={`item ${i + 1} unit cost`} />
            <input type="number" min={0} max={99} value={it.margin} onChange={(e) => set(i, { margin: num(e.target.value) })} style={st.num} aria-label={`item ${i + 1} margin`} />
            <span style={st.sellCell}>{money(sell(it.unitCost, it.margin))}</span>
            <button type="button" onClick={() => remove(i)} style={st.rm} aria-label={`remove item ${i + 1}`} disabled={items.length === 1}>✕</button>
          </div>
        ))}
      </div>

      <div style={st.foot}>
        <button type="button" onClick={add} style={st.add}>+ Add item</button>
        <span style={st.total}>Quote total (excl. VAT): <b>AED {money(grandSell)}</b></span>
        <button type="button" onClick={() => void generate()} disabled={busy || ready.length === 0} style={st.generate}>
          {busy ? 'Generating…' : `Generate ${ready.length || ''} line${ready.length === 1 ? '' : 's'} →`}
        </button>
      </div>
      {msg && <p style={msg.tone === 'ok' ? st.ok : st.err}>{msg.text}</p>}
    </div>
  );
}

const st = {
  wrap: { border: '1px solid var(--accent)', borderRadius: 12, padding: 16, marginBottom: 18, background: 'var(--panel)' } as CSSProperties,
  head: { display: 'flex', flexDirection: 'column', gap: 2, marginBottom: 12 } as CSSProperties,
  hint: { color: 'var(--muted)', fontSize: 12 } as CSSProperties,
  grid: { display: 'flex', flexDirection: 'column', gap: 6 } as CSSProperties,
  row: { display: 'grid', gridTemplateColumns: '1fr 70px 100px 84px 100px 30px', gap: 8, alignItems: 'center' } as CSSProperties,
  headerRow: { fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.4, color: 'var(--muted)' } as CSSProperties,
  desc: { background: 'var(--panel-2, var(--panel))', border: '1px solid var(--border-strong, var(--border))', borderRadius: 7, color: 'var(--text, var(--fg))', padding: '7px 9px', fontSize: 13 } as CSSProperties,
  num: { background: 'var(--panel-2, var(--panel))', border: '1px solid var(--border-strong, var(--border))', borderRadius: 7, color: 'var(--text, var(--fg))', padding: '7px 8px', fontSize: 13, width: '100%', boxSizing: 'border-box' } as CSSProperties,
  sellCell: { fontSize: 13, fontVariantNumeric: 'tabular-nums', color: 'var(--good)', fontWeight: 600 } as CSSProperties,
  rm: { background: 'transparent', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 13 } as CSSProperties,
  foot: { display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap', marginTop: 14 } as CSSProperties,
  add: { background: 'var(--panel-2, var(--panel))', border: '1px solid var(--border-strong, var(--border))', borderRadius: 8, color: 'var(--text, var(--fg))', padding: '7px 13px', fontSize: 12.5, cursor: 'pointer' } as CSSProperties,
  total: { fontSize: 13, color: 'var(--muted)', marginLeft: 'auto' } as CSSProperties,
  generate: { background: 'var(--accent)', border: 'none', borderRadius: 8, color: '#0b1020', padding: '8px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer' } as CSSProperties,
  lockedNote: { color: 'var(--muted)', fontSize: 12.5, lineHeight: 1.6, margin: 0 } as CSSProperties,
  ok: { color: 'var(--good)', fontSize: 12.5, margin: '8px 0 0' } as CSSProperties,
  err: { color: 'var(--bad)', fontSize: 12.5, margin: '8px 0 0' } as CSSProperties,
};

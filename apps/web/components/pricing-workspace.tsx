'use client';

import { type CSSProperties, type ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { estimateLine, emptyEstimationInput, type EstimationLineInput } from '@aura/shared';
import MarketItemPicker, { type PickedItem } from './market-item-picker';

// The Pricing Workspace — three panes, so the screen does one thing at a time instead of two.
//
//   LEFT   the items, each a line of the quote-to-be. Pick one to work on it.
//   CENTRE the selected item's cost build-up ONLY — materials, labour (by productivity), the other
//          directs, and the loadings — grouped, not a thirty-column row. Live cost/sell/margin.
//   RIGHT  Market Intelligence + a Copilot for THIS item: the benchmark, the history, and what to
//          watch (margin, above/below market). Insert a benchmarked item to prefill the build-up.
//
// The estimate is computed by the SAME engine the server persists (`estimateLine` from @aura/shared),
// so what you see is what gets saved — no client/server drift.

type Line = EstimationLineInput;
const seed = (description = ''): Line => ({ ...emptyEstimationInput(), description });
const money = (n: number): string => (Number.isFinite(n) ? n : 0).toLocaleString('en-AE', { maximumFractionDigits: 2 });

export default function PricingWorkspace({ id, initial, locked }: { id: string; initial: Line[]; locked: boolean }) {
  const [lines, setLines] = useState<Line[]>(initial.length > 0 ? initial : [seed()]);
  const [sel, setSel] = useState(0);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null);

  const results = useMemo(() => lines.map(estimateLine), [lines]);
  const selected = lines[sel] ?? lines[0];
  const selResult = results[sel] ?? results[0];
  const grandTotal = results.reduce((s, r) => s + r.sellPrice, 0);
  const grandCost = results.reduce((s, r) => s + r.totalCost, 0);
  const blended = grandTotal > 0 ? Math.round(((grandTotal - grandCost) / grandTotal) * 1000) / 10 : 0;

  const patch = useCallback((i: number, p: Partial<Line>) =>
    setLines((prev) => prev.map((l, j) => (j === i ? { ...l, ...p } : l))), []);
  const patchLabour = useCallback((i: number, p: Partial<Line['labour']>) =>
    setLines((prev) => prev.map((l, j) => (j === i ? { ...l, labour: { ...l.labour, ...p } } : l))), []);
  const addItem = (): void => { setLines((p) => [...p, seed()]); setSel(lines.length); };
  const removeItem = (i: number): void => {
    setLines((p) => (p.length > 1 ? p.filter((_, j) => j !== i) : p));
    setSel((s) => Math.max(0, s >= i ? s - 1 : s));
  };

  async function save(): Promise<void> {
    if (busy || locked) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/crm/quotations/${id}/estimation`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ items: lines.filter((l) => l.description.trim()) }),
      });
      if (res.status === 409) { setMsg({ tone: 'bad', text: 'This quote is past draft — raise a revision to re-price.' }); return; }
      if (!res.ok) { setMsg({ tone: 'bad', text: 'Could not save the pricing.' }); return; }
      setMsg({ tone: 'ok', text: 'Saved — quote lines generated from the build-up.' });
    } catch {
      setMsg({ tone: 'bad', text: 'Could not reach the server — nothing was saved.' });
    } finally {
      setBusy(false);
    }
  }

  if (locked) {
    return (
      <div style={st.lockedWrap}>
        <b>Pricing is locked</b>
        <p style={st.muted}>This quote is approved — its lines were generated from the estimation. Raise a revision to re-price.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="pricing-workspace">
        {/* ── LEFT: items ─────────────────────────────── */}
        <div style={st.pane}>
          <div style={st.paneHead}><b>Items</b><button type="button" onClick={addItem} style={st.addBtn}>+ Add</button></div>
          <ul style={st.itemList}>
            {lines.map((l, i) => {
              const r = results[i];
              const m = r.marginPercent;
              return (
                <li key={i}>
                  <button type="button" onClick={() => setSel(i)} style={{ ...st.item, ...(i === sel ? st.itemOn : {}) }}>
                    <span style={st.itemName}>{l.description || <span style={st.muted}>Untitled item</span>}</span>
                    <span style={st.itemMeta}>
                      <span>{money(r.sellPrice)}</span>
                      <span style={{ color: m < 10 ? 'var(--bad)' : m > 35 ? 'var(--warn)' : 'var(--good)' }}>{m}%</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          <div style={st.totals}>
            <div style={st.totalRow}><span>Cost</span><b>{money(grandCost)}</b></div>
            <div style={st.totalRow}><span>Sell (excl. VAT)</span><b>{money(grandTotal)}</b></div>
            <div style={st.totalRow}><span>Blended margin</span><b>{blended}%</b></div>
          </div>
        </div>

        {/* ── CENTRE: the selected item's build-up ─────── */}
        <div style={st.pane}>
          {selected && (
            <>
              <div style={st.paneHead}><b>Cost build-up</b>
                {lines.length > 1 && <button type="button" onClick={() => removeItem(sel)} style={st.rm}>Remove item</button>}
              </div>
              <label style={st.field}>Item
                <MarketItemPicker
                  value={selected.description}
                  onType={(v) => patch(sel, { description: v, marketItemId: null })}
                  onPick={(p) => applyPick(sel, p)}
                />
              </label>
              <div style={st.two}>
                <Num label="Quantity" v={selected.quantity} on={(n) => patch(sel, { quantity: n })} />
                <div />
              </div>

              <Group title="Materials">
                <Num label="Unit cost" v={selected.materialUnitCost} on={(n) => patch(sel, { materialUnitCost: n })} />
                <Num label="Wastage %" v={selected.wastagePercent} on={(n) => patch(sel, { wastagePercent: n })} />
              </Group>

              <Group title={`Labour — ${selResult.labourHours}h · ${selResult.installDurationDays} day(s)`}>
                <Num label="Hours / unit" v={selected.labour.hoursPerUnit} on={(n) => patchLabour(sel, { hoursPerUnit: n })} />
                <Num label="Crew size" v={selected.labour.crewSize} on={(n) => patchLabour(sel, { crewSize: n })} />
                <Num label="Rate / hour" v={selected.labour.hourlyRate} on={(n) => patchLabour(sel, { hourlyRate: n })} />
              </Group>

              <Group title="Other direct">
                <Num label="Equipment / unit" v={selected.equipmentUnitCost} on={(n) => patch(sel, { equipmentUnitCost: n })} />
                <Num label="Consumables / unit" v={selected.consumablesUnitCost} on={(n) => patch(sel, { consumablesUnitCost: n })} />
                <Num label="Subcontract / unit" v={selected.subcontractUnitCost} on={(n) => patch(sel, { subcontractUnitCost: n })} />
              </Group>

              <Group title="Loadings">
                <Num label="Overhead %" v={selected.overheadPercent} on={(n) => patch(sel, { overheadPercent: n })} />
                <Num label="Risk %" v={selected.riskPercent} on={(n) => patch(sel, { riskPercent: n })} />
                <Num label="Warranty %" v={selected.warrantyPercent} on={(n) => patch(sel, { warrantyPercent: n })} />
                <Num label="Contingency %" v={selected.contingencyPercent} on={(n) => patch(sel, { contingencyPercent: n })} />
              </Group>

              <Group title="Margin & price">
                <Num label="Target margin %" v={selected.targetMarginPercent} on={(n) => patch(sel, { targetMarginPercent: n })} />
              </Group>

              <div style={st.result}>
                <Res label="Direct" v={selResult.directCost} />
                <Res label="Loadings" v={selResult.overheadCost + selResult.riskCost + selResult.warrantyCost + selResult.contingencyCost} />
                <Res label="Total cost" v={selResult.totalCost} strong />
                <Res label="Unit cost" v={selResult.unitCost} />
                <Res label="Sell" v={selResult.sellPrice} strong accent />
                <Res label="Margin" v={selResult.marginPercent} pct />
              </div>
            </>
          )}
        </div>

        {/* ── RIGHT: Market Intelligence + Copilot ─────── */}
        <div style={st.pane} className="pw-intel">
          <div style={st.paneHead}><b>Intelligence</b></div>
          {selected && <IntelPane description={selected.description} result={selResult} onInsert={(p) => applyPick(sel, p)} />}
        </div>
      </div>

      <div style={st.foot}>
        <button type="button" onClick={() => void save()} disabled={busy} style={st.save}>
          {busy ? 'Saving…' : 'Save & generate quote lines →'}
        </button>
        {msg && <span style={msg.tone === 'ok' ? st.ok : st.err}>{msg.text}</span>}
      </div>
    </div>
  );

  // A benchmarked item prefills materials + margin (its sell/cost implies the margin), and keeps
  // the reference so a future refresh can trace it.
  function applyPick(i: number, p: PickedItem): void {
    patch(i, {
      description: p.description,
      ...(p.unitCost !== undefined ? { materialUnitCost: p.unitCost } : {}),
      ...(p.marginPercent !== undefined ? { targetMarginPercent: p.marginPercent } : {}),
    });
  }
}

/* ── the right pane: MI benchmark + history + per-item copilot ── */
function IntelPane({ description, result, onInsert }: {
  description: string; result: ReturnType<typeof estimateLine>; onInsert: (p: PickedItem) => void;
}) {
  const [catalog, setCatalog] = useState<Array<{ id: string; name: string; brand: string | null; benchmarkCost: number; benchmarkSell: number; installHours: number; source: string | null; minPrice: number | null; maxPrice: number | null; leadTimeDays: number | null; warrantyMonths: number | null; confidence: number }>>([]);
  const [history, setHistory] = useState<Array<{ description: string; count: number; lastPrice: number; minPrice: number; maxPrice: number }>>([]);

  useEffect(() => {
    const q = description.trim();
    if (q.length < 2) { setCatalog([]); setHistory([]); return; }
    const t = setTimeout(async () => {
      const [c, h] = await Promise.all([
        fetch(`/api/crm/market-items?q=${encodeURIComponent(q)}&limit=3`, { cache: 'no-store' }).then((r) => r.json()).catch(() => []),
        fetch(`/api/crm/quotations/price-history?q=${encodeURIComponent(q)}`, { cache: 'no-store' }).then((r) => r.json()).catch(() => []),
      ]);
      setCatalog(Array.isArray(c) ? c.slice(0, 3) : []);
      setHistory(Array.isArray(h) ? h.slice(0, 3) : []);
    }, 250);
    return () => clearTimeout(t);
  }, [description]);

  // Per-item copilot: grounded flags against the first benchmark + history + the line's own margin.
  const bench = catalog[0];
  const hist = history[0];
  const flags: Array<{ tone: 'warn' | 'bad' | 'ok'; text: string }> = [];
  const sellU = result.unitSellPrice;
  if (result.marginPercent < 0) flags.push({ tone: 'bad', text: 'Sells below cost.' });
  else if (result.marginPercent < 10) flags.push({ tone: 'warn', text: `Thin margin (${result.marginPercent}%).` });
  if (bench && bench.benchmarkSell > 0 && sellU > 0) {
    const d = Math.round(((sellU - bench.benchmarkSell) / bench.benchmarkSell) * 100);
    if (d > 12) flags.push({ tone: 'warn', text: `${d}% above the market benchmark (${money(bench.benchmarkSell)}).` });
    else if (d < -10) flags.push({ tone: 'warn', text: `Below the market benchmark (${money(bench.benchmarkSell)}) — money on the table.` });
    else flags.push({ tone: 'ok', text: 'Within market range.' });
  }
  if (hist) flags.push({ tone: 'ok', text: `Quoted ${hist.count}× before · last ${money(hist.lastPrice)}.` });

  if (description.trim().length < 2) {
    return <p style={st.muted}>Start typing an item to see its market benchmark, price history, and pricing advice.</p>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {bench && (
        <div style={st.intelCard}>
          <div style={st.intelHead}>
            Market benchmark
            <span style={{ ...st.conf, color: bench.confidence >= 75 ? 'var(--good)' : bench.confidence >= 50 ? 'var(--warn)' : 'var(--bad)' }}>
              {bench.confidence}% confidence
            </span>
          </div>
          <div style={st.benchName}>{bench.name}{bench.brand ? ` · ${bench.brand}` : ''}</div>
          <div style={st.benchGrid}>
            <span>Cost</span><b>{money(bench.benchmarkCost)}</b>
            <span>Sell</span><b>{money(bench.benchmarkSell)}{bench.minPrice != null && bench.maxPrice != null ? ` (${money(bench.minPrice)}–${money(bench.maxPrice)})` : ''}</b>
            <span>Install</span><b>{bench.installHours}h</b>
            {bench.leadTimeDays != null && <><span>Lead time</span><b>{bench.leadTimeDays} days</b></>}
            {bench.warrantyMonths != null && <><span>Warranty</span><b>{bench.warrantyMonths} mo</b></>}
          </div>
          <button type="button" style={st.insert} onClick={() => onInsert({ description: bench.name, unitCost: bench.benchmarkCost, marginPercent: bench.benchmarkSell > 0 ? Math.round(((bench.benchmarkSell - bench.benchmarkCost) / bench.benchmarkSell) * 10) / 10 : 0 })}>
            Insert into build-up
          </button>
          {bench.source && <div style={st.src}>{bench.source}</div>}
        </div>
      )}
      {history.length > 0 && (
        <div style={st.intelCard}>
          <div style={st.intelHead}>Price history</div>
          {history.map((h) => (
            <div key={h.description} style={st.histRow}>
              <span style={st.histName}>{h.description}</span>
              <span style={st.histMeta}>{h.count}× · {money(h.lastPrice)}</span>
            </div>
          ))}
        </div>
      )}
      <div style={st.intelCard}>
        <div style={st.intelHead}>Copilot</div>
        {flags.length === 0 ? <p style={st.muted}>Looks reasonable.</p> : (
          <ul style={st.flags}>
            {flags.map((f, i) => (
              <li key={i} style={{ ...st.flag, color: f.tone === 'bad' ? 'var(--bad)' : f.tone === 'warn' ? 'var(--warn)' : 'var(--good)' }}>
                {f.tone === 'ok' ? '✓' : '⚠'} {f.text}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div style={st.group}>
      <div style={st.groupTitle}>{title}</div>
      <div style={st.groupBody}>{children}</div>
    </div>
  );
}
function Num({ label, v, on }: { label: string; v: number; on: (n: number) => void }) {
  return (
    <label style={st.numField}>
      <span style={st.numLabel}>{label}</span>
      <input type="number" min={0} step="0.01" value={v} onChange={(e) => { const x = Number(e.target.value); on(Number.isFinite(x) && x >= 0 ? x : 0); }} style={st.numInput} />
    </label>
  );
}
function Res({ label, v, strong, accent, pct }: { label: string; v: number; strong?: boolean; accent?: boolean; pct?: boolean }) {
  return (
    <div style={st.resCell}>
      <span style={st.resLabel}>{label}</span>
      <span style={{ ...st.resVal, ...(strong ? { fontWeight: 800 } : {}), ...(accent ? { color: 'var(--accent)' } : {}) }}>
        {pct ? `${v}%` : money(v)}
      </span>
    </div>
  );
}

const st = {
  pane: { background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 12, padding: 12 } as CSSProperties,
  paneHead: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, fontSize: 13.5 } as CSSProperties,
  addBtn: { background: 'var(--accent)', border: 'none', borderRadius: 7, color: '#0b1020', padding: '4px 11px', fontSize: 12, fontWeight: 700, cursor: 'pointer' } as CSSProperties,
  itemList: { listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 4 } as CSSProperties,
  item: { width: '100%', textAlign: 'left', display: 'flex', flexDirection: 'column', gap: 3, background: 'var(--panel-2, var(--panel))', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 10px', cursor: 'pointer', color: 'var(--text, var(--fg))' } as CSSProperties,
  itemOn: { borderColor: 'var(--accent)' } as CSSProperties,
  itemName: { fontSize: 12.5 } as CSSProperties,
  itemMeta: { display: 'flex', justifyContent: 'space-between', fontSize: 11.5, color: 'var(--muted)', fontVariantNumeric: 'tabular-nums' } as CSSProperties,
  totals: { marginTop: 12, borderTop: '1px solid var(--border)', paddingTop: 10, display: 'flex', flexDirection: 'column', gap: 5 } as CSSProperties,
  totalRow: { display: 'flex', justifyContent: 'space-between', fontSize: 12.5, color: 'var(--muted)' } as CSSProperties,
  field: { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11.5, color: 'var(--muted)', marginBottom: 10 } as CSSProperties,
  two: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 4 } as CSSProperties,
  group: { border: '1px solid var(--border)', borderRadius: 9, padding: 10, marginBottom: 8 } as CSSProperties,
  groupTitle: { fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--muted)', marginBottom: 7 } as CSSProperties,
  groupBody: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 8 } as CSSProperties,
  numField: { display: 'flex', flexDirection: 'column', gap: 3 } as CSSProperties,
  numLabel: { fontSize: 10.5, color: 'var(--muted)' } as CSSProperties,
  numInput: { background: 'var(--panel-2, var(--panel))', border: '1px solid var(--border-strong, var(--border))', borderRadius: 6, color: 'var(--text, var(--fg))', padding: '6px 8px', fontSize: 12.5, width: '100%', boxSizing: 'border-box' } as CSSProperties,
  result: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginTop: 6, borderTop: '1px solid var(--border)', paddingTop: 10 } as CSSProperties,
  resCell: { display: 'flex', flexDirection: 'column', gap: 2 } as CSSProperties,
  resLabel: { fontSize: 10.5, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.3 } as CSSProperties,
  resVal: { fontSize: 14, fontVariantNumeric: 'tabular-nums' } as CSSProperties,
  intelCard: { border: '1px solid var(--border)', borderRadius: 9, padding: 10 } as CSSProperties,
  intelHead: { fontSize: 10.5, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--muted)', marginBottom: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6 } as CSSProperties,
  conf: { fontSize: 10, fontWeight: 700, letterSpacing: 0 } as CSSProperties,
  benchName: { fontSize: 12.5, fontWeight: 600, marginBottom: 6 } as CSSProperties,
  benchGrid: { display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '2px 8px', fontSize: 12, alignItems: 'baseline' } as CSSProperties,
  insert: { marginTop: 8, width: '100%', background: 'var(--panel-2, var(--panel))', border: '1px solid var(--accent)', borderRadius: 7, color: 'var(--accent)', padding: '6px', fontSize: 12, fontWeight: 600, cursor: 'pointer' } as CSSProperties,
  src: { fontSize: 10.5, color: 'var(--muted)', marginTop: 6 } as CSSProperties,
  histRow: { display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 12, padding: '3px 0', borderTop: '1px solid var(--border)' } as CSSProperties,
  histName: { color: 'var(--text, var(--fg))', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } as CSSProperties,
  histMeta: { color: 'var(--muted)', whiteSpace: 'nowrap' } as CSSProperties,
  flags: { listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 5 } as CSSProperties,
  flag: { fontSize: 12, lineHeight: 1.5 } as CSSProperties,
  foot: { display: 'flex', gap: 14, alignItems: 'center', marginTop: 16, flexWrap: 'wrap' } as CSSProperties,
  save: { background: 'var(--accent)', border: 'none', borderRadius: 8, color: '#0b1020', padding: '9px 18px', fontSize: 13, fontWeight: 700, cursor: 'pointer' } as CSSProperties,
  rm: { background: 'transparent', border: 'none', color: 'var(--bad)', fontSize: 12, cursor: 'pointer' } as CSSProperties,
  lockedWrap: { border: '1px solid var(--border)', borderRadius: 12, padding: 16, background: 'var(--panel)' } as CSSProperties,
  muted: { color: 'var(--muted)', fontSize: 12, lineHeight: 1.6, margin: 0 } as CSSProperties,
  ok: { color: 'var(--good)', fontSize: 12.5 } as CSSProperties,
  err: { color: 'var(--bad)', fontSize: 12.5 } as CSSProperties,
};

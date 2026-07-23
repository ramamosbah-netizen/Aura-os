'use client';

import { type CSSProperties, type ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { estimateLine, emptyEstimationInput, analyseSheet, type EstimationLineInput } from '@aura/shared';
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

/** The sheet as the workspace sees it — the aggregate that owns the pricing. */
export interface SheetHead {
  id: string; name: string; status: 'draft' | 'frozen'; version: number;
  parentSheetId?: string | null;
  lines: Line[];
}

export default function PricingWorkspace({ quotationId, sheetName, initialSheet }: {
  quotationId: string;
  /** Default name for a sheet created on first save — usually the quote number + subject. */
  sheetName: string;
  initialSheet: SheetHead | null;
}) {
  const [sheet, setSheet] = useState<SheetHead | null>(initialSheet);
  const [lines, setLines] = useState<Line[]>(initialSheet && initialSheet.lines.length > 0 ? initialSheet.lines : [seed()]);
  const [sel, setSel] = useState(0);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null);
  const frozen = sheet?.status === 'frozen';

  const results = useMemo(() => lines.map(estimateLine), [lines]);
  // Sheet-level Copilot — same shared function the server owns, run live on every edit.
  const sheetAdvice = useMemo(() => analyseSheet(lines), [lines]);
  const [deal, setDeal] = useState<{
    account: { id: string; name: string } | null;
    quotesToAccount: { total: number; accepted: number; rejected: number; decidedWinRatePercent: number | null };
    frozenSheets: { count: number; avgMarginPercent: number | null };
  } | null>(null);
  useEffect(() => {
    if (!sheet?.id) { setDeal(null); return; }
    fetch(`/api/crm/pricing-sheets/${sheet.id}/deal-context`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null)).then(setDeal).catch(() => setDeal(null));
  }, [sheet?.id]);
  const [compare, setCompare] = useState<{
    from: { version: number }; costDiff: number; sellDiff: number; marginDiffPoints: number;
    added: Array<{ description: string; sellTotal: number }>;
    removed: Array<{ description: string; sellTotal: number }>;
    changed: Array<{ description: string; sellDiff: number; marginDiffPoints: number }>;
    unchanged: number;
  } | null>(null);
  useEffect(() => {
    if (!sheet?.id || !sheet.parentSheetId) { setCompare(null); return; }
    fetch(`/api/crm/pricing-sheets/${sheet.id}/compare`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null)).then(setCompare).catch(() => setCompare(null));
  }, [sheet?.id, sheet?.parentSheetId]);
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

  // The sheet lifecycle: save the DRAFT (creating the sheet on first save) → FREEZE the baseline
  // (build-up becomes immutable) → GENERATE the quotation from the frozen sheet. Re-pricing after
  // freeze is a NEW VERSION. Governance verdicts (409s) come from the server; the UI only relays.
  async function run(fn: () => Promise<void>): Promise<void> {
    if (busy) return;
    setBusy(true); setMsg(null);
    try { await fn(); } catch { setMsg({ tone: 'bad', text: 'Could not reach the server.' }); } finally { setBusy(false); }
  }

  const saveDraft = (): Promise<void> => run(async () => {
    const items = lines.filter((l) => l.description.trim());
    if (!sheet) {
      const res = await fetch('/api/crm/pricing-sheets', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: sheetName, quotationId, lines: items }),
      });
      if (!res.ok) { setMsg({ tone: 'bad', text: 'Could not create the pricing sheet.' }); return; }
      const created = (await res.json()) as SheetHead;
      setSheet(created);
      setMsg({ tone: 'ok', text: `Draft saved — sheet v${created.version}.` });
      return;
    }
    const res = await fetch(`/api/crm/pricing-sheets/${sheet.id}/lines`, {
      method: 'PUT', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ lines: items }),
    });
    if (res.status === 409) { setMsg({ tone: 'bad', text: 'This sheet is frozen — raise a new version to re-price.' }); return; }
    if (!res.ok) { setMsg({ tone: 'bad', text: 'Could not save the draft.' }); return; }
    setMsg({ tone: 'ok', text: 'Draft saved.' });
  });

  const freeze = (): Promise<void> => run(async () => {
    if (!sheet) { setMsg({ tone: 'bad', text: 'Save the draft first.' }); return; }
    const res = await fetch(`/api/crm/pricing-sheets/${sheet.id}/freeze`, { method: 'POST' });
    if (!res.ok) { setMsg({ tone: 'bad', text: 'Could not freeze — is the sheet already frozen or empty?' }); return; }
    setSheet((await res.json()) as SheetHead);
    setMsg({ tone: 'ok', text: 'Baseline frozen — the build-up is now immutable. Generate the quotation when ready.' });
  });

  const generate = (): Promise<void> => run(async () => {
    if (!sheet) return;
    const res = await fetch(`/api/crm/pricing-sheets/${sheet.id}/generate-quotation`, { method: 'POST' });
    if (res.status === 409) { setMsg({ tone: 'bad', text: 'Freeze the baseline first — a quote is generated from a committed price.' }); return; }
    if (!res.ok) { setMsg({ tone: 'bad', text: 'Could not generate the quotation.' }); return; }
    setMsg({ tone: 'ok', text: 'Quotation lines generated from the frozen sheet.' });
  });

  const newVersion = (): Promise<void> => run(async () => {
    if (!sheet) return;
    const res = await fetch(`/api/crm/pricing-sheets/${sheet.id}/revise`, { method: 'POST' });
    if (!res.ok) { setMsg({ tone: 'bad', text: 'Could not raise a new version.' }); return; }
    const next = (await res.json()) as SheetHead;
    setSheet(next);
    setLines(next.lines.length > 0 ? next.lines : [seed()]);
    setMsg({ tone: 'ok', text: `Draft v${next.version} raised — carrying the frozen build-up forward.` });
  });

  return (
    <div>
      <div className="pricing-workspace">
        {/* ── LEFT: items ─────────────────────────────── */}
        <div style={st.pane}>
          <div style={st.paneHead}><b>Items</b><button type="button" onClick={addItem} disabled={frozen} style={st.addBtn}>+ Add</button></div>
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
              <div style={st.paneHead}>
                <b>Cost build-up{frozen ? ' — frozen (read-only)' : ''}</b>
                {lines.length > 1 && !frozen && <button type="button" onClick={() => removeItem(sel)} style={st.rm}>Remove item</button>}
              </div>
              {/* fieldset[disabled] freezes every input inside in one stroke — the frozen build-up
                  stays fully visible (that is the point of a committed baseline) but untouchable. */}
              <fieldset disabled={frozen} style={{ border: 'none', padding: 0, margin: 0, minWidth: 0 }}>
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

              <Group title={`Labour — ${selResult.labourHours}h · ${selResult.installDurationDays} day(s)${selected.labour.hoursPerUnit > 0 ? ` · ~${Math.floor((selected.labour.crewSize * 8) / selected.labour.hoursPerUnit)} units/day` : ''}`}>
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
              </fieldset>

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

          {/* Sheet-level Copilot — the whole offer, live. */}
          <div style={{ ...st.intelCard, marginTop: 12 }}>
            <div style={st.intelHead}>Sheet review</div>
            <div style={st.benchGrid}>
              <span>Blended margin</span><b>{sheetAdvice.blendedMarginPercent}%</b>
              <span>Labour share</span><b>{sheetAdvice.labourSharePercent}% of direct</b>
            </div>
            {sheetAdvice.flags.length > 0 && (
              <ul style={{ ...st.flags, marginTop: 6 }}>
                {sheetAdvice.flags.map((f, i) => (
                  <li key={i} style={{ ...st.flag, color: f.tone === 'bad' ? 'var(--bad)' : f.tone === 'warn' ? 'var(--warn)' : 'var(--good)' }}>
                    {f.tone === 'ok' ? '✓' : '⚠'} {f.text}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Opportunity-level Copilot — real counts, never an invented probability. */}
          {deal && (
            <div style={{ ...st.intelCard, marginTop: 12 }}>
              <div style={st.intelHead}>Deal context{deal.account ? ` · ${deal.account.name}` : ''}</div>
              {deal.account ? (
                deal.quotesToAccount.total > 0 ? (
                  <div style={st.benchGrid}>
                    <span>Past quotes</span><b>{deal.quotesToAccount.total}</b>
                    <span>Accepted</span><b>{deal.quotesToAccount.accepted}</b>
                    <span>Rejected</span><b>{deal.quotesToAccount.rejected}</b>
                    {deal.quotesToAccount.decidedWinRatePercent != null && (
                      <><span>Decided win rate</span><b>{deal.quotesToAccount.decidedWinRatePercent}%</b></>
                    )}
                  </div>
                ) : <p style={st.muted}>First quote to this account — no history yet.</p>
              ) : <p style={st.muted}>No account linked — link the quote to a customer for deal history.</p>}
              {deal.frozenSheets.count > 0 && deal.frozenSheets.avgMarginPercent != null && (
                <p style={{ ...st.muted, marginTop: 6 }}>
                  Committed baselines so far: {deal.frozenSheets.count}, avg margin {deal.frozenSheets.avgMarginPercent}% — this sheet: {sheetAdvice.blendedMarginPercent}%.
                </p>
              )}
            </div>
          )}

          {/* Version comparison — change analysis vs the frozen parent. */}
          {compare && (
            <div style={{ ...st.intelCard, marginTop: 12 }}>
              <div style={st.intelHead}>vs v{compare.from.version}</div>
              <div style={st.benchGrid}>
                <span>Sell</span><b style={{ color: compare.sellDiff < 0 ? 'var(--warn)' : compare.sellDiff > 0 ? 'var(--good)' : 'inherit' }}>{compare.sellDiff >= 0 ? '+' : ''}{money(compare.sellDiff)}</b>
                <span>Cost</span><b>{compare.costDiff >= 0 ? '+' : ''}{money(compare.costDiff)}</b>
                <span>Margin</span><b>{compare.marginDiffPoints >= 0 ? '+' : ''}{compare.marginDiffPoints} pts</b>
              </div>
              {(compare.added.length > 0 || compare.removed.length > 0 || compare.changed.length > 0) && (
                <ul style={{ ...st.flags, marginTop: 6 }}>
                  {compare.added.map((l) => <li key={'a' + l.description} style={{ ...st.flag, color: 'var(--good)' }}>+ {l.description} ({money(l.sellTotal)})</li>)}
                  {compare.removed.map((l) => <li key={'r' + l.description} style={{ ...st.flag, color: 'var(--bad)' }}>− {l.description} ({money(l.sellTotal)})</li>)}
                  {compare.changed.map((l) => <li key={'c' + l.description} style={{ ...st.flag, color: 'var(--warn)' }}>Δ {l.description}: {l.sellDiff >= 0 ? '+' : ''}{money(l.sellDiff)} · {l.marginDiffPoints >= 0 ? '+' : ''}{l.marginDiffPoints} pts</li>)}
                </ul>
              )}
              <p style={{ ...st.muted, marginTop: 6 }}>{compare.unchanged} line(s) unchanged.</p>
            </div>
          )}
        </div>
      </div>

      <div style={st.foot}>
        {sheet && <span style={st.sheetBadge}>{sheet.name} · v{sheet.version} · {frozen ? '🧊 frozen' : 'draft'}</span>}
        {!frozen && (
          <>
            <button type="button" onClick={() => void saveDraft()} disabled={busy} style={st.ghostBtn}>
              {busy ? 'Working…' : sheet ? 'Save draft' : 'Save draft (creates the sheet)'}
            </button>
            <button type="button" onClick={() => void freeze()} disabled={busy || !sheet} style={st.save}
              title="The commercial commitment — the build-up becomes immutable">
              Freeze baseline 🧊
            </button>
          </>
        )}
        {frozen && (
          <>
            <button type="button" onClick={() => void generate()} disabled={busy} style={st.save}>
              Generate quotation →
            </button>
            <button type="button" onClick={() => void newVersion()} disabled={busy} style={st.ghostBtn}>
              New version (re-price)
            </button>
          </>
        )}
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
  const [catalog, setCatalog] = useState<Array<{ id: string; name: string; brand: string | null; benchmarkCost: number; benchmarkSell: number; installHours: number; source: string | null; minPrice: number | null; maxPrice: number | null; leadTimeDays: number | null; warrantyMonths: number | null; confidence: number; crewSize: number | null; commissioningHours: number | null }>>([]);
  const [history, setHistory] = useState<Array<{ description: string; count: number; lastPrice: number; minPrice: number; maxPrice: number }>>([]);
  const [suppliers, setSuppliers] = useState<Array<{ supplier: string; amount: number; rfq: string }>>([]);
  const [inventory, setInventory] = useState<Array<{ name: string; quantityOnHand: number; avgCost: number }>>([]);

  useEffect(() => {
    const q = description.trim();
    if (q.length < 2) { setCatalog([]); setHistory([]); return; }
    const t = setTimeout(async () => {
      // ONE read — Product Knowledge (MI as the single source): product, history, suppliers, stock.
      const k = await fetch(`/api/crm/product-knowledge?q=${encodeURIComponent(q)}`, { cache: 'no-store' })
        .then((r) => r.json()).catch(() => ({ products: [], history: [], suppliers: [], inventory: [] }));
      setCatalog(Array.isArray(k.products) ? k.products.slice(0, 3) : []);
      setHistory(Array.isArray(k.history) ? k.history.slice(0, 3) : []);
      setSuppliers(Array.isArray(k.suppliers) ? k.suppliers.slice(0, 3) : []);
      setInventory(Array.isArray(k.inventory) ? k.inventory.slice(0, 3) : []);
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
            {bench.crewSize != null && <><span>Crew</span><b>{bench.crewSize} tech{bench.crewSize > 1 ? 's' : ''}</b></>}
            {bench.commissioningHours != null && bench.commissioningHours > 0 && <><span>Commissioning</span><b>{bench.commissioningHours}h</b></>}
            {(() => { const h = bench.installHours + (bench.commissioningHours ?? 0); const crew = bench.crewSize ?? 1;
              return h > 0 ? <><span>Daily capacity</span><b>{Math.floor((crew * 8) / h)} / day</b></> : null; })()}
          </div>
          <button type="button" style={st.insert} onClick={() => onInsert({
            description: bench.name, unitCost: bench.benchmarkCost,
            marginPercent: bench.benchmarkSell > 0 ? Math.round(((bench.benchmarkSell - bench.benchmarkCost) / bench.benchmarkSell) * 10) / 10 : 0,
            ...(bench.installHours + (bench.commissioningHours ?? 0) > 0 ? { hoursPerUnit: bench.installHours + (bench.commissioningHours ?? 0) } : {}),
            ...(bench.crewSize ? { crewSize: bench.crewSize } : {}),
          })}>
            Insert into build-up
          </button>
          {bench.source && <div style={st.src}>{bench.source}</div>}
        </div>
      )}
      {suppliers.length > 0 && (
        <div style={st.intelCard}>
          <div style={st.intelHead}>Supplier offers</div>
          {suppliers.map((s, i) => (
            <div key={i} style={st.histRow}>
              <span style={st.histName}>{s.supplier}</span>
              <span style={st.histMeta}>{money(s.amount)} · {s.rfq}</span>
            </div>
          ))}
        </div>
      )}
      {(inventory.length > 0 || bench) && (
        <div style={st.intelCard}>
          <div style={st.intelHead}>Inventory</div>
          {inventory.length > 0
            ? inventory.map((s) => (
              <div key={s.name} style={st.histRow}>
                <span style={st.histName}>{s.name}</span>
                <span style={st.histMeta}>{s.quantityOnHand} on hand · WAC {money(s.avgCost)}</span>
              </div>
            ))
            : <p style={st.muted}>Not in stock — needs procurement{bench?.leadTimeDays != null ? ` (~${bench.leadTimeDays} days lead)` : ''}.</p>}
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
  sheetBadge: { fontSize: 12, color: 'var(--muted)', border: '1px solid var(--border)', borderRadius: 999, padding: '3px 11px' } as CSSProperties,
  ghostBtn: { background: 'var(--panel-2, var(--panel))', border: '1px solid var(--border-strong, var(--border))', borderRadius: 8, color: 'var(--text, var(--fg))', padding: '9px 16px', fontSize: 13, cursor: 'pointer' } as CSSProperties,
  muted: { color: 'var(--muted)', fontSize: 12, lineHeight: 1.6, margin: 0 } as CSSProperties,
  ok: { color: 'var(--good)', fontSize: 12.5 } as CSSProperties,
  err: { color: 'var(--bad)', fontSize: 12.5 } as CSSProperties,
};

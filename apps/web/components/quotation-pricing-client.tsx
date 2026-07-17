'use client';

import { type CSSProperties, useMemo, useState } from 'react';
import ExportButton from './export-button';

// Quotation pricing sheet — the full internal rate build-up. Every cost factor is
// editable; material → labour → other directs roll to DIRECT COST, then indirect
// (overhead %) → TOTAL COST. The quoted sell price is fixed, so profit/margin/
// markup fall out. Mirrors modules/crm computeQuotationPricing so the on-screen
// numbers match the server sheet exactly.

export interface ManpowerBlock { count: number; hours: number; rate: number }
export interface ManpowerLine extends ManpowerBlock { manHours: number; total: number }

export interface PricingLine {
  description: string; quantity: number;
  supplyUnitPrice: number; supplyTotal: number;
  wastagePercent: number; wastageTotal: number;
  accessories: number; materialTotal: number;
  technician: ManpowerLine; engineer: ManpowerLine; projectManager: ManpowerLine;
  labourTotal: number;
  transport: number; equipmentRent: number; subcontract: number; otherDirect: number;
  directCost: number; indirectPercent: number; indirectCost: number;
  costTotal: number; unitCostTotal: number;
  unitPrice: number; sellTotal: number; profit: number;
  marginPercent: number | null; markupPercent: number | null;
}
export interface PricingSheet {
  lines: PricingLine[];
  totalSupply: number; totalWastage: number; totalAccessories: number; totalMaterial: number;
  totalLabour: number; totalTransport: number; totalEquipment: number; totalSubcontract: number;
  totalOtherDirect: number; totalDirect: number; totalIndirect: number;
  totalCost: number; totalSell: number; profit: number;
  marginPercent: number | null; markupPercent: number | null;
  /** Governance: frozen once the quotation is approved — read/export/print only. */
  locked: boolean;
  status: string;
  quoteNumber: string;
  revision: number;
}

/** The editable factors, mirrored from the domain input type. */
interface Buildup {
  supplyUnitPrice: number; wastagePercent: number; accessories: number;
  technician: ManpowerBlock; engineer: ManpowerBlock; projectManager: ManpowerBlock;
  transport: number; equipmentRent: number; subcontract: number; otherDirect: number;
  indirectPercent: number;
}

const r2 = (n: number): number => Math.round(n * 100) / 100;
// AUTHORING direction — the price to quote for a desired margin on an all-in unit cost.
// Mirrors the domain deriveSellUnitPrice so the live grid matches the server after Apply.
const deriveSell = (unitCostAllIn: number, targetMarginPercent: number): number => {
  const m = Math.min(Math.max(Number(targetMarginPercent) || 0, 0), 99.9) / 100;
  return r2(m <= 0 ? unitCostAllIn : unitCostAllIn / (1 - m));
};
const money = (n: number): string => n.toLocaleString('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pct = (n: number | null): string => (n === null ? '—' : `${n}%`);
const marginColor = (n: number | null): string => (n === null ? 'var(--muted)' : n < 0 ? 'var(--bad)' : n < 15 ? 'var(--bad)' : n < 30 ? 'var(--accent)' : 'var(--good)');

const toBuildup = (l: PricingLine): Buildup => ({
  supplyUnitPrice: l.supplyUnitPrice, wastagePercent: l.wastagePercent, accessories: l.accessories,
  technician: { count: l.technician.count, hours: l.technician.hours, rate: l.technician.rate },
  engineer: { count: l.engineer.count, hours: l.engineer.hours, rate: l.engineer.rate },
  projectManager: { count: l.projectManager.count, hours: l.projectManager.hours, rate: l.projectManager.rate },
  transport: l.transport, equipmentRent: l.equipmentRent, subcontract: l.subcontract,
  otherDirect: l.otherDirect, indirectPercent: l.indirectPercent,
});

const mp = (b: ManpowerBlock): ManpowerLine => {
  const manHours = r2(b.count * b.hours);
  return { ...b, manHours, total: r2(manHours * b.rate) };
};

/** Client-side mirror of the domain compile — keeps the grid live before saving.
 *  When unlocked, the sheet AUTHORS the price: each line's sell is derived from its
 *  all-in unit cost + its target margin (the `margins` driver). Locked sheets keep
 *  their approved sell fixed. */
function compute(base: PricingSheet, builds: Buildup[], margins: number[]): PricingSheet {
  const rows: PricingLine[] = base.lines.map((l, i) => {
    const b = builds[i];
    const supplyTotal = r2(l.quantity * b.supplyUnitPrice);
    const wastageTotal = r2(supplyTotal * (b.wastagePercent / 100));
    const materialTotal = r2(supplyTotal + wastageTotal + b.accessories);
    const technician = mp(b.technician), engineer = mp(b.engineer), projectManager = mp(b.projectManager);
    const labourTotal = r2(technician.total + engineer.total + projectManager.total);
    const directCost = r2(materialTotal + labourTotal + b.transport + b.equipmentRent + b.subcontract + b.otherDirect);
    const indirectCost = r2(directCost * (b.indirectPercent / 100));
    const costTotal = r2(directCost + indirectCost);
    const unitCostTotal = l.quantity > 0 ? r2(costTotal / l.quantity) : 0;
    // Author mode (unlocked): cost + target margin ⇒ sell. Locked: approved sell is fixed.
    const unitPrice = base.locked ? l.unitPrice : deriveSell(unitCostTotal, margins[i] ?? 0);
    const sellTotal = base.locked ? l.sellTotal : r2(unitPrice * l.quantity);
    const profit = r2(sellTotal - costTotal);
    return {
      ...l, supplyUnitPrice: b.supplyUnitPrice, supplyTotal, wastagePercent: b.wastagePercent, wastageTotal,
      accessories: b.accessories, materialTotal, technician, engineer, projectManager, labourTotal,
      transport: b.transport, equipmentRent: b.equipmentRent, subcontract: b.subcontract, otherDirect: b.otherDirect,
      directCost, indirectPercent: b.indirectPercent, indirectCost, costTotal,
      unitCostTotal, unitPrice, sellTotal,
      profit,
      marginPercent: sellTotal > 0 ? r2((profit / sellTotal) * 100) : null,
      markupPercent: costTotal > 0 ? r2((profit / costTotal) * 100) : null,
    };
  });
  const sum = (p: (r: PricingLine) => number): number => r2(rows.reduce((s, r) => s + p(r), 0));
  const totalCost = sum((r) => r.costTotal), totalSell = sum((r) => r.sellTotal);
  const profit = r2(totalSell - totalCost);
  return {
    lines: rows,
    totalSupply: sum((r) => r.supplyTotal), totalWastage: sum((r) => r.wastageTotal),
    totalAccessories: sum((r) => r.accessories), totalMaterial: sum((r) => r.materialTotal),
    totalLabour: sum((r) => r.labourTotal), totalTransport: sum((r) => r.transport),
    totalEquipment: sum((r) => r.equipmentRent), totalSubcontract: sum((r) => r.subcontract),
    totalOtherDirect: sum((r) => r.otherDirect), totalDirect: sum((r) => r.directCost),
    totalIndirect: sum((r) => r.indirectCost), totalCost, totalSell, profit,
    marginPercent: totalSell > 0 ? r2((profit / totalSell) * 100) : null,
    markupPercent: totalCost > 0 ? r2((profit / totalCost) * 100) : null,
    // Governance state is server-owned — carry it through untouched.
    locked: base.locked, status: base.status, quoteNumber: base.quoteNumber, revision: base.revision,
  };
}

export default function QuotationPricingClient({ id, customerName, status, initialSheet }: {
  id: string; customerName: string; status: string; initialSheet: PricingSheet;
}) {
  const [builds, setBuilds] = useState<Buildup[]>(initialSheet.lines.map(toBuildup));
  // Per-line target margin — the AUTHORING driver. Seeded from the line's current margin
  // so the grid opens showing today's price, then editing cost/margin re-derives the sell.
  const seedMargin = (l: PricingLine): number => (l.costTotal > 0 && l.marginPercent !== null ? l.marginPercent : 25);
  const [margins, setMargins] = useState<number[]>(initialSheet.lines.map(seedMargin));
  const [saved, setSaved] = useState<string>(JSON.stringify({ builds: initialSheet.lines.map(toBuildup), margins: initialSheet.lines.map(seedMargin) }));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const sheet = useMemo(() => compute(initialSheet, builds, margins), [initialSheet, builds, margins]);
  const locked = initialSheet.locked;
  const dirty = !locked && JSON.stringify({ builds, margins }) !== saved;

  const set = (i: number, patch: Partial<Buildup>): void =>
    setBuilds((prev) => prev.map((b, j) => (j === i ? { ...b, ...patch } : b)));
  const setMan = (i: number, role: 'technician' | 'engineer' | 'projectManager', patch: Partial<ManpowerBlock>): void =>
    setBuilds((prev) => prev.map((b, j) => (j === i ? { ...b, [role]: { ...b[role], ...patch } } : b)));
  const n = (v: string): number => { const x = Number(v); return Number.isFinite(x) && x >= 0 ? x : 0; };

  // Save the cost build-up only (margins are not persisted separately — they drive the sell).
  const save = async (): Promise<void> => {
    setBusy(true); setMsg('');
    try {
      const res = await fetch(`/api/crm/quotations/${id}/pricing`, {
        method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ lines: builds }),
      });
      if (!res.ok) { setMsg('Save failed'); return; }
      setSaved(JSON.stringify({ builds, margins })); setMsg('Saved ✓');
    } catch { setMsg('API unreachable'); } finally { setBusy(false); }
  };

  // Author the quote FROM the sheet: persist the build-up and write the derived sell
  // prices onto the quotation lines. Reload so the quote's new totals surface everywhere.
  const apply = async (): Promise<void> => {
    setBusy(true); setMsg('');
    try {
      const res = await fetch(`/api/crm/quotations/${id}/pricing/apply`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ lines: builds, targetMargins: margins }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setMsg(d.message || d.error || 'Apply failed'); return;
      }
      setSaved(JSON.stringify({ builds, margins })); setMsg('Applied to quotation ✓');
      window.location.reload();
    } catch { setMsg('API unreachable'); } finally { setBusy(false); }
  };

  // Locked sheets render their factors as plain figures — no inputs at all.
  const Num = ({ v, on, w = 62 }: { v: number; on: (s: string) => void; w?: number }) =>
    locked
      ? <span style={st.ro}>{v === 0 ? '—' : money(v)}</span>
      : <input type="number" min={0} step="0.01" value={v} onChange={(e) => on(e.target.value)} style={{ ...st.input, width: w }} />;

  const exportRows = sheet.lines.map((l) => ({
    description: l.description, quantity: l.quantity,
    supplyUnitPrice: l.supplyUnitPrice, supplyTotal: l.supplyTotal,
    wastagePercent: l.wastagePercent, wastageTotal: l.wastageTotal, accessories: l.accessories,
    materialTotal: l.materialTotal,
    technicianHours: l.technician.manHours, technicianTotal: l.technician.total,
    engineerHours: l.engineer.manHours, engineerTotal: l.engineer.total,
    pmHours: l.projectManager.manHours, pmTotal: l.projectManager.total,
    labourTotal: l.labourTotal, transport: l.transport, equipmentRent: l.equipmentRent,
    subcontract: l.subcontract, otherDirect: l.otherDirect,
    directCost: l.directCost, indirectPercent: l.indirectPercent, indirectCost: l.indirectCost,
    costTotal: l.costTotal, unitCostTotal: l.unitCostTotal,
    unitPrice: l.unitPrice, sellTotal: l.sellTotal, profit: l.profit,
    marginPercent: l.marginPercent, markupPercent: l.markupPercent,
  }));

  return (
    <div>
      {locked && (
        <div style={st.lockBar}>
          🔒 <b>Pricing sheet locked</b> — {sheet.quoteNumber} Rev {sheet.revision} is <b>{status.replace('_', ' ')}</b>.
          The build-up behind an approved price is immutable. Export or print it below;
          to re-price, <a href={`/crm/quotations/${id}`} style={st.lockLink}>raise a revision</a>.
        </div>
      )}

      <div style={st.toolbar}>
        <span style={st.customer}>{customerName} · <span style={{ textTransform: 'capitalize' }}>{status.replace('_', ' ')}</span></span>
        <div style={{ flex: 1 }} />
        {msg && <span style={{ fontSize: 12.5, color: msg.includes('✓') ? 'var(--good)' : 'var(--bad)' }}>{msg}</span>}
        <ExportButton filename={`pricing-${sheet.quoteNumber}-rev${sheet.revision}`} rows={exportRows as unknown as Array<Record<string, unknown>>}
          columns={Object.keys(exportRows[0] ?? {}).map((key) => ({ key }))} />
        <a href={`/crm/quotations/${id}/pricing/print`} target="_blank" rel="noreferrer" style={st.printBtn}>🖨 Print</a>
        {!locked && (
          <>
            <button type="button" onClick={() => void save()} disabled={busy || !dirty}
              style={{ ...st.save, ...(dirty && !busy ? {} : st.saveDisabled) }}>Save build-up</button>
            <button type="button" onClick={() => void apply()} disabled={busy}
              style={st.apply} title="Write the derived sell prices onto the quotation lines">Apply to quotation →</button>
          </>
        )}
      </div>
      {!locked && (
        <p style={st.authorHint}>
          Authoring mode — set each line’s cost build-up and <b>target margin</b>; the sell price is derived.
          <b> Apply to quotation</b> writes those prices onto the quote.
        </p>
      )}

      <div style={st.scroll}>
        <table style={st.table}>
          <thead>
            <tr>
              <th style={{ ...st.grp, ...st.stick, textAlign: 'left' }}>Line</th>
              <th style={st.grp} colSpan={5}>Material</th>
              <th style={{ ...st.grp, ...st.grpAlt }} colSpan={4}>Labour (technician)</th>
              <th style={st.grp} colSpan={4}>Engineering</th>
              <th style={{ ...st.grp, ...st.grpAlt }} colSpan={4}>Project management</th>
              <th style={st.grp}>Labour</th>
              <th style={{ ...st.grp, ...st.grpAlt }} colSpan={4}>Other directs</th>
              <th style={st.grp} colSpan={2}>Direct</th>
              <th style={{ ...st.grp, ...st.grpAlt }} colSpan={2}>Indirect</th>
              <th style={st.grp} colSpan={2}>Cost</th>
              <th style={{ ...st.grp, ...st.grpSell }} colSpan={5}>Sell &amp; margin</th>
            </tr>
            <tr>
              <th style={{ ...st.th, ...st.stick, textAlign: 'left' }}>Description</th>
              <th style={st.th}>Qty</th>
              <th style={st.th}>Unit cost</th>
              <th style={st.th}>Supply total</th>
              <th style={st.th}>Wastage %</th>
              <th style={st.th}>Wastage</th>
              <th style={st.th}>Acc.</th>
              <th style={st.th}>No.</th><th style={st.th}>Hrs</th><th style={st.th}>Rate</th><th style={st.th}>Total labour</th>
              <th style={st.th}>No.</th><th style={st.th}>Hrs</th><th style={st.th}>Rate</th><th style={st.th}>Eng. total</th>
              <th style={st.th}>No.</th><th style={st.th}>Hrs</th><th style={st.th}>Rate</th><th style={st.th}>PM total</th>
              <th style={st.th}>Total labour</th>
              <th style={st.th}>Transport</th><th style={st.th}>Equipment</th><th style={st.th}>Subcontr.</th><th style={st.th}>Other</th>
              <th style={st.th}>Direct cost</th><th style={st.th}>Unit cost (all-in)</th>
              <th style={st.th}>Ind. %</th><th style={st.th}>Indirect</th>
              <th style={st.th}>Cost total</th><th style={st.th}>Profit</th>
              <th style={st.th}>Unit sell</th><th style={st.th}>Sell total</th><th style={st.th}>{locked ? 'Margin' : 'Target margin'}</th><th style={st.th}>Markup</th>
              <th style={st.th} />
            </tr>
          </thead>
          <tbody>
            {sheet.lines.map((l, i) => {
              const b = builds[i];
              return (
                <tr key={i}>
                  <td style={{ ...st.td, ...st.stickCell }}>{l.description}</td>
                  <td style={st.tdR}>{l.quantity}</td>
                  <td style={st.tdI}><Num v={b.supplyUnitPrice} on={(s) => set(i, { supplyUnitPrice: n(s) })} /></td>
                  <td style={st.tdC}>{money(l.supplyTotal)}</td>
                  <td style={st.tdI}><Num v={b.wastagePercent} on={(s) => set(i, { wastagePercent: n(s) })} w={52} /></td>
                  <td style={st.tdC}>{money(l.wastageTotal)}</td>
                  <td style={st.tdI}><Num v={b.accessories} on={(s) => set(i, { accessories: n(s) })} /></td>

                  <td style={st.tdI}><Num v={b.technician.count} on={(s) => setMan(i, 'technician', { count: n(s) })} w={44} /></td>
                  <td style={st.tdI}><Num v={b.technician.hours} on={(s) => setMan(i, 'technician', { hours: n(s) })} w={48} /></td>
                  <td style={st.tdI}><Num v={b.technician.rate} on={(s) => setMan(i, 'technician', { rate: n(s) })} w={52} /></td>
                  <td style={st.tdC}>{money(l.technician.total)}</td>

                  <td style={st.tdI}><Num v={b.engineer.count} on={(s) => setMan(i, 'engineer', { count: n(s) })} w={44} /></td>
                  <td style={st.tdI}><Num v={b.engineer.hours} on={(s) => setMan(i, 'engineer', { hours: n(s) })} w={48} /></td>
                  <td style={st.tdI}><Num v={b.engineer.rate} on={(s) => setMan(i, 'engineer', { rate: n(s) })} w={52} /></td>
                  <td style={st.tdC}>{money(l.engineer.total)}</td>

                  <td style={st.tdI}><Num v={b.projectManager.count} on={(s) => setMan(i, 'projectManager', { count: n(s) })} w={44} /></td>
                  <td style={st.tdI}><Num v={b.projectManager.hours} on={(s) => setMan(i, 'projectManager', { hours: n(s) })} w={48} /></td>
                  <td style={st.tdI}><Num v={b.projectManager.rate} on={(s) => setMan(i, 'projectManager', { rate: n(s) })} w={52} /></td>
                  <td style={st.tdC}>{money(l.projectManager.total)}</td>

                  <td style={{ ...st.tdC, fontWeight: 700 }}>{money(l.labourTotal)}</td>

                  <td style={st.tdI}><Num v={b.transport} on={(s) => set(i, { transport: n(s) })} /></td>
                  <td style={st.tdI}><Num v={b.equipmentRent} on={(s) => set(i, { equipmentRent: n(s) })} /></td>
                  <td style={st.tdI}><Num v={b.subcontract} on={(s) => set(i, { subcontract: n(s) })} /></td>
                  <td style={st.tdI}><Num v={b.otherDirect} on={(s) => set(i, { otherDirect: n(s) })} /></td>

                  <td style={{ ...st.tdC, fontWeight: 700 }}>{money(l.directCost)}</td>
                  <td style={st.tdC}>{money(l.unitCostTotal)}</td>
                  <td style={st.tdI}><Num v={b.indirectPercent} on={(s) => set(i, { indirectPercent: n(s) })} w={52} /></td>
                  <td style={st.tdC}>{money(l.indirectCost)}</td>
                  <td style={{ ...st.tdC, fontWeight: 800 }}>{money(l.costTotal)}</td>
                  <td style={{ ...st.tdC, color: marginColor(l.marginPercent), fontWeight: 700 }}>{money(l.profit)}</td>

                  <td style={{ ...st.tdR, ...(locked ? {} : { color: 'var(--accent)', fontWeight: 700 }) }}>{money(l.unitPrice)}</td>
                  <td style={{ ...st.tdR, fontWeight: 700 }}>{money(l.sellTotal)}</td>
                  <td style={{ ...st.tdR, color: marginColor(l.marginPercent), fontWeight: 800 }}>
                    {locked
                      ? pct(l.marginPercent)
                      : <input type="number" min={0} max={99} step="0.5" value={margins[i] ?? 0}
                          onChange={(e) => setMargins((prev) => prev.map((m, j) => (j === i ? n(e.target.value) : m)))}
                          style={{ ...st.input, width: 56, color: marginColor(l.marginPercent), fontWeight: 800 }} />}
                  </td>
                  <td style={{ ...st.tdR, color: 'var(--muted)' }}>{pct(l.markupPercent)}</td>
                  <td style={st.td} />
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <td style={{ ...st.tf, ...st.stickCell, textAlign: 'left' }}>Totals</td>
              <td style={st.tf} />
              <td style={st.tf} /><td style={st.tf}>{money(sheet.totalSupply)}</td>
              <td style={st.tf} /><td style={st.tf}>{money(sheet.totalWastage)}</td><td style={st.tf}>{money(sheet.totalAccessories)}</td>
              <td style={st.tf} /><td style={st.tf} /><td style={st.tf} /><td style={st.tf} />
              <td style={st.tf} /><td style={st.tf} /><td style={st.tf} /><td style={st.tf} />
              <td style={st.tf} /><td style={st.tf} /><td style={st.tf} /><td style={st.tf} />
              <td style={st.tf}>{money(sheet.totalLabour)}</td>
              <td style={st.tf}>{money(sheet.totalTransport)}</td><td style={st.tf}>{money(sheet.totalEquipment)}</td>
              <td style={st.tf}>{money(sheet.totalSubcontract)}</td><td style={st.tf}>{money(sheet.totalOtherDirect)}</td>
              <td style={st.tf}>{money(sheet.totalDirect)}</td><td style={st.tf} />
              <td style={st.tf} /><td style={st.tf}>{money(sheet.totalIndirect)}</td>
              <td style={st.tf}>{money(sheet.totalCost)}</td>
              <td style={{ ...st.tf, color: marginColor(sheet.marginPercent) }}>{money(sheet.profit)}</td>
              <td style={st.tf} /><td style={st.tf}>{money(sheet.totalSell)}</td>
              <td style={{ ...st.tf, color: marginColor(sheet.marginPercent) }}>{pct(sheet.marginPercent)}</td>
              <td style={{ ...st.tf, color: 'var(--muted)' }}>{pct(sheet.markupPercent)}</td>
              <td style={st.tf} />
            </tr>
          </tfoot>
        </table>
      </div>

      <div style={st.summary}>
        <Stat label="Material" value={money(sheet.totalMaterial)} />
        <Stat label="Labour" value={money(sheet.totalLabour)} />
        <Stat label="Transport + equipment" value={money(sheet.totalTransport + sheet.totalEquipment)} />
        <Stat label="Subcontract" value={money(sheet.totalSubcontract)} />
        <Stat label="Direct cost" value={money(sheet.totalDirect)} />
        <Stat label="Indirect" value={money(sheet.totalIndirect)} />
        <Stat label="Total cost" value={money(sheet.totalCost)} strong />
        <Stat label="Total sell" value={money(sheet.totalSell)} strong />
        <Stat label="Profit" value={money(sheet.profit)} tone={marginColor(sheet.marginPercent)} />
        <Stat label="Margin" value={pct(sheet.marginPercent)} tone={marginColor(sheet.marginPercent)} strong />
        <Stat label="Markup" value={pct(sheet.markupPercent)} />
      </div>
    </div>
  );
}

function Stat({ label, value, tone, strong }: { label: string; value: string; tone?: string; strong?: boolean }) {
  return (
    <div style={{ minWidth: 104 }}>
      <div style={st.statLabel}>{label}</div>
      <div style={{ ...st.statValue, ...(strong ? { fontSize: 17 } : {}), ...(tone ? { color: tone } : {}) }}>{value}</div>
    </div>
  );
}

const st: Record<string, CSSProperties> = {
  toolbar: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 },
  customer: { fontSize: 12.5, color: 'var(--muted)' },
  lockBar: { display: 'block', fontSize: 12.5, lineHeight: 1.5, color: 'var(--fg)', background: 'rgba(255,193,7,0.07)', border: '1px solid rgba(255,193,7,0.35)', borderRadius: 10, padding: '10px 13px', marginBottom: 12 },
  lockLink: { color: 'var(--accent)', fontWeight: 700 },
  ro: { fontSize: 12, color: 'var(--fg)' },
  printBtn: { border: '1px solid var(--border)', borderRadius: 9, padding: '7px 12px', fontSize: 12.5, fontWeight: 600, color: 'var(--fg)', background: 'var(--panel)', textDecoration: 'none' },
  save: { borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--accent)', borderRadius: 9, padding: '7px 14px', fontSize: 12.5, fontWeight: 700, color: 'var(--accent)', background: 'transparent', cursor: 'pointer' },
  saveDisabled: { opacity: 0.45, cursor: 'default', borderColor: 'var(--border)', color: 'var(--muted)' },
  apply: { border: '1px solid var(--accent)', borderRadius: 9, padding: '7px 14px', fontSize: 12.5, fontWeight: 800, color: '#0b1020', background: 'var(--accent)', cursor: 'pointer' },
  authorHint: { fontSize: 12, color: 'var(--muted)', margin: '0 0 12px', lineHeight: 1.5 },
  scroll: { overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 12, background: 'var(--panel)' },
  table: { borderCollapse: 'collapse', fontSize: 12, whiteSpace: 'nowrap' },
  grp: { padding: '6px 8px', borderBottom: '1px solid var(--border)', borderRight: '1px solid var(--border)', fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.6, color: 'var(--accent)', background: 'var(--panel-2, var(--panel))', textAlign: 'center' },
  grpAlt: { color: 'var(--muted)' },
  grpSell: { color: 'var(--good)' },
  th: { padding: '5px 7px', borderBottom: '1px solid var(--border)', fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.4, color: 'var(--muted)', textAlign: 'right', fontWeight: 700 },
  stick: { position: 'sticky', left: 0, zIndex: 2, background: 'var(--panel-2, var(--panel))', minWidth: 170 },
  stickCell: { position: 'sticky', left: 0, zIndex: 1, background: 'var(--panel)', minWidth: 170, fontWeight: 600 },
  td: { padding: '4px 7px', borderBottom: '1px solid var(--border)' },
  tdR: { padding: '4px 7px', borderBottom: '1px solid var(--border)', textAlign: 'right' },
  tdC: { padding: '4px 7px', borderBottom: '1px solid var(--border)', textAlign: 'right', color: 'var(--muted)' },
  tdI: { padding: '2px 4px', borderBottom: '1px solid var(--border)', textAlign: 'right' },
  input: { boxSizing: 'border-box', textAlign: 'right', background: 'var(--panel-2, var(--panel))', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--fg)', padding: '4px 6px', fontSize: 12 },
  tf: { padding: '7px', borderTop: '2px solid var(--border)', textAlign: 'right', fontWeight: 800, background: 'var(--panel-2, var(--panel))' },
  summary: { display: 'flex', gap: 20, flexWrap: 'wrap', padding: '14px 18px', border: '1px solid var(--border)', borderRadius: 12, background: 'var(--panel)', marginTop: 16 },
  statLabel: { fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.6, color: 'var(--muted)', marginBottom: 3 },
  statValue: { fontSize: 14.5, fontWeight: 700 },
};

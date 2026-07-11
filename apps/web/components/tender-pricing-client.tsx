'use client';

import { useCallback, useEffect, useState } from 'react';
import type { CSSProperties } from 'react';

// Tender pricing sheet — the company's INTERNAL Cost & Resource Breakdown
// (mirrors the estimator's spreadsheet: material supply, technician/engineer/PM
// manpower blocks, transport, wastage, accessories, subcontract → overhead % →
// profit % → selling rate per BOQ item). Fold the sheet over the BOQ and one
// click generates the client-facing CRM quotation. This page never leaves the
// company: the quotation carries only descriptions, quantities and prices.

interface Tender {
  id: string;
  title: string;
  reference: string | null;
  accountName: string | null;
  status: string;
  value: number;
}
interface BOQItem {
  id: string;
  itemCode: string;
  description: string;
  unit: string;
  quantity: number;
  rate: number;
  totalAmount: number;
}
interface ManpowerBlock {
  count: number;
  hours: number;
  rate: number;
}
interface ResourceBreakdown {
  supplyUnitPrice: number;
  technician: ManpowerBlock;
  engineer: ManpowerBlock;
  projectManager: ManpowerBlock;
  transport: number;
  wastagePercent: number;
  accessories: number;
  subcontract: number;
  equipmentRent: number;
  otherDirect: number;
}
interface BuildUp {
  boqItemId: string;
  resources: ResourceBreakdown | null;
  directCost: number;
  indirectPercent: number;
  indirectAmount: number;
  overheadPercent: number;
  profitPercent: number;
  sellingRate: number;
}
interface Estimate {
  itemCount: number;
  estimatedItemCount: number;
  directCostByType: Record<string, number>;
  totalDirectCost: number;
  totalIndirect: number;
  totalOverhead: number;
  totalProfit: number;
  totalSellingValue: number;
  unpricedBoqValue: number;
  estimatedTenderValue: number;
  marginPercent: number;
}
interface GeneratedQuotation {
  id: string;
  quoteNumber: string;
  status: string;
  total: number;
  issueDate: string;
}
interface Payload {
  tender: Tender;
  items: BOQItem[];
  buildUps: Record<string, BuildUp>;
  estimate: Estimate | null;
  rates: { technician: number; engineer: number; projectManager: number };
  quotations: GeneratedQuotation[];
}

interface SheetDraft {
  supplyUnitPrice: string;
  techCount: string; techHours: string; techRate: string;
  engCount: string; engHours: string; engRate: string;
  pmCount: string; pmHours: string; pmRate: string;
  transport: string;
  wastagePercent: string;
  accessories: string;
  subcontract: string;
  equipmentRent: string;
  otherDirect: string;
  indirectPercent: string;
  overheadPercent: string;
  profitPercent: string;
}

const aed = (n: number): string => new Intl.NumberFormat('en-AE', { maximumFractionDigits: 2 }).format(n);

export default function TenderPricingClient({ tenderId }: { tenderId: string }) {
  const [data, setData] = useState<Payload | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [draft, setDraft] = useState<SheetDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    const res = await fetch(`/api/tendering/tenders/${tenderId}/pricing`, { cache: 'no-store' });
    if (!res.ok) {
      setErr('Failed to load the pricing sheet');
      return;
    }
    setData(await res.json());
  }, [tenderId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!data) return <p style={{ color: 'var(--muted)' }}>{err ?? 'Loading pricing sheet…'}</p>;

  const { items, buildUps, estimate, rates, quotations } = data;

  const startEdit = (item: BOQItem): void => {
    const b = buildUps[item.id];
    const r = b?.resources;
    setDraft({
      supplyUnitPrice: String(r?.supplyUnitPrice ?? ''),
      techCount: String(r?.technician.count ?? ''),
      techHours: String(r?.technician.hours ?? ''),
      techRate: String(r?.technician.rate ?? rates.technician),
      engCount: String(r?.engineer.count ?? ''),
      engHours: String(r?.engineer.hours ?? ''),
      engRate: String(r?.engineer.rate ?? rates.engineer),
      pmCount: String(r?.projectManager.count ?? ''),
      pmHours: String(r?.projectManager.hours ?? ''),
      pmRate: String(r?.projectManager.rate ?? rates.projectManager),
      transport: String(r?.transport ?? ''),
      wastagePercent: String(r?.wastagePercent ?? ''),
      accessories: String(r?.accessories ?? ''),
      subcontract: String(r?.subcontract ?? ''),
      equipmentRent: String(r?.equipmentRent ?? ''),
      otherDirect: String(r?.otherDirect ?? ''),
      indirectPercent: String(b?.indirectPercent ?? 0),
      overheadPercent: String(b?.overheadPercent ?? 10),
      profitPercent: String(b?.profitPercent ?? 15),
    });
    setOpen(item.id);
    setErr(null);
    setMsg(null);
  };

  const n = (v: string): number => Number(v) || 0;

  /** Live line preview computed the same way the server compiles the sheet. */
  const preview = (item: BOQItem, d: SheetDraft) => {
    const qty = item.quantity || 1;
    const supply = n(d.supplyUnitPrice) * qty;
    const wastage = supply * (n(d.wastagePercent) / 100);
    const manpower =
      n(d.techCount) * n(d.techHours) * n(d.techRate) +
      n(d.engCount) * n(d.engHours) * n(d.engRate) +
      n(d.pmCount) * n(d.pmHours) * n(d.pmRate);
    const direct =
      supply + wastage + n(d.accessories) + n(d.transport) + n(d.equipmentRent) + manpower + n(d.subcontract) + n(d.otherDirect);
    const indirect = direct * (n(d.indirectPercent) / 100);
    const overhead = direct * (n(d.overheadPercent) / 100);
    const profit = (direct + indirect + overhead) * (n(d.profitPercent) / 100);
    const selling = direct + indirect + overhead + profit;
    return { direct, indirect, overhead, profit, selling, sellingRate: selling / qty, margin: selling > 0 ? ((overhead + profit) / selling) * 100 : 0 };
  };

  const saveLine = async (item: BOQItem): Promise<void> => {
    if (!draft) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/tendering/tenders/${tenderId}/pricing/items/${item.id}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          resources: {
            supplyUnitPrice: n(draft.supplyUnitPrice),
            technician: { count: n(draft.techCount), hours: n(draft.techHours), rate: n(draft.techRate) },
            engineer: { count: n(draft.engCount), hours: n(draft.engHours), rate: n(draft.engRate) },
            projectManager: { count: n(draft.pmCount), hours: n(draft.pmHours), rate: n(draft.pmRate) },
            transport: n(draft.transport),
            wastagePercent: n(draft.wastagePercent),
            accessories: n(draft.accessories),
            subcontract: n(draft.subcontract),
            equipmentRent: n(draft.equipmentRent),
            otherDirect: n(draft.otherDirect),
          },
          indirectPercent: n(draft.indirectPercent),
          overheadPercent: n(draft.overheadPercent),
          profitPercent: n(draft.profitPercent),
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(d.message ?? d.error ?? 'Failed to price the line');
        return;
      }
      setOpen(null);
      setDraft(null);
      await load();
      setMsg(`Line ${item.itemCode} priced — selling rate ${aed(d.sellingRate)}/${item.unit}, written back to the BOQ.`);
    } finally {
      setBusy(false);
    }
  };

  const generateQuotation = async (): Promise<void> => {
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      const res = await fetch(`/api/tendering/tenders/${tenderId}/quotation`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(d.message ?? d.error ?? 'Failed to generate the quotation');
        return;
      }
      await load();
      setMsg(`Quotation ${d.quoteNumber} created as a draft (total AED ${aed(d.total)}) — review it in CRM, then send it to the client.`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      {err && <div style={st.err}>{err}</div>}
      {msg && <div style={st.ok}>{msg}</div>}

      {/* totals bar — the estimate folded over the BOQ */}
      {estimate && (
        <div style={st.totals}>
          <Stat label="Material" value={`AED ${aed(estimate.directCostByType.material ?? 0)}`} />
          <Stat label="Labour" value={`AED ${aed(estimate.directCostByType.labour ?? 0)}`} />
          <Stat label="Plant / transport" value={`AED ${aed(estimate.directCostByType.plant ?? 0)}`} />
          <Stat label="Subcontract" value={`AED ${aed(estimate.directCostByType.subcontract ?? 0)}`} />
          {(estimate.directCostByType.other ?? 0) > 0 && <Stat label="Other direct" value={`AED ${aed(estimate.directCostByType.other)}`} />}
          <Stat label="Direct cost" value={`AED ${aed(estimate.totalDirectCost)}`} strong />
          <Stat label="Indirect" value={`AED ${aed(estimate.totalIndirect ?? 0)}`} />
          <Stat label="Overhead" value={`AED ${aed(estimate.totalOverhead)}`} />
          <Stat label="Profit" value={`AED ${aed(estimate.totalProfit)}`} />
          <Stat label="Selling value" value={`AED ${aed(estimate.totalSellingValue)}`} strong />
          {estimate.unpricedBoqValue > 0 && <Stat label="Unpriced BOQ" value={`AED ${aed(estimate.unpricedBoqValue)}`} />}
          <Stat label="Tender value" value={`AED ${aed(estimate.estimatedTenderValue)}`} strong accent />
          <Stat label="Margin" value={`${estimate.marginPercent}%`} accent />
          <Stat label="Priced" value={`${estimate.estimatedItemCount}/${estimate.itemCount} items`} />
        </div>
      )}

      {/* the sheet */}
      <div style={st.tableWrap}>
        <table style={st.table}>
          <thead>
            <tr>
              {['Code', 'Activity / scope item', 'Unit', 'Qty', 'Cost / unit', 'Sell / unit', 'Line total', 'Margin', ''].map((h, i) => (
                <th key={i} style={{ ...st.th, textAlign: i <= 1 ? 'left' : 'right' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && (
              <tr><td colSpan={9} style={{ ...st.td, textAlign: 'center', color: 'var(--muted)', padding: 24 }}>
                No BOQ items yet — add the scope on the tender page first.
              </td></tr>
            )}
            {items.map((item) => {
              const b = buildUps[item.id];
              const margin = b && b.sellingRate > 0 ? ((b.sellingRate - b.directCost) / b.sellingRate) * 100 : null;
              const isOpen = open === item.id;
              return (
                <FragmentRow key={item.id}>
                  <tr style={isOpen ? { background: 'var(--panel-2)' } : undefined}>
                    <td style={st.td}>{item.itemCode}</td>
                    <td style={{ ...st.td, textAlign: 'left', maxWidth: 340 }}>{item.description}</td>
                    <td style={{ ...st.td, textAlign: 'right' }}>{item.unit}</td>
                    <td style={{ ...st.td, textAlign: 'right' }}>{item.quantity}</td>
                    <td style={{ ...st.td, textAlign: 'right' }}>{b ? aed(b.directCost) : '—'}</td>
                    <td style={{ ...st.td, textAlign: 'right', fontWeight: 600 }}>{b ? aed(b.sellingRate) : aed(item.rate)}</td>
                    <td style={{ ...st.td, textAlign: 'right' }}>{aed((b ? b.sellingRate : item.rate) * item.quantity)}</td>
                    <td style={{ ...st.td, textAlign: 'right' }}>
                      {margin === null ? <span style={st.unpriced}>unpriced</span> : <span style={st.priced}>{margin.toFixed(1)}%</span>}
                    </td>
                    <td style={{ ...st.td, textAlign: 'right' }}>
                      <button style={st.btnGhost} disabled={busy} onClick={() => (isOpen ? (setOpen(null), setDraft(null)) : startEdit(item))}>
                        {isOpen ? 'Close' : b ? 'Edit breakdown' : 'Price this line'}
                      </button>
                    </td>
                  </tr>
                  {isOpen && draft && (
                    <tr>
                      <td colSpan={9} style={{ ...st.td, background: 'var(--panel-2)', padding: '14px 18px' }}>
                        <SheetEditor item={item} draft={draft} setDraft={setDraft} preview={preview(item, draft)} busy={busy} onSave={() => void saveLine(item)} />
                      </td>
                    </tr>
                  )}
                </FragmentRow>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* quotation bridge */}
      <div style={st.bridge}>
        <div>
          <div style={{ fontWeight: 700, marginBottom: 4 }}>Client quotation</div>
          <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>
            Generates a draft CRM quotation from this sheet — one line per BOQ item at its selling rate. The breakdown stays internal.
          </div>
          {quotations.length > 0 && (
            <div style={{ marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {quotations.map((q) => (
                <a key={q.id} href="/crm/quotations" style={st.quoteChip}>
                  {q.quoteNumber} · {q.status} · AED {aed(q.total)}
                </a>
              ))}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <a href={`/api/tendering/tenders/${tenderId}/pricing/csv`} style={st.btnGhostLink}>⤓ Export sheet (CSV)</a>
          <button style={st.btnPrimary} disabled={busy || items.length === 0} onClick={() => void generateQuotation()}>
            Generate quotation →
          </button>
        </div>
      </div>
    </div>
  );
}

function FragmentRow({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

function Stat({ label, value, strong, accent }: { label: string; value: string; strong?: boolean; accent?: boolean }) {
  return (
    <div style={{ minWidth: 110 }}>
      <div style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: 0.6, color: 'var(--muted)', marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: strong ? 15 : 13.5, fontWeight: strong ? 800 : 600, color: accent ? 'var(--accent)' : 'var(--fg)' }}>{value}</div>
    </div>
  );
}

function Field({ label, value, onChange, width = 90, disabled }: { label: string; value: string; onChange: (v: string) => void; width?: number; disabled?: boolean }) {
  return (
    <label style={{ display: 'grid', gap: 3, fontSize: 11.5, color: 'var(--muted)' }}>
      {label}
      <input
        type="number"
        step="any"
        min={0}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        style={{ width, padding: '6px 8px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--panel)', color: 'var(--fg)', fontSize: 12.5 }}
      />
    </label>
  );
}

function SheetEditor({
  item,
  draft,
  setDraft,
  preview,
  busy,
  onSave,
}: {
  item: BOQItem;
  draft: SheetDraft;
  setDraft: (d: SheetDraft) => void;
  preview: { direct: number; indirect: number; overhead: number; profit: number; selling: number; sellingRate: number; margin: number };
  busy: boolean;
  onSave: () => void;
}) {
  const set = (k: keyof SheetDraft) => (v: string) => setDraft({ ...draft, [k]: v });
  return (
    <div style={{ display: 'grid', gap: 12, textAlign: 'left' }}>
      <div style={ed.groupRow}>
        <div style={ed.group}>
          <div style={ed.groupTitle}>Material</div>
          <div style={ed.fields}>
            <Field label={`Supply / ${item.unit} (AED)`} value={draft.supplyUnitPrice} onChange={set('supplyUnitPrice')} width={110} />
            <Field label="Wastage %" value={draft.wastagePercent} onChange={set('wastagePercent')} width={70} />
            <Field label="Accessories (line)" value={draft.accessories} onChange={set('accessories')} width={100} />
          </div>
        </div>
        <div style={ed.group}>
          <div style={ed.groupTitle}>Logistics, plant & subcontract (whole line)</div>
          <div style={ed.fields}>
            <Field label="Transport (AED)" value={draft.transport} onChange={set('transport')} width={100} />
            <Field label="Equipment rent (AED)" value={draft.equipmentRent} onChange={set('equipmentRent')} width={110} />
            <Field label="Subcontract (AED)" value={draft.subcontract} onChange={set('subcontract')} width={100} />
            <Field label="Other direct (AED)" value={draft.otherDirect} onChange={set('otherDirect')} width={100} />
          </div>
        </div>
      </div>

      <div style={ed.group}>
        <div style={ed.groupTitle}>Manpower (whole line: people × hours × AED/hr)</div>
        <div style={{ display: 'grid', gap: 6 }}>
          {(
            [
              ['Technician', 'techCount', 'techHours', 'techRate'],
              ['Engineer', 'engCount', 'engHours', 'engRate'],
              ['Project manager', 'pmCount', 'pmHours', 'pmRate'],
            ] as Array<[string, keyof SheetDraft, keyof SheetDraft, keyof SheetDraft]>
          ).map(([label, c, h, r]) => (
            <div key={label} style={{ display: 'flex', gap: 10, alignItems: 'end' }}>
              <span style={{ width: 120, fontSize: 12.5, fontWeight: 600, paddingBottom: 7 }}>{label}</span>
              <Field label="Count" value={draft[c]} onChange={set(c)} width={64} />
              <Field label="Hours" value={draft[h]} onChange={set(h)} width={70} />
              <Field label="AED/hr" value={draft[r]} onChange={set(r)} width={70} />
              <span style={{ fontSize: 12, color: 'var(--muted)', paddingBottom: 8 }}>
                = AED {new Intl.NumberFormat().format((Number(draft[c]) || 0) * (Number(draft[h]) || 0) * (Number(draft[r]) || 0))}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 16, alignItems: 'end', flexWrap: 'wrap' }}>
        <Field label="Indirect % (prelims)" value={draft.indirectPercent} onChange={set('indirectPercent')} width={70} />
        <Field label="Overhead %" value={draft.overheadPercent} onChange={set('overheadPercent')} width={70} />
        <Field label="Profit %" value={draft.profitPercent} onChange={set('profitPercent')} width={70} />
        <div style={{ flex: 1 }} />
        <div style={{ display: 'flex', gap: 18, fontSize: 12.5, alignItems: 'center', flexWrap: 'wrap' }}>
          <span>Direct <b>AED {new Intl.NumberFormat().format(Math.round(preview.direct * 100) / 100)}</b></span>
          <span>+Indirect <b>{new Intl.NumberFormat().format(Math.round(preview.indirect * 100) / 100)}</b></span>
          <span>+OH <b>{new Intl.NumberFormat().format(Math.round(preview.overhead * 100) / 100)}</b></span>
          <span>+Profit <b>{new Intl.NumberFormat().format(Math.round(preview.profit * 100) / 100)}</b></span>
          <span style={{ color: 'var(--accent)', fontWeight: 800 }}>
            Sell AED {new Intl.NumberFormat().format(Math.round(preview.selling * 100) / 100)}
            {' '}({new Intl.NumberFormat().format(Math.round(preview.sellingRate * 100) / 100)}/{item.unit} · {preview.margin.toFixed(1)}%)
          </span>
          <button style={st.btnPrimary} disabled={busy} onClick={onSave}>Save line</button>
        </div>
      </div>
    </div>
  );
}

const st = {
  err: { padding: '10px 12px', border: '1px solid var(--bad)', borderRadius: 10, color: 'var(--bad)', marginBottom: 14, fontSize: 13 } as CSSProperties,
  ok: { padding: '10px 12px', border: '1px solid var(--good)', borderRadius: 10, color: 'var(--good)', marginBottom: 14, fontSize: 13 } as CSSProperties,
  totals: { display: 'flex', gap: 20, flexWrap: 'wrap', padding: '14px 18px', border: '1px solid var(--border)', borderRadius: 12, background: 'var(--panel)', marginBottom: 16 } as CSSProperties,
  tableWrap: { overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 12, background: 'var(--panel)' } as CSSProperties,
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 880 } as CSSProperties,
  th: { padding: '10px 12px', borderBottom: '1px solid var(--border)', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.6, color: 'var(--muted)' } as CSSProperties,
  td: { padding: '9px 12px', borderBottom: '1px solid var(--border)' } as CSSProperties,
  priced: { color: 'var(--good)', fontWeight: 700 } as CSSProperties,
  unpriced: { color: 'var(--warn, #d97706)', fontSize: 12 } as CSSProperties,
  btnGhost: { border: '1px solid var(--border)', background: 'transparent', color: 'var(--fg)', borderRadius: 8, padding: '5px 10px', fontSize: 12, cursor: 'pointer' } as CSSProperties,
  btnGhostLink: { border: '1px solid var(--border)', background: 'transparent', color: 'var(--fg)', borderRadius: 9, padding: '9px 14px', fontSize: 13, fontWeight: 600, textDecoration: 'none', whiteSpace: 'nowrap' } as CSSProperties,
  btnPrimary: { border: 'none', background: 'var(--accent-grad, var(--accent))', color: 'var(--accent-ink, #fff)', borderRadius: 9, padding: '9px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer' } as CSSProperties,
  bridge: { display: 'flex', alignItems: 'center', gap: 16, justifyContent: 'space-between', marginTop: 16, padding: '14px 18px', border: '1px solid var(--border)', borderRadius: 12, background: 'var(--panel)' } as CSSProperties,
  quoteChip: { fontSize: 12, border: '1px solid var(--border)', borderRadius: 999, padding: '4px 10px', color: 'var(--accent)', textDecoration: 'none' } as CSSProperties,
};

const ed = {
  groupRow: { display: 'flex', gap: 16, flexWrap: 'wrap' } as CSSProperties,
  group: { border: '1px dashed var(--border)', borderRadius: 10, padding: '10px 14px' } as CSSProperties,
  groupTitle: { fontSize: 11, fontWeight: 800, letterSpacing: 0.6, textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 8 } as CSSProperties,
  fields: { display: 'flex', gap: 12, flexWrap: 'wrap' } as CSSProperties,
};

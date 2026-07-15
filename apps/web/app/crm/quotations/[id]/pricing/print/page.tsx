import type { CSSProperties } from 'react';
import { getJson } from '@/lib/api';

export const dynamic = 'force-dynamic';

// Printable internal pricing sheet. INTERNAL — this is cost data (margin, rates,
// subcontract), never the client-facing document. The quotation print sheet at
// ../print is what goes to the customer.

interface ManpowerLine { count: number; hours: number; rate: number; manHours: number; total: number }
interface Line {
  description: string; quantity: number;
  supplyUnitPrice: number; supplyTotal: number; wastagePercent: number; wastageTotal: number;
  accessories: number; materialTotal: number;
  technician: ManpowerLine; engineer: ManpowerLine; projectManager: ManpowerLine; labourTotal: number;
  transport: number; equipmentRent: number; subcontract: number; otherDirect: number;
  directCost: number; indirectPercent: number; indirectCost: number;
  costTotal: number; unitCostTotal: number;
  unitPrice: number; sellTotal: number; profit: number;
  marginPercent: number | null; markupPercent: number | null;
}
interface View {
  lines: Line[]; totalMaterial: number; totalLabour: number; totalTransport: number;
  totalEquipment: number; totalSubcontract: number; totalOtherDirect: number;
  totalDirect: number; totalIndirect: number; totalCost: number; totalSell: number;
  profit: number; marginPercent: number | null; markupPercent: number | null;
  locked: boolean; status: string; quoteNumber: string; revision: number;
}
interface Head { customerName: string; issueDate: string }

const m = (n: number): string => n.toLocaleString('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pct = (n: number | null): string => (n === null ? '—' : `${n}%`);

export default async function PricingPrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [v, q] = await Promise.all([
    getJson<View>(`/api/crm/quotations/${id}/pricing`),
    getJson<Head>(`/api/crm/quotations/${id}`),
  ]);
  if (!v || !q) return <div style={{ padding: 40 }}>Pricing sheet not found or API offline.</div>;

  return (
    <div style={st.sheet}>
      <div style={st.stamp}>INTERNAL — COST BREAKDOWN · NOT FOR CLIENT CIRCULATION</div>

      <header style={st.head}>
        <div>
          <div style={st.kind}>PRICING SHEET</div>
          <div style={st.ref}>{v.quoteNumber} · Rev {v.revision}</div>
        </div>
        <div style={st.headMeta}>
          <div><b>Client:</b> {q.customerName}</div>
          <div><b>Issued:</b> {q.issueDate}</div>
          <div><b>Status:</b> <span style={{ textTransform: 'capitalize' }}>{v.status.replace('_', ' ')}</span> {v.locked ? '· 🔒 locked' : '· draft'}</div>
        </div>
      </header>

      {v.lines.map((l, i) => (
        <section key={i} style={st.line}>
          <div style={st.lineHead}>{l.description} <span style={st.qty}>× {l.quantity}</span></div>
          <table style={st.t}>
            <tbody>
              <Row label="Material supply" detail={`${l.quantity} × ${m(l.supplyUnitPrice)}`} value={l.supplyTotal} />
              <Row label={`Wastage ${l.wastagePercent}%`} value={l.wastageTotal} />
              <Row label="Accessories & consumables" value={l.accessories} />
              <Row label="Material total" value={l.materialTotal} sub />
              <Row label="Technician" detail={`${l.technician.count} × ${l.technician.hours}h @ ${m(l.technician.rate)}`} value={l.technician.total} />
              <Row label="Engineering" detail={`${l.engineer.count} × ${l.engineer.hours}h @ ${m(l.engineer.rate)}`} value={l.engineer.total} />
              <Row label="Project management" detail={`${l.projectManager.count} × ${l.projectManager.hours}h @ ${m(l.projectManager.rate)}`} value={l.projectManager.total} />
              <Row label="Total labour" value={l.labourTotal} sub />
              <Row label="Transport" value={l.transport} />
              <Row label="Equipment rent" value={l.equipmentRent} />
              <Row label="Subcontractor" value={l.subcontract} />
              <Row label="Other direct" value={l.otherDirect} />
              <Row label="DIRECT COST" value={l.directCost} strong />
              <Row label={`Indirect / overhead ${l.indirectPercent}%`} value={l.indirectCost} />
              <Row label="TOTAL COST" detail={`unit ${m(l.unitCostTotal)}`} value={l.costTotal} strong />
              <Row label="Sell" detail={`${l.quantity} × ${m(l.unitPrice)}`} value={l.sellTotal} strong />
              <Row label={`Profit · margin ${pct(l.marginPercent)} · markup ${pct(l.markupPercent)}`} value={l.profit} strong />
            </tbody>
          </table>
        </section>
      ))}

      <section style={st.totals}>
        <div style={st.totalsTitle}>Sheet totals</div>
        <table style={st.t}>
          <tbody>
            <Row label="Material" value={v.totalMaterial} />
            <Row label="Labour" value={v.totalLabour} />
            <Row label="Transport" value={v.totalTransport} />
            <Row label="Equipment" value={v.totalEquipment} />
            <Row label="Subcontract" value={v.totalSubcontract} />
            <Row label="Other direct" value={v.totalOtherDirect} />
            <Row label="DIRECT COST" value={v.totalDirect} strong />
            <Row label="Indirect" value={v.totalIndirect} />
            <Row label="TOTAL COST" value={v.totalCost} strong />
            <Row label="TOTAL SELL" value={v.totalSell} strong />
            <Row label={`PROFIT · margin ${pct(v.marginPercent)} · markup ${pct(v.markupPercent)}`} value={v.profit} strong />
          </tbody>
        </table>
      </section>

      <footer style={st.foot}>
        {v.locked
          ? 'This sheet is locked against the approved commercial baseline — figures are immutable.'
          : 'Draft sheet — figures may still change until the quotation is approved.'}
      </footer>
    </div>
  );
}

function Row({ label, detail, value, strong, sub }: { label: string; detail?: string; value: number; strong?: boolean; sub?: boolean }) {
  return (
    <tr>
      <td style={{ ...st.td, ...(strong ? st.strong : {}), ...(sub ? st.sub : {}) }}>{label}</td>
      <td style={{ ...st.tdD }}>{detail ?? ''}</td>
      <td style={{ ...st.tdR, ...(strong ? st.strong : {}), ...(sub ? st.sub : {}) }}>{m(value)}</td>
    </tr>
  );
}

const st: Record<string, CSSProperties> = {
  sheet: { maxWidth: 820, margin: '0 auto', padding: '28px 32px 60px', color: '#111', background: '#fff', fontSize: 12.5 },
  stamp: { fontSize: 10, fontWeight: 800, letterSpacing: 1, color: '#b00', border: '1px solid #b00', borderRadius: 4, padding: '4px 8px', display: 'inline-block', marginBottom: 16 },
  head: { display: 'flex', justifyContent: 'space-between', gap: 20, borderBottom: '2px solid #111', paddingBottom: 12, marginBottom: 18 },
  kind: { fontSize: 20, fontWeight: 800, letterSpacing: 1 },
  ref: { fontSize: 13, color: '#555', marginTop: 2 },
  headMeta: { fontSize: 12, lineHeight: 1.7, textAlign: 'right' },
  line: { marginBottom: 18, breakInside: 'avoid' },
  lineHead: { fontWeight: 800, fontSize: 13, marginBottom: 5, borderBottom: '1px solid #ddd', paddingBottom: 3 },
  qty: { color: '#666', fontWeight: 600 },
  t: { width: '100%', borderCollapse: 'collapse' },
  td: { padding: '3px 0', width: '46%' },
  tdD: { padding: '3px 8px', color: '#666', width: '32%' },
  tdR: { padding: '3px 0', textAlign: 'right', width: '22%', fontVariantNumeric: 'tabular-nums' },
  strong: { fontWeight: 800, borderTop: '1px solid #999' },
  sub: { fontWeight: 700, color: '#333' },
  totals: { marginTop: 22, borderTop: '2px solid #111', paddingTop: 12, breakInside: 'avoid' },
  totalsTitle: { fontSize: 11, fontWeight: 800, letterSpacing: 1, marginBottom: 6 },
  foot: { marginTop: 26, fontSize: 10.5, color: '#666', borderTop: '1px solid #ddd', paddingTop: 8 },
};

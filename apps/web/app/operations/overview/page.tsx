import type { CSSProperties } from 'react';
import { getJson } from '@/lib/api';

export const dynamic = 'force-dynamic';

// Operations Overview — the workspace cockpit (Phase 4b). One front door across the operational
// domains: procurement spend, requests awaiting approval, and inventory that needs reordering.
// Every figure is READ from live endpoints (procurement + inventory) — no fabricated numbers.

interface Po { status?: string; value?: number }
interface Pr { status: string; value?: number }
interface Stock { code?: string; name?: string; quantityOnHand?: number; avgCost?: number; reorderLevel?: number; reorderQty?: number }

const CLOSED_PO = new Set(['received', 'closed', 'cancelled', 'completed']);
const aed = (n: number): string => 'AED ' + n.toLocaleString(undefined, { maximumFractionDigits: 0 });

export default async function OperationsOverviewPage() {
  const [pos, prs, stock] = await Promise.all([
    getJson<Po[]>('/api/procurement/purchase-orders'),
    getJson<Pr[]>('/api/procurement/purchase-requests'),
    getJson<Stock[]>('/api/inventory/stock'),
  ]);

  const anyData = pos !== null || prs !== null || stock !== null;
  const poRows = pos ?? [];
  const prRows = prs ?? [];
  const stkRows = stock ?? [];

  const openPos = poRows.filter((p) => !CLOSED_PO.has((p.status ?? '').toLowerCase()));
  const openPoValue = openPos.reduce((s, p) => s + (Number(p.value) || 0), 0);
  const poSpend = poRows.reduce((s, p) => s + (Number(p.value) || 0), 0);
  const pendingPrs = prRows.filter((p) => (p.status ?? '').toLowerCase() === 'draft');
  const pendingPrValue = pendingPrs.reduce((s, p) => s + (Number(p.value) || 0), 0);
  const stockValue = stkRows.reduce((s, i) => s + (Number(i.quantityOnHand) || 0) * (Number(i.avgCost) || 0), 0);
  const lowStock = stkRows
    .filter((i) => (Number(i.reorderLevel) || 0) > 0 && (Number(i.quantityOnHand) || 0) <= (Number(i.reorderLevel) || 0))
    .sort((a, b) => (Number(a.quantityOnHand) || 0) - (Number(b.quantityOnHand) || 0));

  return (
    <div style={st.page}>
      <h1 style={st.h1}>Operations · Overview</h1>
      <p style={st.sub}>The operations cockpit — what is committed, what is awaiting approval, and what needs reordering, across every domain.</p>

      {!anyData ? (
        <p style={st.offline}>Live data unavailable — the API is offline. The cockpit fills in as soon as it is back.</p>
      ) : (
        <>
          <div style={st.cards}>
            <Kpi label="Open POs" value={String(openPos.length)} sub={aed(openPoValue)} accent />
            <Kpi label="PO spend (all)" value={aed(poSpend)} sub={`${poRows.length} orders`} />
            <Kpi label="Requests to approve" value={String(pendingPrs.length)} sub={aed(pendingPrValue)} bad={pendingPrs.length > 0} />
            <Kpi label="Stock value" value={aed(stockValue)} sub={`${stkRows.length} items`} />
            <Kpi label="Below reorder" value={String(lowStock.length)} sub="need replenishment" bad={lowStock.length > 0} />
          </div>

          <div style={st.twoCol}>
            <section className="panel" style={st.panel}>
              <h3 style={st.h3}>Needs reordering <span style={st.count}>{lowStock.length}</span></h3>
              <p style={st.hint}>Items at or below their reorder level — raise a purchase request to replenish.</p>
              {lowStock.length === 0 ? (
                <p style={st.muted}>Every stocked item is above its reorder level.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {lowStock.slice(0, 8).map((i, idx) => (
                    <a key={i.code ?? idx} href="/inventory/stock" style={st.row}>
                      <span style={{ fontWeight: 600, fontSize: 13, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{i.name ?? i.code ?? 'Item'}</span>
                      <span style={{ fontSize: 12.5, color: 'var(--bad)' }}>{i.quantityOnHand ?? 0} on hand</span>
                      <span style={{ fontSize: 12, color: 'var(--muted)', whiteSpace: 'nowrap' }}>reorder ≤ {i.reorderLevel}</span>
                    </a>
                  ))}
                </div>
              )}
            </section>

            <section className="panel" style={st.panel}>
              <h3 style={st.h3}>Procurement queue</h3>
              <div style={st.qline}><span style={{ color: 'var(--muted)' }}>Requests awaiting approval</span><strong>{pendingPrs.length} · {aed(pendingPrValue)}</strong></div>
              <div style={st.qline}><span style={{ color: 'var(--muted)' }}>Open purchase orders</span><strong>{openPos.length} · {aed(openPoValue)}</strong></div>
              <div style={st.qline}><span style={{ color: 'var(--muted)' }}>Total committed spend</span><strong>{aed(poSpend)}</strong></div>

              <h4 style={{ ...st.h3, fontSize: 12.5, marginTop: 16 }}>Jump to a domain</h4>
              <div style={st.links}>
                <a href="/procurement/dashboard" style={st.link}>Procurement →</a>
                <a href="/inventory/dashboard" style={st.link}>Inventory →</a>
                <a href="/engineering" style={st.link}>Engineering →</a>
                <a href="/quality/control" style={st.link}>Quality →</a>
                <a href="/hse/control" style={st.link}>HSE →</a>
                <a href="/hr/dashboard" style={st.link}>People →</a>
                <a href="/fleet/control" style={st.link}>Fleet →</a>
                <a href="/subcontracts/subcontracts" style={st.link}>Subcontracts →</a>
              </div>
            </section>
          </div>
        </>
      )}
    </div>
  );
}

function Kpi({ label, value, sub, accent, bad }: { label: string; value: string; sub?: string; accent?: boolean; bad?: boolean }) {
  return (
    <div style={st.card}>
      <div style={st.cardLabel}>{label}</div>
      <div style={{ ...st.cardVal, ...(accent ? { color: 'var(--accent)' } : bad ? { color: 'var(--bad)' } : {}) }}>{value}</div>
      {sub ? <div style={st.cardSub}>{sub}</div> : null}
    </div>
  );
}

const st: Record<string, CSSProperties> = {
  page: { maxWidth: 1200, margin: '0 auto', padding: '28px 28px 64px' },
  h1: { fontSize: 28, margin: '0 0 6px', letterSpacing: -0.5 },
  sub: { color: 'var(--muted)', margin: '0 0 22px', maxWidth: 720, lineHeight: 1.5 },
  offline: { color: 'var(--muted)', padding: '18px 0' },
  cards: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10, marginBottom: 16 },
  card: { padding: '13px 16px', borderRadius: 12, border: '1px solid var(--border)', background: 'var(--panel)' },
  cardLabel: { fontSize: 10.5, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.5 },
  cardVal: { fontSize: 20, fontWeight: 800, marginTop: 4 },
  cardSub: { fontSize: 11, color: 'var(--muted)', marginTop: 3 },
  twoCol: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 14 },
  panel: { padding: 16 },
  h3: { fontSize: 14, fontWeight: 700, margin: '0 0 4px', display: 'flex', alignItems: 'center', gap: 8 },
  hint: { fontSize: 12, color: 'var(--muted)', margin: '0 0 12px' },
  count: { fontSize: 11, fontWeight: 700, color: 'var(--accent)', background: 'var(--accent-soft, rgba(247,178,59,.12))', borderRadius: 999, padding: '1px 8px' },
  muted: { color: 'var(--muted)', fontSize: 13, padding: '6px 0' },
  row: { display: 'flex', alignItems: 'center', gap: 12, padding: '9px 10px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--panel-2)', textDecoration: 'none', color: 'var(--text)' },
  qline: { display: 'flex', justifyContent: 'space-between', padding: '9px 0', borderBottom: '1px solid var(--border)', fontSize: 13 },
  links: { display: 'flex', gap: 14, marginTop: 12, flexWrap: 'wrap' },
  link: { color: 'var(--accent)', textDecoration: 'none', fontWeight: 600, fontSize: 13 },
};

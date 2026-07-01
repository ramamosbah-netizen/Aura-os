'use client';

import { type CSSProperties } from 'react';
import { BarList, Donut } from './charts';

interface Buckets { current: number; d1_30: number; d31_60: number; d61_90: number; d90_plus: number }
export interface FinanceDashboardData {
  ar: { totals: Buckets; grandTotal: number } | null;
  ap: { totals: Buckets; grandTotal: number } | null;
  pnl: { totalRevenue: number; totalExpenses: number; netProfit: number } | null;
  costCenters: { lines: { code: string; net: number }[] } | null;
}

const money = (n: number) => `AED ${Number(n).toLocaleString('en-AE', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

export default function FinanceDashboard({ data }: { data: FinanceDashboardData }) {
  const agingBars = (b?: Buckets) => b ? [
    { label: 'Current', value: b.current }, { label: '1–30', value: b.d1_30 }, { label: '31–60', value: b.d31_60 },
    { label: '61–90', value: b.d61_90 }, { label: '90+', value: b.d90_plus },
  ] : [];

  return (
    <div>
      <div style={s.kpis}>
        <Kpi label="Receivables (AR)" value={money(data.ar?.grandTotal ?? 0)} tone="var(--accent)" />
        <Kpi label="Payables (AP)" value={money(data.ap?.grandTotal ?? 0)} tone="var(--warn, #d9883b)" />
        <Kpi label="Revenue" value={money(data.pnl?.totalRevenue ?? 0)} tone="var(--good)" />
        <Kpi label="Net Profit" value={money(data.pnl?.netProfit ?? 0)} tone={(data.pnl?.netProfit ?? 0) >= 0 ? 'var(--good)' : 'var(--bad)'} />
      </div>

      <div style={s.grid}>
        <Card title="Receivables aging">
          <BarList data={agingBars(data.ar?.totals)} />
        </Card>
        <Card title="Payables aging">
          <BarList data={agingBars(data.ap?.totals)} />
        </Card>
        <Card title="P&L — revenue vs expenses">
          <Donut data={[{ label: 'Revenue', value: data.pnl?.totalRevenue ?? 0 }, { label: 'Expenses', value: data.pnl?.totalExpenses ?? 0 }]} />
        </Card>
        <Card title="Cost centres (net)">
          <BarList data={(data.costCenters?.lines ?? []).slice(0, 6).map((l) => ({ label: l.code, value: l.net }))} />
        </Card>
      </div>
    </div>
  );
}

function Kpi({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div style={s.kpi}>
      <div style={s.kpiLabel}>{label}</div>
      <div style={{ ...s.kpiValue, color: tone }}>{value}</div>
    </div>
  );
}
function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return <div style={s.card}><div style={s.cardTitle}>{title}</div>{children}</div>;
}

const s = {
  kpis: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 16 } as CSSProperties,
  kpi: { background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 16px' } as CSSProperties,
  kpiLabel: { color: 'var(--muted)', fontSize: 12.5 } as CSSProperties,
  kpiValue: { fontSize: 22, fontWeight: 700, letterSpacing: -0.4, marginTop: 4 } as CSSProperties,
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 12 } as CSSProperties,
  card: { background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 16px' } as CSSProperties,
  cardTitle: { fontSize: 13, fontWeight: 600, marginBottom: 12, color: 'var(--muted)' } as CSSProperties,
};

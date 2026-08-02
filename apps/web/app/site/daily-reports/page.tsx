import type { CSSProperties } from 'react';
import { getJson } from '@/lib/api';
import DailyReportClient, { type DailyReport, type LabourAllocation } from '../../../components/daily-report-client';

export const dynamic = 'force-dynamic';

export default async function DailyReportsPage() {
  const [reports, labour] = await Promise.all([
    getJson<DailyReport[]>('/api/site/daily-reports'),
    getJson<LabourAllocation[]>('/api/site/labour'),
  ]);

  return (
    <div style={st.page}>
      <h1 style={st.h1}>Site · Daily Reports &amp; Labour</h1>
      <p style={st.sub}>
        The foreman&rsquo;s daily diary — the day&rsquo;s work, manpower and plant on site, submitted as the
        record that backs progress claims and delay evidence. Log the labour return by trade below;
        man-hours roll up for productivity and payment.
      </p>
      <section style={{ marginTop: 10 }}>
        {reports === null ? <p style={st.muted}>API offline.</p> : <DailyReportClient reports={reports ?? []} labour={labour ?? []} />}
      </section>
    </div>
  );
}

const st = {
  page: { maxWidth: 1080, margin: '0 auto', padding: '28px 28px 64px' } as CSSProperties,
  h1: { fontSize: 28, margin: '0 0 6px', letterSpacing: -0.5 } as CSSProperties,
  sub: { color: 'var(--muted)', margin: '0 0 22px', maxWidth: 780, lineHeight: 1.5 } as CSSProperties,
  muted: { color: 'var(--muted)', padding: '14px 12px', margin: 0 } as CSSProperties,
};

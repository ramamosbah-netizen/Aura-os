import type { CSSProperties } from 'react';
import { getJson } from '@/lib/api';
import OpsDashboardClient, { type OpsSnapshot } from '@/components/ops-dashboard-client';

export const dynamic = 'force-dynamic';

export default async function OpsPage() {
  const data = await getJson<OpsSnapshot>('/api/admin/ops');

  return (
    <div style={st.page}>
      <h1 style={st.h1}>Administration · Operations</h1>
      <p style={st.sub}>
        Live health of the async plumbing — outbox delivery lag, dead-lettered events, and running
        counters for background jobs and webhook deliveries. Same data the Prometheus <code style={st.code}>/metrics</code> endpoint exposes.
      </p>
      {data === null ? (
        <p style={st.muted}>Ops API offline.</p>
      ) : (
        <OpsDashboardClient initial={data} />
      )}
    </div>
  );
}

const st = {
  page: { maxWidth: 1000, margin: '0 auto', padding: '28px 28px 64px' } as CSSProperties,
  h1: { fontSize: 28, margin: '0 0 6px', letterSpacing: -0.5 } as CSSProperties,
  sub: { color: 'var(--muted)', margin: '0 0 22px', maxWidth: 720, lineHeight: 1.5 } as CSSProperties,
  code: { fontFamily: 'ui-monospace, monospace', fontSize: 12.5, background: 'var(--panel-2)', border: '1px solid var(--border)', borderRadius: 5, padding: '1px 5px' } as CSSProperties,
  muted: { color: 'var(--muted)', padding: '14px 12px', margin: 0 } as CSSProperties,
};

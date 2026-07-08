import type { CSSProperties } from 'react';
import { getJson } from '@/lib/api';
import ConnectorsAdminClient, { type Connector } from '@/components/connectors-admin-client';

export const dynamic = 'force-dynamic';

export default async function ConnectorsPage() {
  const connectors = await getJson<Connector[]>('/api/admin/connectors');

  return (
    <div style={st.page}>
      <h1 style={st.h1}>Administration · Connectors</h1>
      <p style={st.sub}>
        Register connectors to external systems (ERP, e-invoicing, bank feeds). Matching events are
        mapped and pushed out. Auth secrets are write-only — they are stored but never shown here.
      </p>
      {connectors === null ? (
        <p style={st.muted}>Integration API offline.</p>
      ) : (
        <ConnectorsAdminClient initialConnectors={connectors} />
      )}
    </div>
  );
}

const st = {
  page: { maxWidth: 960, margin: '0 auto', padding: '28px 28px 64px' } as CSSProperties,
  h1: { fontSize: 28, margin: '0 0 6px', letterSpacing: -0.5 } as CSSProperties,
  sub: { color: 'var(--muted)', margin: '0 0 22px', maxWidth: 720, lineHeight: 1.5 } as CSSProperties,
  muted: { color: 'var(--muted)', padding: '14px 12px', margin: 0 } as CSSProperties,
};

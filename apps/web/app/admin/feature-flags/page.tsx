import type { CSSProperties } from 'react';
import { getJson } from '@/lib/api';
import FeatureFlagsAdminClient, { type FeatureFlag } from '@/components/feature-flags-admin-client';

export const dynamic = 'force-dynamic';

export default async function FeatureFlagsPage() {
  const flags = await getJson<FeatureFlag[]>('/api/admin/feature-flags');

  return (
    <div style={st.page}>
      <h1 style={st.h1}>Administration · Feature Flags</h1>
      <p style={st.sub}>
        Toggle staged and rolled-out capabilities. A flag has a default state plus optional per-tenant
        overrides — the server checks it via <code style={st.code}>isEnabled(flag, tenant)</code>.
      </p>
      {flags === null ? (
        <p style={st.muted}>Config API offline.</p>
      ) : (
        <FeatureFlagsAdminClient initialFlags={flags} />
      )}
    </div>
  );
}

const st = {
  page: { maxWidth: 900, margin: '0 auto', padding: '28px 28px 64px' } as CSSProperties,
  h1: { fontSize: 28, margin: '0 0 6px', letterSpacing: -0.5 } as CSSProperties,
  sub: { color: 'var(--muted)', margin: '0 0 22px', maxWidth: 720, lineHeight: 1.5 } as CSSProperties,
  code: { fontFamily: 'ui-monospace, monospace', fontSize: 12.5, background: 'var(--panel-2)', border: '1px solid var(--border)', borderRadius: 5, padding: '1px 5px' } as CSSProperties,
  muted: { color: 'var(--muted)', padding: '14px 12px', margin: 0 } as CSSProperties,
};

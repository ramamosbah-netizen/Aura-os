import type { CSSProperties } from 'react';
import { getJson } from '@/lib/api';
import SettingsAdminClient, { type TenantSetting } from '@/components/settings-admin-client';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const settings = await getJson<TenantSetting[]>('/api/admin/settings');

  return (
    <div style={st.page}>
      <h1 style={st.h1}>Administration · Settings</h1>
      <p style={st.sub}>
        Organisation-level configuration as key/value pairs (e.g. <code style={st.code}>company.name</code>,{' '}
        <code style={st.code}>finance.defaultCurrency</code>). Modules read these to adapt behaviour per tenant.
      </p>
      {settings === null ? (
        <p style={st.muted}>Settings API offline.</p>
      ) : (
        <SettingsAdminClient initialSettings={settings} />
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

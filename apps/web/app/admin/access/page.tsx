import type { CSSProperties } from 'react';
import { getJson } from '@/lib/api';
import RolesAdminClient from '@/components/roles-admin-client';

export const dynamic = 'force-dynamic';

interface Role {
  id: string;
  name: string;
  permissions: string[];
}
interface Grant {
  userId: string;
  roleId: string;
  scope: { kind: string; level?: string; id?: string };
}
interface Overview {
  roles: Role[];
  grants: Grant[];
}

export default async function AccessAdminPage() {
  const data = await getJson<Overview>('/api/admin/access');

  return (
    <div style={st.page}>
      <h1 style={st.h1}>Administration · Roles &amp; Access</h1>
      <p style={st.sub}>
        Roles are named bundles of permission patterns (e.g. <code style={st.code}>procurement.*</code>,{' '}
        <code style={st.code}>finance.invoice.approve</code>). Grant them to users here — this is exactly what the
        API&apos;s permission guard enforces once authentication is turned on.
      </p>
      {data === null ? (
        <p style={st.muted}>Access API offline.</p>
      ) : (
        <RolesAdminClient initialRoles={data.roles ?? []} initialGrants={data.grants ?? []} />
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

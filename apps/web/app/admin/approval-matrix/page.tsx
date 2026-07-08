import type { CSSProperties } from 'react';
import { getJson } from '@/lib/api';
import ApprovalMatrixClient, { type ApprovalRule } from '@/components/approval-matrix-client';

export const dynamic = 'force-dynamic';

export default async function ApprovalMatrixPage() {
  const data = await getJson<{ entityType: string; rules: ApprovalRule[] }>('/api/admin/approval-matrix?entityType=purchase-request');

  return (
    <div style={st.page}>
      <h1 style={st.h1}>Administration · Approval Matrix</h1>
      <p style={st.sub}>
        Ordered approval rules per entity type. At runtime the first rule whose conditions all match
        decides who must approve and how many. Lower <code style={st.code}>order</code> is evaluated first —
        put a catch-all default last.
      </p>
      {data === null ? (
        <p style={st.muted}>Approval API offline.</p>
      ) : (
        <ApprovalMatrixClient initialEntityType={data.entityType} initialRules={data.rules ?? []} />
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

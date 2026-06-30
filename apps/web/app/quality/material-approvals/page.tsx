import type { CSSProperties } from 'react';
import { getJson } from '@/lib/api';
import MarClient from '../../../components/mar-client';

export const dynamic = 'force-dynamic';

interface MaterialApproval {
  id: string;
  projectId: string;
  reference: string;
  materialName: string;
  manufacturer: string;
  supplier: string;
  discipline: string;
  status: string;
  revision: number;
  reviewComments: string;
}

export default async function MarPage() {
  const mars = await getJson<MaterialApproval[]>('/api/quality/material-approvals');

  return (
    <div style={st.page}>
      <h1 style={st.h1}>Quality · Material Approval Requests</h1>
      <p style={st.sub}>
        Submit a proposed material (manufacturer, spec, supplier) for consultant approval before
        procurement/installation. Flow: draft → submitted → approved / approved-as-noted / rejected.
        A rejected or approved-as-noted MAR can be revised and resubmitted (revision bumps).
      </p>
      <section style={{ marginTop: 10 }}>
        {mars === null ? <p style={st.muted}>API offline.</p> : <MarClient initialMars={mars ?? []} />}
      </section>
    </div>
  );
}

const st = {
  page: { maxWidth: 1040, margin: '0 auto', padding: '28px 28px 64px' } as CSSProperties,
  h1: { fontSize: 28, margin: '0 0 6px', letterSpacing: -0.5 } as CSSProperties,
  sub: { color: 'var(--muted)', margin: '0 0 22px', maxWidth: 740, lineHeight: 1.5 } as CSSProperties,
  muted: { color: 'var(--muted)', padding: '14px 12px', margin: 0 } as CSSProperties,
};

import type { CSSProperties } from 'react';
import { getJson } from '@/lib/api';
import ComplianceClient from '../../components/compliance-client';

export const dynamic = 'force-dynamic';

/**
 * Authority compliance (G-20 / ADR-0018).
 *
 * ONE page for every authority. SIRA and DCD are rows in the authority list and the register
 * filters by them — a SIRA screen and a DCD screen would be two lists that disagree, which is the
 * mistake the Compliance Core exists to avoid.
 */
export default async function CompliancePage() {
  const [authorities, cases, renewals] = await Promise.all([
    getJson<Array<Record<string, never>>>('/api/compliance/authorities'),
    getJson<Array<Record<string, never>>>('/api/compliance/cases'),
    getJson<Array<Record<string, never>>>('/api/compliance/renewals?withinDays=90'),
  ]);

  return (
    <div style={st.page}>
      <h1 style={st.h1}>Compliance</h1>
      <p style={st.sub}>
        Statutory approvals and their certificates — submissions, inspections, decisions and renewals,
        tracked per authority. Ships with no regulatory rules: what each authority requires is loaded
        from its own published requirements, never assumed.
      </p>
      <ComplianceClient
        initialAuthorities={(authorities ?? []) as never}
        initialCases={(cases ?? []) as never}
        initialRenewals={(renewals ?? []) as never}
      />
    </div>
  );
}

const st = {
  page: { padding: '20px 24px 40px', display: 'flex', flexDirection: 'column', gap: 8 } as CSSProperties,
  h1: { fontSize: 22, fontWeight: 800, margin: 0 } as CSSProperties,
  sub: { fontSize: 13, color: 'var(--muted)', margin: '0 0 8px', maxWidth: 760, lineHeight: 1.6 } as CSSProperties,
};

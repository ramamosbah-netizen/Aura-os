import type { CSSProperties } from 'react';
import { getJson } from '@/lib/api';
import SubVariationsClient from '../../../components/sub-variations-client';

export const dynamic = 'force-dynamic';

interface Subcontract { id: string; title: string; subcontractorName: string; value: number }
interface Variation {
  id: string;
  subcontractId: string;
  reference: string;
  type: string;
  amount: number;
  description: string;
  status: string;
}

export default async function SubVariationsPage() {
  const [variations, subcontracts] = await Promise.all([
    getJson<Variation[]>('/api/subcontracts/variations'),
    getJson<Subcontract[]>('/api/subcontracts'),
  ]);

  return (
    <div style={st.page}>
      <h1 style={st.h1}>Subcontracts · Variations</h1>
      <p style={st.sub}>
        Variation orders against a subcontract — additions (extra work) or omissions (scope removed).
        Pending → approved | rejected; approving applies the signed amount to the subcontract&apos;s value.
      </p>
      <section style={{ marginTop: 10 }}>
        {variations === null ? (
          <p style={st.muted}>API offline.</p>
        ) : (
          <SubVariationsClient initialVariations={variations ?? []} subcontracts={subcontracts ?? []} />
        )}
      </section>
    </div>
  );
}

const st = {
  page: { maxWidth: 1040, margin: '0 auto', padding: '28px 28px 64px' } as CSSProperties,
  h1: { fontSize: 28, margin: '0 0 6px', letterSpacing: -0.5 } as CSSProperties,
  sub: { color: 'var(--muted)', margin: '0 0 22px', maxWidth: 720, lineHeight: 1.5 } as CSSProperties,
  muted: { color: 'var(--muted)', padding: '14px 12px', margin: 0 } as CSSProperties,
};

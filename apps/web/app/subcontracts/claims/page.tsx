import type { CSSProperties } from 'react';
import { getJson } from '@/lib/api';
import SubcontractClaimsClient, { type Claim, type Subcontract } from '../../../components/subcontract-claims-client';

export const dynamic = 'force-dynamic';

export default async function SubcontractClaimsPage() {
  const [claims, subcontracts] = await Promise.all([
    getJson<Claim[]>('/api/subcontracts/claims'),
    getJson<Subcontract[]>('/api/subcontracts'),
  ]);

  return (
    <div style={st.page}>
      <h1 style={st.h1}>Subcontracts · Progress Claims</h1>
      <p style={st.sub}>
        Raise a subcontractor payment claim against cumulative work done. The period gross (this
        claim minus what was previously certified), the retention withheld, and the net payable are
        computed automatically — then <b>certify</b> the valuation and <b>pay</b>. Retention-release
        claims settle the held-back balance at the end.
      </p>
      <section style={{ marginTop: 10 }}>
        {claims === null ? <p style={st.muted}>API offline.</p> : <SubcontractClaimsClient initial={claims ?? []} subcontracts={subcontracts ?? []} />}
      </section>
    </div>
  );
}

const st = {
  page: { maxWidth: 1080, margin: '0 auto', padding: '28px 28px 64px' } as CSSProperties,
  h1: { fontSize: 28, margin: '0 0 6px', letterSpacing: -0.5 } as CSSProperties,
  sub: { color: 'var(--muted)', margin: '0 0 22px', maxWidth: 800, lineHeight: 1.5 } as CSSProperties,
  muted: { color: 'var(--muted)', padding: '14px 12px', margin: 0 } as CSSProperties,
};

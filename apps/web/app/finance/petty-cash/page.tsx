import type { CSSProperties } from 'react';
import { getJson } from '@/lib/api';
import PettyCashClient from '../../../components/petty-cash-client';

export const dynamic = 'force-dynamic';

interface PettyCashFund {
  id: string;
  name: string;
  balance: number;
  status: string;
}

export default async function PettyCashPage() {
  const funds = await getJson<PettyCashFund[]>('/api/finance/petty-cash');

  return (
    <div style={st.page}>
      <h1 style={st.h1}>Finance · Petty Cash</h1>
      <p style={st.sub}>
        Imprest cash floats (per site / office). Top-ups replenish a float; expenses disburse against it,
        categorised and dated. The running balance can never go negative. Open a fund, then drill in to
        record movements and see its statement.
      </p>
      <section style={{ marginTop: 10 }}>
        {funds === null ? <p style={st.muted}>API offline.</p> : <PettyCashClient initialFunds={funds} />}
      </section>
    </div>
  );
}

const st = {
  page: { maxWidth: 980, margin: '0 auto', padding: '28px 28px 64px' } as CSSProperties,
  h1: { fontSize: 28, margin: '0 0 6px', letterSpacing: -0.5 } as CSSProperties,
  sub: { color: 'var(--muted)', margin: '0 0 22px', maxWidth: 700, lineHeight: 1.5 } as CSSProperties,
  muted: { color: 'var(--muted)', padding: '14px 12px', margin: 0 } as CSSProperties,
};

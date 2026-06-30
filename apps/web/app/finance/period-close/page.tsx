import type { CSSProperties } from 'react';
import { getJson } from '@/lib/api';
import PeriodCloseClient from '../../../components/period-close-client';

export const dynamic = 'force-dynamic';

interface PeriodClose {
  id: string;
  period: string;
  closedAt: string;
  closedBy: string | null;
  note: string | null;
}

export default async function PeriodClosePage() {
  const closes = await getJson<PeriodClose[]>('/api/finance/periods');

  return (
    <div style={st.page}>
      <h1 style={st.h1}>Finance · Period Close</h1>
      <p style={st.sub}>
        Lock a fiscal month so no further journals can be posted into it — the control that turns the
        ledger into a closed set of books. Reopening unlocks it. The journal poster enforces this on
        every entry.
      </p>
      <PeriodCloseClient initialCloses={closes ?? []} />
    </div>
  );
}

const st = {
  page: { maxWidth: 720, margin: '0 auto', padding: '28px 28px 64px' } as CSSProperties,
  h1: { fontSize: 28, margin: '0 0 6px', letterSpacing: -0.5 } as CSSProperties,
  sub: { color: 'var(--muted)', margin: '0 0 22px', maxWidth: 640, lineHeight: 1.5 } as CSSProperties,
};

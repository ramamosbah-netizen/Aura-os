import type { CSSProperties } from 'react';
import { getJson } from '@/lib/api';
import PostDatedChequesClient from '../../../components/post-dated-cheques-client';

export const dynamic = 'force-dynamic';

interface PostDatedCheque {
  id: string;
  chequeNumber: string;
  direction: 'received' | 'issued';
  partyName: string;
  bankName: string;
  amount: number;
  currency: string;
  issueDate: string;
  maturityDate: string;
  status: 'pending' | 'deposited' | 'cleared' | 'bounced' | 'cancelled';
  reference: string | null;
  bounceCount: number;
}

export default async function PostDatedChequesPage() {
  const cheques = await getJson<PostDatedCheque[]>('/api/finance/post-dated-cheques');

  return (
    <div style={st.page}>
      <h1 style={st.h1}>Finance · Post-Dated Cheques</h1>
      <p style={st.sub}>
        The PDC register. Track received cheques (customer receivables) and issued cheques (supplier
        payables) by maturity date. Move each through its life — deposit on maturity, then clear or
        bounce; re-present a bounced cheque or write it off. The list is ordered by maturity and flags
        cheques coming due within 7 days so they can be banked or funded in time.
      </p>
      <section style={{ marginTop: 10 }}>
        {cheques === null ? <p style={st.muted}>API offline.</p> : <PostDatedChequesClient initialCheques={cheques} />}
      </section>
    </div>
  );
}

const st = {
  page: { maxWidth: 1080, margin: '0 auto', padding: '28px 28px 64px' } as CSSProperties,
  h1: { fontSize: 28, margin: '0 0 6px', letterSpacing: -0.5 } as CSSProperties,
  sub: { color: 'var(--muted)', margin: '0 0 22px', maxWidth: 760, lineHeight: 1.5 } as CSSProperties,
  muted: { color: 'var(--muted)', padding: '14px 12px', margin: 0 } as CSSProperties,
};

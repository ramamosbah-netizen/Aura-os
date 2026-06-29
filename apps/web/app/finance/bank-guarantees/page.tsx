import type { CSSProperties } from 'react';
import { getJson } from '@/lib/api';
import BankGuaranteesClient from '../../../components/bank-guarantees-client';

export const dynamic = 'force-dynamic';

interface BankGuarantee {
  id: string;
  reference: string;
  type: string;
  beneficiary: string;
  bankName: string;
  projectName: string | null;
  amount: number;
  currency: string;
  issueDate: string;
  expiryDate: string;
  status: string;
}

export default async function BankGuaranteesPage() {
  const guarantees = await getJson<BankGuarantee[]>('/api/finance/bank-guarantees');

  return (
    <div style={st.page}>
      <h1 style={st.h1}>Finance · Bank Guarantees</h1>
      <p style={st.sub}>
        Tender, performance, advance-payment and retention bonds issued by your banks to clients. Track
        amount, beneficiary, and expiry; release (returned), claim (called), or expire each. The list is
        ordered by expiry and flags instruments expiring within 30 days so they can be renewed or returned.
      </p>
      <section style={{ marginTop: 10 }}>
        {guarantees === null ? <p style={st.muted}>API offline.</p> : <BankGuaranteesClient initialGuarantees={guarantees} />}
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

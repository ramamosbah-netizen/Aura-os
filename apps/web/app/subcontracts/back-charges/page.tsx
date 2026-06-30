import type { CSSProperties } from 'react';
import { getJson } from '@/lib/api';
import BackChargesClient from '../../../components/back-charges-client';

export const dynamic = 'force-dynamic';

interface Subcontract {
  id: string;
  title: string;
  subcontractorName: string;
  status: 'draft' | 'active' | 'closed';
}

interface BackCharge {
  id: string;
  subcontractId: string;
  subcontractorName: string | null;
  reference: string;
  category: string;
  description: string;
  grossAmount: number;
  markupPercent: number;
  markupAmount: number;
  recoverableAmount: number;
  recoveredAmount: number;
  outstandingAmount: number;
  status: 'raised' | 'agreed' | 'disputed' | 'recovered' | 'written_off';
  createdAt: string;
}

export default async function BackChargesPage() {
  const [subcontracts, backCharges] = await Promise.all([
    getJson<Subcontract[]>('/api/subcontracts'),
    getJson<BackCharge[]>('/api/subcontracts/back-charges'),
  ]);

  const online = subcontracts !== null && backCharges !== null;

  return (
    <div style={st.page}>
      <h1 style={st.h1}>Subcontractor Back-Charges</h1>
      <p style={st.sub}>
        Charge costs back to a subcontractor — materials or plant supplied on their behalf,
        rectification of defective work, attendance — with an admin handling markup, then recover
        the agreed amounts from their certified claims.
      </p>

      {!online ? (
        <section style={st.panelOffline}>
          <h2 style={{ margin: 0, fontSize: 16 }}>API offline</h2>
          <p style={{ color: 'var(--muted)', margin: '6px 0 0' }}>
            Please make sure the backend API server is running.
          </p>
        </section>
      ) : (
        <BackChargesClient subcontracts={subcontracts || []} initialBackCharges={backCharges || []} />
      )}
    </div>
  );
}

const st = {
  page: { maxWidth: 980, margin: '0 auto', padding: '28px 28px 64px' } as CSSProperties,
  h1: { fontSize: 28, margin: '0 0 6px', letterSpacing: -0.5 } as CSSProperties,
  sub: { color: 'var(--muted)', margin: '0 0 22px', maxWidth: 660, lineHeight: 1.5 } as CSSProperties,
  panelOffline: {
    background: 'var(--panel)',
    border: '1px solid var(--border)',
    borderRadius: 14,
    padding: '20px 24px',
  } as CSSProperties,
};

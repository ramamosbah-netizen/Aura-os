import type { CSSProperties } from 'react';
import { getJson } from '@/lib/api';
import RecordChrome from '../../../../components/record-chrome';
import Contract360Client from '../../../../components/contract-360-client';

export const dynamic = 'force-dynamic';

interface Contract {
  id: string;
  title: string;
  reference: string | null;
  tenderId: string | null;
  tenderTitle: string | null;
  accountId: string | null;
  accountName: string | null;
  status: string;
  value: number;
  createdAt: string;
}

/**
 * Contract 360 — where the deal chain closes: workflow (sign → project),
 * obligations & milestones, bonds/guarantees with expiry watch, and IPCs.
 */
export default async function ContractDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const contract = await getJson<Contract>(`/api/contracts/contracts/${id}`);

  if (!contract) {
    return (
      <div style={st.container}>
        <h1 style={st.h1}>Contract Not Found</h1>
        <a href="/contracts/contracts" style={st.link}>← Back to Contracts</a>
      </div>
    );
  }

  return (
    <div style={st.container}>
      <RecordChrome type="Contract" title={contract.title} />
      <div style={st.navRow}>
        <a href="/contracts/contracts" style={st.link}>← Back to Contracts</a>
      </div>
      <Contract360Client contract={contract} />
    </div>
  );
}

const st = {
  container: { maxWidth: 1180, margin: '0 auto', padding: '28px 28px 64px' } as CSSProperties,
  h1: { fontSize: 24, margin: '0 0 10px', color: 'var(--accent)' } as CSSProperties,
  navRow: { marginBottom: 14 } as CSSProperties,
  link: { color: 'var(--accent)', textDecoration: 'none', fontSize: 14, fontWeight: 500 } as CSSProperties,
};

import type { CSSProperties } from 'react';
import { getJson } from '@/lib/api';
import WorkCenter from '../../components/work-center';

export const dynamic = 'force-dynamic';

interface PurchaseRequest {
  id: string;
  title: string;
  reference: string | null;
  projectName: string | null;
  status: 'draft' | 'approved' | 'rejected';
  value: number;
}
interface Invoice {
  id: string;
  title: string;
  poTitle: string | null;
  projectName: string | null;
  status: string;
  value: number;
}
interface Subcontract {
  id: string;
  title: string;
  subcontractorName: string;
  projectName: string | null;
  status: string;
  value: number;
}
interface Claim {
  id: string;
  subcontractId: string;
  workCompletedValue: number;
  certifiedValue: number | null;
  status: string;
  createdAt: string;
}
interface BankAccount {
  id: string;
  code: string;
  name: string;
}

// Universal Inbox — every pending approval and action across the platform in one
// queue, so a manager can clear their day without opening each module. Reuses the
// WorkCenter engine that already knows how to approve/pay/certify each item type.
export default async function InboxPage() {
  const [purchaseRequests, invoices, subcontracts, claims, bankAccounts] = await Promise.all([
    getJson<PurchaseRequest[]>('/api/procurement/purchase-requests'),
    getJson<Invoice[]>('/api/finance/invoices'),
    getJson<Subcontract[]>('/api/subcontracts/subcontracts'),
    getJson<Claim[]>('/api/subcontracts/claims'),
    getJson<BankAccount[]>('/api/finance/accounts?type=asset'),
  ]);

  const online =
    purchaseRequests !== null || invoices !== null || subcontracts !== null || claims !== null;

  const pending =
    (purchaseRequests ?? []).filter((p) => p.status === 'draft').length +
    (invoices ?? []).filter((i) => i.status === 'draft' || i.status === 'approved').length +
    (subcontracts ?? []).filter((s) => s.status === 'draft').length +
    (claims ?? []).filter((c) => c.status === 'draft' || c.status === 'certified').length;

  return (
    <div style={st.page}>
      <div style={st.titleRow}>
        <h1 style={st.h1}>Inbox</h1>
        {online && (
          <span style={st.badge}>{pending} pending</span>
        )}
      </div>
      <p style={st.sub}>
        Everything waiting on you — purchase requests, invoices, subcontracts and claims — in one
        approval queue. Act here without opening each module.
      </p>

      {!online ? (
        <p style={st.muted}>API offline.</p>
      ) : (
        <WorkCenter
          purchaseRequests={purchaseRequests ?? []}
          invoices={invoices ?? []}
          subcontracts={subcontracts ?? []}
          claims={claims ?? []}
          bankAccounts={bankAccounts ?? []}
        />
      )}
    </div>
  );
}

const st = {
  page: { maxWidth: 1040, margin: '0 auto', padding: '28px 28px 64px' } as CSSProperties,
  titleRow: { display: 'flex', alignItems: 'center', gap: 12 } as CSSProperties,
  h1: { fontSize: 28, margin: '0 0 6px', letterSpacing: -0.5 } as CSSProperties,
  badge: {
    fontSize: 12.5,
    fontWeight: 600,
    background: 'var(--accent)',
    color: '#0b0e14',
    borderRadius: 999,
    padding: '3px 10px',
  } as CSSProperties,
  sub: { color: 'var(--muted)', margin: '0 0 18px', maxWidth: 720, lineHeight: 1.5 } as CSSProperties,
  muted: { color: 'var(--muted)', padding: '14px 0', margin: 0 } as CSSProperties,
};

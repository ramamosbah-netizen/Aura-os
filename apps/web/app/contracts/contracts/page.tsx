import type { CSSProperties } from 'react';
import { getJson } from '@/lib/api';
import ContractsRegisterClient from '../../../components/contracts-register-client';

export const dynamic = 'force-dynamic';

interface Contract {
  id: string;
  title: string;
  reference: string | null;
  tenderId: string | null;
  accountId: string | null;
  accountName: string | null;
  status: string;
  value: number;
  createdAt: string;
}
interface Tender { id: string; title: string; accountId: string | null; accountName: string | null; value: number; }
interface Bond { id: string; contractId: string; kind: string; expiryDate: string | null; status: string; }
interface ProjectLite { id: string; contractId: string | null; title: string; status: string; }

export default async function ContractsPage() {
  const [contracts, wonTenders, bonds, projects] = await Promise.all([
    getJson<Contract[]>('/api/contracts/contracts'),
    getJson<Tender[]>('/api/tendering/tenders?status=won'),
    getJson<Bond[]>('/api/contracts/bonds'),
    getJson<ProjectLite[]>('/api/projects/projects'),
  ]);

  return (
    <div style={st.page}>
      <h1 style={st.h1}>Contracts</h1>
      <p style={st.sub}>
        Awarded engagements — where the deal chain closes. Signing a contract creates its Project
        automatically; each row shows its chain (tender → project) and the bond watchlist.
      </p>
      <ContractsRegisterClient
        contracts={contracts ?? []}
        bonds={bonds ?? []}
        projects={projects ?? []}
        wonTenders={(wonTenders ?? []).map((t) => ({ id: t.id, title: t.title, accountId: t.accountId, accountName: t.accountName, value: t.value }))}
      />
    </div>
  );
}

const st = {
  page: { maxWidth: 1200, margin: '0 auto', padding: '28px 28px 64px' } as CSSProperties,
  h1: { fontSize: 28, margin: '0 0 6px', letterSpacing: -0.5 } as CSSProperties,
  sub: { color: 'var(--muted)', margin: '0 0 22px', maxWidth: 740, lineHeight: 1.5 } as CSSProperties,
};

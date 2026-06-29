import type { CSSProperties } from 'react';
import { getJson } from '@/lib/api';
import SubcontractCreate from '../../../components/subcontract-create';
import SubcontractsList from '../../../components/subcontracts-list';

export const dynamic = 'force-dynamic';

interface Project {
  id: string;
  title: string;
}

interface Subcontract {
  id: string;
  projectId: string;
  projectName: string | null;
  title: string;
  subcontractorName: string;
  status: 'draft' | 'active' | 'closed';
  value: number;
  retentionPercentage: number;
  createdAt: string;
}

interface Claim {
  id: string;
  subcontractId: string;
  claimNumber: number;
  status: 'draft' | 'submitted' | 'certified' | 'paid';
  workCompletedValue: number;
  previouslyCertifiedValue: number;
  thisPeriodGrossValue: number;
  retentionWithheld: number;
  netCertifiedValue: number;
  certifiedAt: string | null;
  certifiedBy: string | null;
  createdAt: string;
}

export default async function SubcontractsPage() {
  const [subcontracts, projects, claims] = await Promise.all([
    getJson<Subcontract[]>('/api/subcontracts'),
    getJson<Project[]>('/api/projects/projects'),
    getJson<Claim[]>('/api/subcontracts/claims'),
  ]);

  const online = subcontracts !== null && projects !== null && claims !== null;

  return (
    <div style={st.page}>
      <h1 style={st.h1}>Subcontracts</h1>
      <p style={st.sub}>
        Manage subcontractor trade agreements, track progressive valuations, and calculate 
        retaining balances (Interim Payment Certificates) connected with Delivery.
      </p>

      {!online ? (
        <section style={st.panelOffline}>
          <h2 style={{ margin: 0, fontSize: 16 }}>API offline</h2>
          <p style={{ color: 'var(--muted)', margin: '6px 0 0' }}>
            Please make sure the backend API server is running.
          </p>
        </section>
      ) : (
        <>
          <SubcontractCreate projects={projects || []} />
          <SubcontractsList subcontracts={subcontracts || []} claims={claims || []} />
        </>
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

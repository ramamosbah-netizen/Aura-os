import type { CSSProperties } from 'react';
import { getJson } from '@/lib/api';
import CertificatesClient, { type LockedContract } from '../../../components/payment-certificates-client';

export const dynamic = 'force-dynamic';

interface Contract {
  id: string;
  title: string;
  value: number;
  accountName: string | null;
  status: string;
}

interface Certificate {
  id: string;
  contractId: string;
  contractTitle: string | null;
  sequence: number;
  reference: string | null;
  grossToDate: number;
  retentionToDate: number;
  netThisCertificate: number;
  status: string;
  createdAt: string;
}

interface ArInvoice { id: string; invoiceNumber: string; total: number; status: string }

interface ProjectRef { id: string; title: string; contractId: string | null }

export default async function CertificatesPage({ searchParams }: { searchParams: Promise<{ projectId?: string }> }) {
  const { projectId } = await searchParams;
  /**
   * OPENED FROM A PROJECT, IT IS THAT PROJECT'S CONTRACT (J5-02). The commercial workspace links here
   * with the project, and the screen used to ignore it and offer every contract in the tenant. The
   * project names its contract; the certificates listed are that contract's.
   */
  const project = projectId ? await getJson<ProjectRef>(`/api/projects/projects/${encodeURIComponent(projectId)}`) : null;
  const scopedContractId = project?.contractId ?? null;
  const [contracts, certificates, invoices] = await Promise.all([
    getJson<Contract[]>('/api/contracts/contracts'),
    getJson<Certificate[]>(scopedContractId ? `/api/contracts/certificates?contractId=${encodeURIComponent(scopedContractId)}` : '/api/contracts/certificates'),
    getJson<ArInvoice[]>('/api/finance/customer-invoices'),
  ]);
  const scopedContract = scopedContractId ? (contracts ?? []).find((c) => c.id === scopedContractId) ?? null : null;
  const lockedContract: LockedContract | null = project && scopedContract
    ? { id: scopedContract.id, title: scopedContract.title, projectId: project.id, projectName: project.title }
    : null;

  return (
    <div style={st.page}>
      <h1 style={st.h1}>Contracts · Interim Payment Certificates</h1>
      <p style={st.sub}>
        Raise progress claims against a contract — work done to date, materials on site, retention (capped),
        and advance recovery. Each certificate pays only the increment over the previous one; a certified IPC
        is the trigger to bill the client (AR).
      </p>
      <section style={{ marginTop: 10 }}>
        {projectId && !lockedContract && (
          <p style={st.warn} role="status">
            {project ? 'This project has no contract yet, so there is nothing to certify for it.' : 'The project could not be read.'} Showing every contract.
          </p>
        )}
        <CertificatesClient contracts={contracts ?? []} initialCertificates={certificates ?? []} arInvoices={invoices ?? []} lockedContract={lockedContract} />
      </section>
    </div>
  );
}

const st: Record<string, CSSProperties> = {
  page: { padding: '28px 32px', maxWidth: 1180, margin: '0 auto' },
  h1: { fontSize: 22, fontWeight: 700, margin: 0 },
  sub: { color: 'var(--muted)', fontSize: 14, marginTop: 6, maxWidth: 760, lineHeight: 1.5 },
  warn: { color: 'var(--warn)', fontSize: 13, margin: '0 0 10px' },
};

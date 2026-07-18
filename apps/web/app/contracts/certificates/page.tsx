import type { CSSProperties } from 'react';
import { getJson } from '@/lib/api';
import CertificatesClient from '../../../components/payment-certificates-client';

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

export default async function CertificatesPage() {
  const [contracts, certificates, invoices] = await Promise.all([
    getJson<Contract[]>('/api/contracts/contracts'),
    getJson<Certificate[]>('/api/contracts/certificates'),
    getJson<ArInvoice[]>('/api/finance/customer-invoices'),
  ]);

  return (
    <div style={st.page}>
      <h1 style={st.h1}>Contracts · Interim Payment Certificates</h1>
      <p style={st.sub}>
        Raise progress claims against a contract — work done to date, materials on site, retention (capped),
        and advance recovery. Each certificate pays only the increment over the previous one; a certified IPC
        is the trigger to bill the client (AR).
      </p>
      <section style={{ marginTop: 10 }}>
        <CertificatesClient contracts={contracts ?? []} initialCertificates={certificates ?? []} arInvoices={invoices ?? []} />
      </section>
    </div>
  );
}

const st: Record<string, CSSProperties> = {
  page: { padding: '28px 32px', maxWidth: 1180, margin: '0 auto' },
  h1: { fontSize: 22, fontWeight: 700, margin: 0 },
  sub: { color: 'var(--muted)', fontSize: 14, marginTop: 6, maxWidth: 760, lineHeight: 1.5 },
};

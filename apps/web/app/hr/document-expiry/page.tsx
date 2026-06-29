import type { CSSProperties } from 'react';
import { getJson } from '@/lib/api';
import DocumentExpiryClient from '../../../components/document-expiry-client';

export const dynamic = 'force-dynamic';

interface ExpiryItem {
  employeeId: string;
  employeeName: string;
  role: string;
  department: string;
  documentType: string;
  expiryDate: string;
  daysToExpiry: number;
  bucket: 'expired' | 'critical' | 'warning' | 'ok';
}
interface ExpiryReport {
  asOf: string;
  items: ExpiryItem[];
  counts: { expired: number; critical: number; warning: number; ok: number; total: number };
}

export default async function DocumentExpiryPage() {
  const report = await getJson<ExpiryReport>('/api/hr/document-expiry');

  return (
    <div style={st.page}>
      <h1 style={st.h1}>HR · Document Expiry</h1>
      <p style={st.sub}>
        Statutory document watch-list for the workforce — UAE residence visas and labour permits, bucketed by
        days to expiry so renewals (MoHRE / ICP) happen before a worker falls out of compliance.
      </p>
      <section style={{ marginTop: 10 }}>
        <DocumentExpiryClient
          initialItems={report?.items ?? []}
          counts={report?.counts ?? { expired: 0, critical: 0, warning: 0, ok: 0, total: 0 }}
          asOf={report?.asOf ?? ''}
        />
      </section>
    </div>
  );
}

const st: Record<string, CSSProperties> = {
  page: { padding: '28px 32px', maxWidth: 1100, margin: '0 auto' },
  h1: { fontSize: 22, fontWeight: 700, margin: 0 },
  sub: { color: 'var(--muted)', fontSize: 14, marginTop: 6, maxWidth: 760, lineHeight: 1.5 },
};

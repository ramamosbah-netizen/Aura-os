import type { CSSProperties } from 'react';
import { getJson } from '@/lib/api';
import RecordChrome from '../../../../components/record-chrome';
import Lead360Client from '../../../../components/lead-360-client';

export const dynamic = 'force-dynamic';

interface Lead { id: string; name: string; [k: string]: unknown }
interface Account { id: string; name: string }

/**
 * Lead 360 — the acquisition command center for a single lead. Qualification verdict,
 * conversion target (Account/Contact match), the ELV context of the job, timeline, and
 * every action (qualify, assess, assign, convert) in one place.
 */
export default async function LeadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [lead, qualification, accounts] = await Promise.all([
    getJson<Lead>(`/api/crm/leads/${id}`),
    getJson<Record<string, unknown>>(`/api/crm/leads/${id}/qualification`),
    getJson<Account[]>(`/api/crm/accounts`),
  ]);

  if (!lead) {
    return (
      <div style={st.container}>
        <h1 style={st.h1}>Lead Not Found</h1>
        <a href="/crm/leads" style={st.link}>← Back to Sales Pipeline</a>
      </div>
    );
  }

  return (
    <div style={st.container}>
      <RecordChrome type="Lead" title={lead.name} />
      <div style={st.navRow}>
        <a href="/crm/leads" style={st.link}>← Back to Sales Pipeline</a>
      </div>
      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
      <Lead360Client lead={lead as any} qualification={qualification as any} accounts={accounts ?? []} />
    </div>
  );
}

const st = {
  container: { maxWidth: 1180, margin: '0 auto', padding: '28px 28px 64px' } as CSSProperties,
  h1: { fontSize: 24, margin: '0 0 10px', color: 'var(--accent)' } as CSSProperties,
  navRow: { marginBottom: 14 } as CSSProperties,
  link: { color: 'var(--accent)', textDecoration: 'none', fontSize: 14, fontWeight: 500 } as CSSProperties,
};

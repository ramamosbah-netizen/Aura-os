import type { CSSProperties } from 'react';
import { getJson } from '@/lib/api';
import RecordChrome from '../../../../components/record-chrome';
import Opportunity360Client from '../../../../components/opportunity-360-client';
import BuyingJourneyPanel from '../../../../components/buying-journey-panel';
import DealDepthPanel from '../../../../components/deal-depth-panel';

export const dynamic = 'force-dynamic';

interface Opportunity { id: string; title: string; }

/**
 * Opportunity 360 — the deal command center. Qualification, stakeholders,
 * competitors, the direct-vs-tender route, and the full progression this deal
 * spawned along the chain (opportunity → tender? → quotation → contract → project).
 */
export default async function OpportunityDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const opp = await getJson<Opportunity>(`/api/crm/opportunities/${id}`);

  if (!opp) {
    return (
      <div style={st.container}>
        <h1 style={st.h1}>Opportunity Not Found</h1>
        <a href="/crm/leads" style={st.link}>← Back to Sales Pipeline</a>
      </div>
    );
  }

  return (
    <div style={st.container}>
      <RecordChrome type="Opportunity" title={opp.title} />
      <div style={st.navRow}>
        <a href="/crm/leads" style={st.link}>← Back to Sales Pipeline</a>
      </div>
      <Opportunity360Client opportunityId={opp.id} />
      <BuyingJourneyPanel opportunityId={opp.id} />
      <DealDepthPanel opportunityId={opp.id} />
    </div>
  );
}

const st = {
  container: { maxWidth: 1180, margin: '0 auto', padding: '28px 28px 64px' } as CSSProperties,
  h1: { fontSize: 24, margin: '0 0 10px', color: 'var(--accent)' } as CSSProperties,
  navRow: { marginBottom: 14 } as CSSProperties,
  link: { color: 'var(--accent)', textDecoration: 'none', fontSize: 14, fontWeight: 500 } as CSSProperties,
};

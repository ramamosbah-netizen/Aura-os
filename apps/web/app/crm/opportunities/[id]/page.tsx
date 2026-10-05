import type { CSSProperties } from 'react';
import { currentUser, getJson } from '@/lib/api';
import RecordChrome from '../../../../components/record-chrome';
import RecordCorrespondence from '../../../../components/record-correspondence';
import Opportunity360Client from '../../../../components/opportunity-360-client';
import Sales360Journey from '../../../../components/sales-360-journey';

export const dynamic = 'force-dynamic';

interface Opportunity { id: string; title: string; leadId?: string | null; tenderId?: string | null; executionType?: string | null }
interface QuoteRef { id: string; status: string; revision?: number; createdAt?: string }

/**
 * Opportunity 360 — the deal command center. Qualification, stakeholders,
 * competitors, the direct-vs-tender route, and the full progression this deal
 * spawned along the chain (opportunity → tender? → quotation → contract → project).
 */
export default async function OpportunityDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [opp, quotes] = await Promise.all([
    getJson<Opportunity>(`/api/crm/opportunities/${id}`),
    getJson<QuoteRef[]>(`/api/crm/quotations?sourceOpportunityId=${encodeURIComponent(id)}`),
  ]);
  // The deal's live offer: the latest revision that has not been superseded.
  const liveQuote = (quotes ?? []).filter((q) => q.status !== 'revised' && q.status !== 'cancelled')
    .sort((a, b) => (b.revision ?? 0) - (a.revision ?? 0))[0] ?? null;

  if (!opp) {
    return (
      <div style={st.container}>
        <h1 style={st.h1}>Opportunity Not Found</h1>
        <a href="/crm/pipeline" style={st.link}>← Back to Pipeline</a>
      </div>
    );
  }

  return (
    <div style={st.container}>
      <RecordChrome type="Opportunity" title={opp.title} />
      <RecordCorrespondence recordType="crm.opportunity" recordId={opp.id} label={opp.title} />
      <Sales360Journey current="opportunity" records={{
        lead: opp.leadId ? `/crm/leads/${opp.leadId}` : null,
        opportunity: `/crm/opportunities/${opp.id}`,
        scope: opp.tenderId ? `/tendering/tenders/${opp.tenderId}` : `/crm/opportunities/${opp.id}?area=study`,
        quotation: liveQuote ? `/crm/quotations/${liveQuote.id}` : null,
      }} />
      <div style={st.navRow}>
        <a href="/crm/pipeline" style={st.link}>← Back to Pipeline</a>
      </div>
      <Opportunity360Client opportunityId={opp.id} currentUserId={(await currentUser())?.sub ?? null} />
    </div>
  );
}

const st = {
  // Full-focus 360: no width cap — the record uses the whole screen (suite topbar suppressed for this
  // route in the app shell), consistent with Lead 360.
  container: { maxWidth: 'none', margin: '0 auto', padding: '24px 28px 64px' } as CSSProperties,
  h1: { fontSize: 24, margin: '0 0 10px', color: 'var(--accent)' } as CSSProperties,
  navRow: { marginBottom: 14 } as CSSProperties,
  link: { color: 'var(--accent)', textDecoration: 'none', fontSize: 14, fontWeight: 500 } as CSSProperties,
};

'use client';

import Link from 'next/link';
import { type CSSProperties } from 'react';
import CrmPipelineClient, { type View } from './crm-pipeline-client';

interface Lead { id: string; name: string; companyName: string | null; email: string | null; phone: string | null; status: string; source: string | null; createdAt: string }
interface Opportunity { id: string; leadId: string | null; accountId: string | null; accountName: string | null; title: string; value: number; stage: string; winProbability: number; closeDate: string | null; createdAt: string }
interface Account { id: string; name: string }

/** Dedicated read surface for forward-looking Forecast or explanatory Analytics. */
export default function SalesInsightWorkspace({ kind, view, leads, opportunities, accounts }: {
  kind: 'forecast' | 'analytics';
  view: View;
  leads: Lead[]; opportunities: Opportunity[]; accounts: Account[];
}) {
  const analytics = kind === 'analytics';
  return (
    <section aria-labelledby={`${kind}-title`}>
      <div style={st.heading}>
        <div>
          <div style={st.eyebrow}>CRM · SALES</div>
          <h1 id={`${kind}-title`} style={st.title}>{analytics ? 'Analytics' : 'Forecast'}</h1>
          <p style={st.subtitle}>{analytics ? 'Explain performance, sources, margin and executive exposure.' : 'Set expectations for what should close, when and with what confidence.'}</p>
        </div>
        <nav style={st.links} aria-label="Sales intelligence">
          <Link href="/crm/pipeline?view=board" style={st.link}>Opportunities</Link>
          <Link href="/crm/radar" style={st.link}>Radar</Link>
          {!analytics && <Link href="/crm/analytics?view=performance" style={st.link}>Analytics</Link>}
        </nav>
      </div>
      {analytics && (
        <nav style={st.subBar} aria-label="Analytics view">
          <Link href="/crm/analytics?view=performance" style={{ ...st.subTab, ...(view === 'analytics' ? st.subTabOn : {}) }}>Performance</Link>
          <Link href="/crm/analytics?view=sources" style={{ ...st.subTab, ...(view === 'sources' ? st.subTabOn : {}) }}>Sources &amp; margin</Link>
          <Link href="/crm/analytics?view=executive" style={{ ...st.subTab, ...(view === 'executive' ? st.subTabOn : {}) }}>Executive</Link>
        </nav>
      )}
      <CrmPipelineClient initialLeads={leads} initialOpportunities={opportunities} initialAccounts={accounts} view={view} />
    </section>
  );
}

const st: Record<string, CSSProperties> = {
  heading: { display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 16 },
  eyebrow: { color: 'var(--accent)', fontSize: 10.5, fontWeight: 800, letterSpacing: 1.2, marginBottom: 5 },
  title: { margin: 0, fontSize: 25, letterSpacing: -0.4 },
  subtitle: { margin: '5px 0 0', color: 'var(--muted)', fontSize: 13 },
  links: { display: 'flex', gap: 12, flexWrap: 'wrap' },
  link: { color: 'var(--accent)', fontSize: 12.5, fontWeight: 700, textDecoration: 'none' },
  subBar: { display: 'inline-flex', gap: 4, border: '1px solid var(--border)', borderRadius: 10, padding: 3, background: 'var(--panel)', marginBottom: 14 },
  subTab: { color: 'var(--muted)', fontSize: 12.5, fontWeight: 700, padding: '6px 13px', borderRadius: 8, textDecoration: 'none' },
  subTabOn: { color: 'var(--accent)', background: 'var(--panel-2)' },
};

'use client';

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
  // Analytics is a single read surface. Keep accepting the historical `?view=` values
  // for saved links, but compose Performance, Sources & margin, and Executive below one
  // page instead of making the user switch between competing tabs.
  const composedView: View = analytics ? 'allAnalytics' : view;
  return (
    <section aria-labelledby={`${kind}-title`}>
      <div style={st.heading}>
        <div>
          <div style={st.eyebrow}>CRM · SALES</div>
          <h1 id={`${kind}-title`} style={st.title}>{analytics ? 'Analytics' : 'Forecast'}</h1>
          <p style={st.subtitle}>{analytics ? 'Explain performance, sources, margin and executive exposure.' : 'Set expectations for what should close, when and with what confidence.'}</p>
        </div>
      </div>
      {analytics && (
        <div style={st.surfaceNote} role="note">
          <span style={st.surfaceDot} aria-hidden="true" />
          One analytics view · performance, sources, margin and executive context are shown together.
        </div>
      )}
      <CrmPipelineClient initialLeads={leads} initialOpportunities={opportunities} initialAccounts={accounts} view={composedView} showAuthoring={false} />
    </section>
  );
}

const st: Record<string, CSSProperties> = {
  heading: { display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 16 },
  eyebrow: { color: 'var(--accent)', fontSize: 10.5, fontWeight: 800, letterSpacing: 1.2, marginBottom: 5 },
  title: { margin: 0, fontSize: 25, letterSpacing: -0.4 },
  subtitle: { margin: '5px 0 0', color: 'var(--muted)', fontSize: 13 },
  surfaceNote: { display: 'flex', alignItems: 'center', gap: 8, width: 'fit-content', color: 'var(--muted)', fontSize: 12, marginBottom: 14, padding: '8px 11px', border: '1px solid var(--border)', borderRadius: 10, background: 'linear-gradient(135deg, var(--panel), var(--panel-2))' },
  surfaceDot: { width: 7, height: 7, borderRadius: 999, background: 'var(--accent)', boxShadow: '0 0 0 4px color-mix(in srgb, var(--accent) 14%, transparent)' },
};

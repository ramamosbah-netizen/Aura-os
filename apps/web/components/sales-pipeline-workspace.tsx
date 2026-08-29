'use client';

import { useSearchParams, usePathname, useRouter } from 'next/navigation';
import { type CSSProperties } from 'react';
import CrmPipelineClient from './crm-pipeline-client';

interface Lead {
  id: string; name: string; companyName: string | null; email: string | null;
  phone: string | null; status: string; source: string | null; createdAt: string;
}
interface Opportunity {
  id: string; leadId: string | null; accountId: string | null; accountName: string | null;
  title: string; value: number; stage: string; winProbability: number; closeDate: string | null;
  createdAt: string;
}
interface Account { id: string; name: string }

/**
 * Opportunities is the operational deal workspace. Board and List are display modes for the
 * same dataset; Forecast, Analytics and Radar have their own canonical routes and no longer
 * compete for space in this page's tab bar.
 */
export default function SalesPipelineWorkspace({ leads, opportunities, accounts }: {
  leads: Lead[]; opportunities: Opportunity[]; accounts: Account[];
}) {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const mode = params.get('view') === 'list' ? 'list' : 'board';

  const selectMode = (next: 'board' | 'list'): void => {
    if (pathname !== '/crm/pipeline') return;
    const query = new URLSearchParams(params.toString());
    query.delete('tab');
    query.set('view', next);
    router.push(`${pathname}?${query.toString()}`, { scroll: false });
  };

  return (
    <section aria-labelledby="opportunities-title">
      <div style={st.heading}>
        <div>
          <h1 id="opportunities-title" style={st.title}>Opportunities</h1>
          <p style={st.subtitle}>Work the same sales pipeline in a visual Board or a detailed List.</p>
        </div>
        <div style={st.modeBar} role="group" aria-label="Opportunities display mode">
          <button type="button" data-testid="pipeline-tab-board" aria-pressed={mode === 'board'}
            style={{ ...st.modeTab, ...(mode === 'board' ? st.modeTabOn : {}) }} onClick={() => selectMode('board')}>Board</button>
          <button type="button" data-testid="pipeline-tab-list" aria-pressed={mode === 'list'}
            style={{ ...st.modeTab, ...(mode === 'list' ? st.modeTabOn : {}) }} onClick={() => selectMode('list')}>List</button>
        </div>
      </div>
      <CrmPipelineClient
        initialLeads={leads}
        initialOpportunities={opportunities}
        initialAccounts={accounts}
        view={mode}
      />
    </section>
  );
}

const st: Record<string, CSSProperties> = {
  heading: { display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 16 },
  title: { margin: 0, fontSize: 25, letterSpacing: -0.4 },
  subtitle: { margin: '5px 0 0', color: 'var(--muted)', fontSize: 13 },
  modeBar: { display: 'inline-flex', gap: 3, border: '1px solid var(--border)', borderRadius: 9, padding: 3, background: 'var(--panel)' },
  modeTab: { border: 'none', background: 'transparent', color: 'var(--muted)', padding: '7px 14px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', borderRadius: 7 },
  modeTabOn: { background: 'var(--panel-2)', color: 'var(--accent)' },
};

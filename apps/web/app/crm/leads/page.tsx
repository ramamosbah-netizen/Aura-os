import type { CSSProperties } from 'react';
import { getJson } from '@/lib/api';
import CrmPipelineClient from '../../../components/crm-pipeline-client';

export const dynamic = 'force-dynamic';

interface Lead {
  id: string;
  name: string;
  companyName: string | null;
  email: string | null;
  phone: string | null;
  status: string;
  source: string | null;
  createdAt: string;
}

interface Opportunity {
  id: string;
  leadId: string | null;
  accountId: string | null;
  accountName: string | null;
  title: string;
  value: number;
  stage: string;
  winProbability: number;
  closeDate: string | null;
  createdAt: string;
}

interface Account {
  id: string;
  name: string;
}

export default async function CrmLeadsPage() {
  const [leads, opportunities, accounts] = await Promise.all([
    getJson<Lead[]>('/api/crm/leads'),
    getJson<Opportunity[]>('/api/crm/opportunities'),
    getJson<Account[]>('/api/crm/accounts'),
  ]);

  return (
    <div style={st.page}>
      <h1 style={st.h1}>CRM · Sales Pipeline</h1>
      <p style={st.sub}>
        Leads, Opportunities, and AI-powered forecasting — the full deal chain starts here.
        Stage changes on opportunities emit <code style={st.code}>crm.opportunity.stage_changed</code> on
        the spine. When an opportunity is won, a Tender is automatically created downstream.
      </p>

      <CrmPipelineClient
        initialLeads={leads ?? []}
        initialOpportunities={opportunities ?? []}
        initialAccounts={accounts ?? []}
      />
    </div>
  );
}

const st = {
  page: { maxWidth: 1200, margin: '0 auto', padding: '28px 28px 64px' } as CSSProperties,
  h1: { fontSize: 28, margin: '0 0 6px', letterSpacing: -0.5 } as CSSProperties,
  sub: { color: 'var(--muted)', margin: '0 0 22px', maxWidth: 740, lineHeight: 1.5 } as CSSProperties,
  code: {
    fontFamily: 'ui-monospace, monospace',
    fontSize: 12.5,
    background: 'var(--panel-2)',
    border: '1px solid var(--border)',
    borderRadius: 5,
    padding: '1px 5px',
  } as CSSProperties,
};

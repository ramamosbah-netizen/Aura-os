import type { CSSProperties } from 'react';
import { getJson } from '@/lib/api';
import CrmPipelineClient from '../../../components/crm-pipeline-client';
import LeadAttentionPanel, { type LeadCommand } from '../../../components/lead-attention-panel';

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
  const [leads, opportunities, accounts, leadCommand] = await Promise.all([
    getJson<Lead[]>('/api/crm/leads'),
    getJson<Opportunity[]>('/api/crm/opportunities'),
    getJson<Account[]>('/api/crm/accounts'),
    getJson<LeadCommand>('/api/crm/leads/command'),
  ]);

  return (
    <div style={st.page}>
      <h1 style={st.h1}>CRM · Sales Pipeline</h1>
      <p style={st.sub}>
        The full sales cycle: Lead → Qualified → Opportunity → Proposal → Negotiation → Won/Lost.
        After a win the deal chain is optional per deal — tender/estimation for bid work, or a
        direct quotation for direct sales, AMC renewals and variations.
      </p>

      <LeadAttentionPanel data={leadCommand ?? null} />

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

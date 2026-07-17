import type { CSSProperties } from 'react';
import { getJson } from '@/lib/api';
import SalesPipelineWorkspace from '../../../components/sales-pipeline-workspace';
import type { LeadCommand } from '../../../components/lead-attention-panel';
import type { RadarData } from '../../../components/signals-radar';

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
  const [leads, opportunities, accounts, leadCommand, radar] = await Promise.all([
    getJson<Lead[]>('/api/crm/leads'),
    getJson<Opportunity[]>('/api/crm/opportunities'),
    getJson<Account[]>('/api/crm/accounts'),
    getJson<LeadCommand>('/api/crm/leads/command'),
    getJson<RadarData>('/api/crm/signals/radar'),
  ]);

  return (
    <div style={st.page}>
      <h1 style={st.h1}>Sales Pipeline</h1>
      <p style={st.sub}>
        Signal → Lead → Opportunity → Won. Triage the Radar, work the Board, read the Analytics —
        one workspace for the whole acquisition cycle.
      </p>

      <SalesPipelineWorkspace
        leads={leads ?? []}
        opportunities={opportunities ?? []}
        accounts={accounts ?? []}
        leadCommand={leadCommand ?? null}
        radar={radar ?? null}
      />
    </div>
  );
}

const st = {
  page: { maxWidth: 1200, margin: '0 auto', padding: '28px 28px 64px' } as CSSProperties,
  h1: { fontSize: 28, margin: '0 0 6px', letterSpacing: -0.5 } as CSSProperties,
  sub: { color: 'var(--muted)', margin: '0 0 18px', maxWidth: 740, lineHeight: 1.5 } as CSSProperties,
};

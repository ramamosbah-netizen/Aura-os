import { currentUser, getJson } from '@/lib/api';
import SalesDashboard, {
  type SalesOpportunity,
  type SalesPipeline,
  type SalesQuote,
} from '@/components/sales-dashboard';

export const dynamic = 'force-dynamic';

// Sales Home — the Sales Operating System command center. Sales = Lead → Opportunity → Client →
// Quote → Won. Every figure is READ from live CRM endpoints. Tendering/Estimation live in Pre-Award,
// Comms in Communication, Approvals in My Work — shown in context here, never re-owned.

interface LeadLite { id: string }
interface RadarSummary { total: number; open: number; new: number; reviewing: number; researching: number; promoted: number; dismissed: number; highPotential: number }

function displayName(subject: string | undefined): string {
  const base = subject?.replace(/^u-/, '').replace(/[-_.]+/g, ' ').trim();
  return base ? base.replace(/\b\w/g, (character) => character.toUpperCase()) : 'AURA User';
}

export default async function SalesHomePage() {
  const user = await currentUser();
  const [pipeline, quotes, opportunities, leads, radar] = await Promise.all([
    getJson<SalesPipeline>('/api/crm/opportunities/pipeline'),
    getJson<SalesQuote[]>('/api/crm/quotations'),
    getJson<SalesOpportunity[]>('/api/crm/opportunities'),
    getJson<LeadLite[]>('/api/crm/leads'),
    getJson<{ summary: RadarSummary }>('/api/crm/signals/radar/summary'),
  ]);

  return (
    <SalesDashboard
      userName={displayName(user?.sub)}
      pipeline={pipeline}
      quotes={quotes}
      opportunities={opportunities}
      leadCount={leads ? leads.length : null}
      radarSummary={radar?.summary ?? null}
    />
  );
}

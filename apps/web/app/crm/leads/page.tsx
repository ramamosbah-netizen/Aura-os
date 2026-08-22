import { getJson } from '@/lib/api';
import LeadsWorkspace, { type LeadRow } from '@/components/leads-workspace';

export const dynamic = 'force-dynamic';

// Leads — the Lead OS: capture, qualify (New → Contacted → Qualifying → Qualified → Disqualified),
// and Convert. A lead is a separate entity from an opportunity; the combined deal board is Pipeline.
export default async function CrmLeadsPage() {
  const leads = await getJson<LeadRow[]>('/api/crm/leads');
  return <LeadsWorkspace leads={leads ?? []} />;
}

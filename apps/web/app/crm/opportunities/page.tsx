import { redirect } from 'next/navigation';

// Opportunities are worked inside the Pipeline workspace (Board/List), not a separate register —
// consolidated to remove duplication. The Opportunity 360 lives at /crm/opportunities/[id].
export default function OpportunitiesRedirect() {
  redirect('/crm/pipeline');
}

import { currentUser, getJson } from '@/lib/api';
import PreAwardDashboard, {
  type PreAwardAnalytics,
  type Tender,
} from '@/components/pre-award-dashboard';

export const dynamic = 'force-dynamic';

// Pre-Award Home — the suite front door on the shared SuiteDashboardShell (My Work parity).
// Pre-Award = win the work: Tender → Bid/No-Bid → Estimation & Pricing → Submission → Win/Loss.
// Figures are READ live from `/api/tendering/tenders` and `/api/tendering/outcomes/analytics`.

function displayName(subject: string | undefined): string {
  const base = subject?.replace(/^u-/, '').replace(/[-_.]+/g, ' ').trim();
  return base ? base.replace(/\b\w/g, (character) => character.toUpperCase()) : 'AURA User';
}

export default async function PreAwardHomePage() {
  const user = await currentUser();
  const [tenders, analytics] = await Promise.all([
    getJson<Tender[]>('/api/tendering/tenders'),
    getJson<PreAwardAnalytics>('/api/tendering/outcomes/analytics'),
  ]);

  return <PreAwardDashboard userName={displayName(user?.sub)} tenders={tenders} analytics={analytics} />;
}

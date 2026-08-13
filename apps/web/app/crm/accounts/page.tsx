import { fetchJson, currentUser } from '@/lib/api';
import DataStateNotice from '@/components/ui/data-state';
import AccountsPortfolioClient, { type PortfolioRow } from '../../../components/accounts-portfolio-client';

export const dynamic = 'force-dynamic';

// Accounts = the ACCOUNT PORTFOLIO — every commercial relationship with its
// full roll-up (deals, pipeline, contracts, projects, AR, health), not a
// customer register. The API composes it in one call; smart views + KPIs are
// derived client-side from the same rows.
export default async function AccountsPage() {
  const [result, user] = await Promise.all([
    fetchJson<PortfolioRow[]>('/api/crm/accounts/portfolio'),
    currentUser(),
  ]);

  // The portfolio is the head of the deal chain. Rendering a failed read as an empty portfolio
  // tells an account manager they have no customers.
  if (!result.ok) return <DataStateNotice error={result.error} subject="the account portfolio" />;

  return <AccountsPortfolioClient rows={result.data ?? []} currentUserId={user?.sub ?? null} />;
}

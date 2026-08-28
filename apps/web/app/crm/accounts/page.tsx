import { fetchJson, currentUser } from '@/lib/api';
import DataStateNotice from '@/components/ui/data-state';
import AccountsPortfolioClient, { type PortfolioPage } from '../../../components/accounts-portfolio-client';

export const dynamic = 'force-dynamic';

// Legacy deep-link for the Accounts register. Keep the route stable, but use the
// same bounded portfolio contract as Customers so this page never loads the
// legacy tenant-wide projection into the browser.
export default async function AccountsPage() {
  const [result, user] = await Promise.all([
    fetchJson<PortfolioPage>('/api/crm/accounts/portfolio/paged?limit=50&offset=0'),
    currentUser(),
  ]);

  // The portfolio is the head of the deal chain. Rendering a failed read as an empty portfolio
  // tells an account manager they have no customers.
  if (!result.ok) return <DataStateNotice error={result.error} subject="the account portfolio" />;

  return <AccountsPortfolioClient initialPage={result.data} currentUserId={user?.sub ?? null} />;
}

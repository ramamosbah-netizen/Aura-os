import { getJson, currentUser } from '@/lib/api';
import AccountsPortfolioClient, { type PortfolioRow } from '../../../components/accounts-portfolio-client';

export const dynamic = 'force-dynamic';

// Accounts = the ACCOUNT PORTFOLIO — every commercial relationship with its
// full roll-up (deals, pipeline, contracts, projects, AR, health), not a
// customer register. The API composes it in one call; smart views + KPIs are
// derived client-side from the same rows.
export default async function AccountsPage() {
  const [rows, user] = await Promise.all([
    getJson<PortfolioRow[]>('/api/crm/accounts/portfolio'),
    currentUser(),
  ]);

  return <AccountsPortfolioClient rows={rows} currentUserId={user?.sub ?? null} />;
}

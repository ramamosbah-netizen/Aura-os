import { fetchJson, currentUser } from '@/lib/api';
import DataStateNotice from '@/components/ui/data-state';
import CustomersWorkspaceClient, { type CustomerContact, type CustomerAccount, type CustomerPortfolioPage } from '@/components/customers-workspace-client';

export const dynamic = 'force-dynamic';

/**
 * Customers is the CRM entry point for the two related, but distinct, master
 * records. Accounts and Contacts keep their own 360 pages and APIs; this page
 * only gives users one coherent workspace to find either one.
 */
export default async function CustomersPage() {
  const [portfolioResult, contactsResult, accountsResult, user] = await Promise.all([
    fetchJson<CustomerPortfolioPage>('/api/crm/accounts/portfolio/paged?limit=50&offset=0'),
    fetchJson<CustomerContact[]>('/api/crm/contacts'),
    fetchJson<CustomerAccount[]>('/api/crm/accounts'),
    currentUser(),
  ]);

  if (!portfolioResult.ok) return <DataStateNotice error={portfolioResult.error} subject="the customer accounts" />;
  if (!contactsResult.ok) return <DataStateNotice error={contactsResult.error} subject="the customer contacts" />;
  if (!accountsResult.ok) return <DataStateNotice error={accountsResult.error} subject="the customer accounts" />;

  return (
    <CustomersWorkspaceClient
      portfolio={portfolioResult.data ?? { items: [], total: 0, limit: 50, offset: 0, hasMore: false, summary: { totalAccounts: 0, activeCustomers: 0, prospects: 0, strategicAccounts: 0, atRiskAccounts: 0, totalPipeline: 0, activeDeals: 0, contractedValue: 0, outstandingAR: 0 } }}
      contacts={contactsResult.data ?? []}
      accountOptions={accountsResult.data ?? []}
      currentUserId={user?.sub ?? null}
    />
  );
}

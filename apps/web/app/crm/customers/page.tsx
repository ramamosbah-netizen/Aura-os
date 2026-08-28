import { fetchJson, currentUser } from '@/lib/api';
import DataStateNotice from '@/components/ui/data-state';
import CustomersWorkspaceClient, { type CustomerContact, type CustomerAccount, type CustomerContactPage, type CustomerPortfolioPage } from '@/components/customers-workspace-client';

export const dynamic = 'force-dynamic';

/**
 * Customers is the CRM entry point for the two related, but distinct, master
 * records. Accounts and Contacts keep their own 360 pages and APIs; this page
 * only gives users one coherent workspace to find either one.
 */
export default async function CustomersPage() {
  const [portfolioResult, contactsResult, contactPageResult, accountsResult, user] = await Promise.all([
    fetchJson<CustomerPortfolioPage>('/api/crm/accounts/portfolio/paged?limit=50&offset=0'),
    fetchJson<CustomerContact[]>('/api/crm/contacts'),
    fetchJson<CustomerContactPage>('/api/crm/contacts/paged?limit=50&offset=0'),
    fetchJson<CustomerAccount[]>('/api/crm/accounts'),
    currentUser(),
  ]);

  if (!portfolioResult.ok) return <DataStateNotice error={portfolioResult.error} subject="the customer accounts" />;
  if (!contactsResult.ok) return <DataStateNotice error={contactsResult.error} subject="the customer contacts" />;
  if (!contactPageResult.ok) return <DataStateNotice error={contactPageResult.error} subject="the customer contacts" />;
  if (!accountsResult.ok) return <DataStateNotice error={accountsResult.error} subject="the customer accounts" />;

  return (
    <CustomersWorkspaceClient
      portfolio={portfolioResult.data ?? { items: [], total: 0, limit: 50, offset: 0, hasMore: false, summary: { totalAccounts: 0, activeCustomers: 0, prospects: 0, strategicAccounts: 0, atRiskAccounts: 0, totalPipeline: 0, activeDeals: 0, contractedValue: 0, outstandingAR: 0 } }}
      contacts={contactsResult.data ?? []}
      contactPage={contactPageResult.data ?? { items: [], total: 0, limit: 50, offset: 0, hasMore: false, summary: { total: 0, active: 0, linked: 0, primaries: 0, recent: 0, decisionMakers: 0, champions: 0, unmapped: 0 } }}
      accountOptions={accountsResult.data ?? []}
      currentUserId={user?.sub ?? null}
    />
  );
}

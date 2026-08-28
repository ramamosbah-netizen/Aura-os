import { fetchJson, currentUser } from '@/lib/api';
import DataStateNotice from '@/components/ui/data-state';
import CustomersWorkspaceClient, { type CustomerContact, type CustomerAccount, type CustomerPortfolioRow } from '@/components/customers-workspace-client';

export const dynamic = 'force-dynamic';

/**
 * Customers is the CRM entry point for the two related, but distinct, master
 * records. Accounts and Contacts keep their own 360 pages and APIs; this page
 * only gives users one coherent workspace to find either one.
 */
export default async function CustomersPage() {
  const [portfolioResult, contactsResult, accountsResult, user] = await Promise.all([
    fetchJson<CustomerPortfolioRow[]>('/api/crm/accounts/portfolio'),
    fetchJson<CustomerContact[]>('/api/crm/contacts'),
    fetchJson<CustomerAccount[]>('/api/crm/accounts'),
    currentUser(),
  ]);

  if (!portfolioResult.ok) return <DataStateNotice error={portfolioResult.error} subject="the customer accounts" />;
  if (!contactsResult.ok) return <DataStateNotice error={contactsResult.error} subject="the customer contacts" />;
  if (!accountsResult.ok) return <DataStateNotice error={accountsResult.error} subject="the customer accounts" />;

  return (
    <CustomersWorkspaceClient
      accounts={portfolioResult.data ?? []}
      contacts={contactsResult.data ?? []}
      accountOptions={accountsResult.data ?? []}
      currentUserId={user?.sub ?? null}
    />
  );
}

import { getJson } from '@/lib/api';
import RecordDetail, { RecordNotFound } from '../../../../components/record-detail';

export const dynamic = 'force-dynamic';

interface Account {
  id: string;
  name: string;
  status: string;
  industry: string | null;
  website: string | null;
  createdAt: string;
}

export default async function AccountDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const account = await getJson<Account>(`/api/crm/accounts/${id}`);
  if (!account) return <RecordNotFound type="Account" backHref="/crm/accounts" backLabel="Back to Accounts" />;

  return (
    <RecordDetail
      type="Account"
      title={account.name}
      status={account.status}
      backHref="/crm/accounts"
      backLabel="Back to Accounts"
      fields={[
        { label: 'Industry', value: account.industry ?? '—' },
        { label: 'Website', value: account.website ?? '—' },
        { label: 'Created', value: new Date(account.createdAt).toLocaleDateString() },
      ]}
      links={[
        { label: 'Sales pipeline', href: '/crm/leads' },
        { label: 'Quotations', href: '/crm/quotations' },
        { label: 'Tenders', href: '/tendering/tenders' },
      ]}
    />
  );
}

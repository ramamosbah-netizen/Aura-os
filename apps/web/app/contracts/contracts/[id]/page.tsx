import { getJson } from '@/lib/api';
import RecordDetail, { RecordNotFound } from '../../../../components/record-detail';

export const dynamic = 'force-dynamic';

interface Contract {
  id: string;
  title: string;
  reference: string | null;
  tenderId: string | null;
  tenderTitle: string | null;
  accountId: string | null;
  accountName: string | null;
  status: string;
  value: number;
  createdAt: string;
}

const money = (n: number) => (n ? n.toLocaleString(undefined, { maximumFractionDigits: 0 }) : '—');

export default async function ContractDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const contract = await getJson<Contract>(`/api/contracts/contracts/${id}`);
  if (!contract)
    return <RecordNotFound type="Contract" backHref="/contracts/contracts" backLabel="Back to Contracts" />;

  const links = [
    contract.accountId
      ? { label: `Account: ${contract.accountName ?? 'view'}`, href: `/crm/accounts/${contract.accountId}` }
      : null,
    contract.tenderId
      ? { label: `Tender: ${contract.tenderTitle ?? 'view'}`, href: `/tendering/tenders/${contract.tenderId}` }
      : null,
    { label: 'Print contract', href: `/contracts/contracts/${contract.id}/print` },
    { label: 'Payment certificates', href: '/contracts/certificates' },
  ].filter((l): l is { label: string; href: string } => l !== null);

  return (
    <RecordDetail
      type="Contract"
      title={contract.title}
      status={contract.status}
      backHref="/contracts/contracts"
      backLabel="Back to Contracts"
      fields={[
        { label: 'Reference', value: contract.reference ?? '—' },
        { label: 'Client', value: contract.accountName ?? '—' },
        { label: 'Source tender', value: contract.tenderTitle ?? '—' },
        { label: 'Contract value', value: money(contract.value) },
        { label: 'Created', value: new Date(contract.createdAt).toLocaleDateString() },
      ]}
      links={links}
    />
  );
}

import { getJson } from '@/lib/api';
import DocumentSheet from '../../../../../components/document-sheet';

export const dynamic = 'force-dynamic';

interface C {
  reference: string | null; title: string; accountName: string | null; tenderTitle?: string | null;
  status: string; value: number; createdAt: string;
}
const money = (n: number) => `AED ${Number(n).toLocaleString('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default async function ContractPrint({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const c = await getJson<C>(`/api/contracts/contracts/${id}`);
  if (!c) return <div style={{ padding: 40 }}>Contract not found or API offline.</div>;
  return (
    <DocumentSheet
      kind="CONTRACT"
      reference={c.reference ?? id.slice(0, 8)}
      status={c.status}
      from={{ heading: 'Contractor', lines: ['AURA OS Contracting LLC', 'Dubai, UAE'] }}
      to={{ heading: 'Client', lines: [c.accountName ?? '—', c.tenderTitle ? `From tender: ${c.tenderTitle}` : ''].filter(Boolean) }}
      meta={[
        { label: 'Contract Date', value: (c.createdAt ?? '').slice(0, 10) },
        { label: 'Title', value: c.title },
      ]}
      columns={[{ key: 'item', label: 'Description' }, { key: 'amount', label: 'Contract Value', align: 'right' }]}
      rows={[{ item: c.title, amount: money(c.value) }]}
      totals={[{ label: 'Contract Value', value: money(c.value), strong: true }]}
      notes="Awarded contract. Progress billed via interim payment certificates (IPC)."
      signatures={['Contractor', 'Client']}
    />
  );
}

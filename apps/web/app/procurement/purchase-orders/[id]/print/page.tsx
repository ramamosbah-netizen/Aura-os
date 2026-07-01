import { getJson } from '@/lib/api';
import DocumentSheet from '../../../../../components/document-sheet';

export const dynamic = 'force-dynamic';

interface PO {
  reference: string | null; title: string; supplierName: string | null; projectName: string | null;
  status: string; value: number; createdAt: string;
}

const money = (n: number) => `AED ${Number(n).toLocaleString('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default async function PurchaseOrderPrint({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const po = await getJson<PO>(`/api/procurement/purchase-orders/${id}`);
  if (!po) return <div style={{ padding: 40 }}>Purchase order not found or API offline.</div>;

  return (
    <DocumentSheet
      kind="PURCHASE ORDER"
      reference={po.reference ?? id.slice(0, 8)}
      status={po.status}
      from={{ heading: 'From', lines: ['AURA OS Contracting LLC', 'Dubai, UAE', 'TRN 100000000000003'] }}
      to={{ heading: 'Supplier', lines: [po.supplierName ?? '—', po.projectName ? `Project: ${po.projectName}` : ''].filter(Boolean) }}
      meta={[
        { label: 'PO Date', value: (po.createdAt ?? '').slice(0, 10) },
        { label: 'Project', value: po.projectName ?? '—' },
      ]}
      columns={[
        { key: 'description', label: 'Description' },
        { key: 'amount', label: 'Amount', align: 'right' },
      ]}
      rows={[{ description: po.title, amount: money(po.value) }]}
      totals={[{ label: 'Order Total', value: money(po.value), strong: true }]}
      notes="Goods/services to be supplied per the agreed specification. Deliver against a GRN referencing this PO."
      signatures={['Prepared By', 'Approved By']}
    />
  );
}

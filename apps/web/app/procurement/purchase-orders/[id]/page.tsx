import { getJson } from '@/lib/api';
import RecordDetail, { RecordNotFound } from '../../../../components/record-detail';

export const dynamic = 'force-dynamic';

interface PurchaseOrder {
  id: string;
  title: string;
  reference: string | null;
  supplierId: string | null;
  supplierName: string | null;
  projectId: string | null;
  projectName: string | null;
  status: string;
  value: number;
  createdAt: string;
}

const money = (n: number) => (n ? n.toLocaleString(undefined, { maximumFractionDigits: 0 }) : '—');

export default async function PurchaseOrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const po = await getJson<PurchaseOrder>(`/api/procurement/purchase-orders/${id}`);
  if (!po)
    return (
      <RecordNotFound type="Purchase Order" backHref="/procurement/purchase-orders" backLabel="Back to Purchase Orders" />
    );

  const links = [
    po.projectId
      ? { label: `Project: ${po.projectName ?? 'view'}`, href: `/projects/projects/${po.projectId}` }
      : null,
    { label: 'Print purchase order', href: `/procurement/purchase-orders/${po.id}/print` },
    { label: 'Goods receipts', href: '/inventory/grns' },
    { label: 'Supplier invoices', href: '/finance/invoices' },
  ].filter((l): l is { label: string; href: string } => l !== null);

  return (
    <RecordDetail
      type="Purchase Order"
      title={po.title}
      status={po.status.replace(/_/g, ' ')}
      backHref="/procurement/purchase-orders"
      backLabel="Back to Purchase Orders"
      fields={[
        { label: 'Reference', value: po.reference ?? '—' },
        { label: 'Supplier', value: po.supplierName ?? '—' },
        { label: 'Project', value: po.projectName ?? '—' },
        { label: 'Order value', value: money(po.value) },
        { label: 'Created', value: new Date(po.createdAt).toLocaleDateString() },
      ]}
      links={links}
    />
  );
}

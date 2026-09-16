import { getJson } from '@/lib/api';
import RecordDetail, { RecordNotFound } from '../../../../components/record-detail';
import OrderLinesPanel from '../../../../components/order-lines-panel';
import OrderReceiptPanel from '../../../../components/order-receipt-panel';

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
  /** The order's transaction currency. NULL on an order raised before the column existed. */
  currency: string | null;
}

interface Company { id: string; baseCurrency: string }

const money = (n: number) => (n ? n.toLocaleString(undefined, { maximumFractionDigits: 0 }) : '—');

export default async function PurchaseOrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [po, companies] = await Promise.all([
    getJson<PurchaseOrder>(`/api/procurement/purchase-orders/${id}`),
    getJson<Company[]>('/api/admin/companies'),
  ]);
  if (!po)
    return (
      <RecordNotFound type="Purchase Order" backHref="/procurement/purchase-orders" backLabel="Back to Purchase Orders" />
    );

  /**
   * The order's own currency where it has one, else the company's base.
   *
   * An order raised before `currency` existed was never told what it was in, and the company's base
   * is what it was always implicitly read as — stated here rather than printed as `$`.
   */
  const currency = po.currency?.trim() || companies?.[0]?.baseCurrency?.trim() || 'AED';

  const links = [
    po.projectId
      ? { label: `Project: ${po.projectName ?? 'view'}`, href: `/project/${po.projectId}` }
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
    >
      {/*
        The lines and the delivery position live UNDER the order they belong to. A total shown away
        from the lines it came from is a number nobody can check, and an outstanding balance shown
        away from the order is a number nobody can act on.
      */}
      <OrderLinesPanel poId={po.id} currency={currency} editable={po.status === 'draft'} />
      <OrderReceiptPanel poId={po.id} currency={currency} />
    </RecordDetail>
  );
}

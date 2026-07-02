import { getJson } from '@/lib/api';
import RecordDetail, { RecordNotFound } from '../../../../components/record-detail';

export const dynamic = 'force-dynamic';

interface Invoice {
  id: string;
  title: string;
  reference: string | null;
  poId: string | null;
  poTitle: string | null;
  supplierName: string | null;
  projectId: string | null;
  projectName: string | null;
  status: string;
  value: number;
  currency: string;
  baseValue: number;
  createdAt: string;
}

const money = (n: number, ccy?: string) =>
  n ? `${ccy ? `${ccy} ` : ''}${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}` : '—';

export default async function InvoiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const invoice = await getJson<Invoice>(`/api/finance/invoices/${id}`);
  if (!invoice) return <RecordNotFound type="Invoice" backHref="/finance/invoices" backLabel="Back to Invoices" />;

  const links = [
    invoice.poId
      ? { label: `Purchase order: ${invoice.poTitle ?? 'view'}`, href: `/procurement/purchase-orders/${invoice.poId}` }
      : null,
    invoice.projectId
      ? { label: `Project: ${invoice.projectName ?? 'view'}`, href: `/projects/projects/${invoice.projectId}` }
      : null,
    { label: 'AP aging', href: '/finance/ap-aging' },
    { label: 'Ledger', href: '/finance/ledger' },
  ].filter((l): l is { label: string; href: string } => l !== null);

  const fields = [
    { label: 'Reference', value: invoice.reference ?? '—' },
    { label: 'Supplier', value: invoice.supplierName ?? '—' },
    { label: 'Against PO', value: invoice.poTitle ?? '—' },
    { label: 'Project', value: invoice.projectName ?? '—' },
    { label: 'Amount', value: money(invoice.value, invoice.currency) },
    { label: 'Created', value: new Date(invoice.createdAt).toLocaleDateString() },
  ];
  if (invoice.currency && invoice.currency !== 'AED') {
    fields.splice(5, 0, { label: 'Base amount (AED)', value: money(invoice.baseValue, 'AED') });
  }

  return (
    <RecordDetail
      type="Invoice"
      title={invoice.title}
      status={invoice.status}
      backHref="/finance/invoices"
      backLabel="Back to Invoices"
      fields={fields}
      links={links}
    />
  );
}

import { getJson } from '@/lib/api';
import DocumentSheet from '../../../../../components/document-sheet';

export const dynamic = 'force-dynamic';

interface Line { description: string; quantity: number; unitPrice: number; vatRate: number; lineNet: number; lineVat: number }
interface CI {
  invoiceNumber: string; customerName: string; issueDate: string; dueDate: string | null;
  contractRef: string | null; projectName: string | null; status: string;
  currency?: string; exchangeRate?: number; subtotal: number; vatTotal: number; total: number; amountPaid: number;
  lines: Line[];
}

const money = (n: number, c = 'AED') => `${c} ${Number(n).toLocaleString('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default async function CustomerInvoicePrint({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const inv = await getJson<CI>(`/api/finance/customer-invoices/${id}`);
  if (!inv) return <div style={{ padding: 40 }}>Invoice not found or API offline.</div>;
  const cur = inv.currency ?? 'AED';

  return (
    <DocumentSheet
      kind="TAX INVOICE"
      reference={inv.invoiceNumber}
      status={inv.status}
      from={{ heading: 'From', lines: ['AURA OS Contracting LLC', 'Dubai, UAE', 'TRN 100000000000003'] }}
      to={{ heading: 'Bill To', lines: [inv.customerName, inv.projectName ?? '', inv.contractRef ? `Contract: ${inv.contractRef}` : ''].filter(Boolean) }}
      meta={[
        { label: 'Issue Date', value: inv.issueDate },
        ...(inv.dueDate ? [{ label: 'Due Date', value: inv.dueDate }] : []),
        { label: 'Currency', value: cur },
        ...(inv.exchangeRate && inv.exchangeRate !== 1 ? [{ label: 'FX Rate (→AED)', value: String(inv.exchangeRate) }] : []),
      ]}
      columns={[
        { key: 'description', label: 'Description' },
        { key: 'qty', label: 'Qty', align: 'right' },
        { key: 'unit', label: 'Unit Price', align: 'right' },
        { key: 'vat', label: 'VAT %', align: 'right' },
        { key: 'net', label: 'Net', align: 'right' },
      ]}
      rows={inv.lines.map((l) => ({
        description: l.description, qty: l.quantity, unit: money(l.unitPrice, cur), vat: `${l.vatRate}%`, net: money(l.lineNet, cur),
      }))}
      totals={[
        { label: 'Subtotal', value: money(inv.subtotal, cur) },
        { label: 'VAT', value: money(inv.vatTotal, cur) },
        { label: 'Total', value: money(inv.total, cur), strong: true },
        ...(inv.amountPaid > 0 ? [{ label: 'Paid', value: money(inv.amountPaid, cur) }, { label: 'Balance Due', value: money(inv.total - inv.amountPaid, cur) }] : []),
      ]}
      signatures={['Authorised Signature', 'Received By']}
    />
  );
}

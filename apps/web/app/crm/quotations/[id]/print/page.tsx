import { getJson } from '@/lib/api';
import DocumentSheet from '../../../../../components/document-sheet';

export const dynamic = 'force-dynamic';

interface Line { description: string; quantity: number; unitPrice: number; vatRate: number; lineNet: number; lineVat: number }
interface Q {
  quoteNumber: string; customerName: string; issueDate: string; validUntil: string | null;
  status: string; subtotal: number; vatTotal: number; total: number; lines: Line[];
}
const money = (n: number) => `AED ${Number(n).toLocaleString('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default async function QuotationPrint({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const q = await getJson<Q>(`/api/crm/quotations/${id}`);
  if (!q) return <div style={{ padding: 40 }}>Quotation not found or API offline.</div>;
  return (
    <DocumentSheet
      kind="QUOTATION"
      reference={q.quoteNumber}
      status={q.status}
      from={{ heading: 'From', lines: ['AURA OS Contracting LLC', 'Dubai, UAE', 'TRN 100000000000003'] }}
      to={{ heading: 'Quote To', lines: [q.customerName] }}
      meta={[{ label: 'Issue Date', value: q.issueDate }, ...(q.validUntil ? [{ label: 'Valid Until', value: q.validUntil }] : [])]}
      columns={[
        { key: 'description', label: 'Description' },
        { key: 'qty', label: 'Qty', align: 'right' },
        { key: 'unit', label: 'Unit Price', align: 'right' },
        { key: 'vat', label: 'VAT %', align: 'right' },
        { key: 'net', label: 'Net', align: 'right' },
      ]}
      rows={q.lines.map((l) => ({ description: l.description, qty: l.quantity, unit: money(l.unitPrice), vat: `${l.vatRate}%`, net: money(l.lineNet) }))}
      totals={[
        { label: 'Subtotal', value: money(q.subtotal) },
        { label: 'VAT', value: money(q.vatTotal) },
        { label: 'Total', value: money(q.total), strong: true },
      ]}
      notes="This quotation is valid until the date shown and subject to our standard terms."
      signatures={['Authorised Signature', 'Client Acceptance']}
    />
  );
}

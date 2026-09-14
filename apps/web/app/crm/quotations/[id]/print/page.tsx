import { fetchJson } from '@/lib/api';
import DocumentSheet from '../../../../../components/document-sheet';
import DataStateNotice from '../../../../../components/ui/data-state';

export const dynamic = 'force-dynamic';

interface Line { description: string; quantity: number; unitPrice: number; vatRate: number; lineNet: number; lineVat: number }
interface Q {
  quoteNumber: string; customerName: string; issueDate: string; validUntil: string | null;
  status: string; subtotal: number; vatTotal: number; total: number; lines: Line[];
}
interface Identity { name: string; legalName: string; trn: string; address: string; phone: string; email: string; website: string; currency: string }
const money = (n: number) => `AED ${Number(n).toLocaleString('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default async function QuotationPrint({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [result, identityResult] = await Promise.all([
    fetchJson<Q>(`/api/crm/quotations/${id}`),
    fetchJson<Identity>(`/api/crm/quotations/${id}/document-identity`),
  ]);
  if (!result.ok) return <div style={{ padding: 40 }}><DataStateNotice error={result.error} subject="quotation" /></div>;
  if (!identityResult.ok) return <div style={{ padding: 40 }}><DataStateNotice error={identityResult.error} subject="company identity" /></div>;
  const q = result.data;
  const identity = identityResult.data;
  const sellerLines = [identity.name, identity.address, identity.trn ? `TRN ${identity.trn}` : '', identity.phone, identity.email, identity.website].filter(Boolean);
  return (
    <DocumentSheet
      kind="QUOTATION"
      reference={q.quoteNumber}
      status={q.status}
      from={{ heading: 'From', lines: sellerLines }}
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

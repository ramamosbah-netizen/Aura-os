import { getJson } from '@/lib/api';
import DocumentSheet from '../../../../../components/document-sheet';

export const dynamic = 'force-dynamic';

interface GRN {
  reference: string | null; title: string; poTitle: string | null; supplierName: string | null;
  projectName: string | null; status?: string; value: number; createdAt: string;
}

const money = (n: number) => `AED ${Number(n).toLocaleString('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default async function GrnPrint({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const grn = await getJson<GRN>(`/api/inventory/${id}`);
  if (!grn) return <div style={{ padding: 40 }}>Goods receipt not found or API offline.</div>;

  return (
    <DocumentSheet
      kind="GOODS RECEIPT NOTE"
      reference={grn.reference ?? id.slice(0, 8)}
      status={grn.status}
      from={{ heading: 'Received By', lines: ['AURA OS Contracting LLC', 'Dubai, UAE'] }}
      to={{ heading: 'Supplier', lines: [grn.supplierName ?? '—', grn.poTitle ? `PO: ${grn.poTitle}` : '', grn.projectName ? `Project: ${grn.projectName}` : ''].filter(Boolean) }}
      meta={[
        { label: 'Received Date', value: (grn.createdAt ?? '').slice(0, 10) },
        { label: 'Against PO', value: grn.poTitle ?? '—' },
      ]}
      columns={[
        { key: 'description', label: 'Description' },
        { key: 'value', label: 'Received Value', align: 'right' },
      ]}
      rows={[{ description: grn.title, value: money(grn.value) }]}
      totals={[{ label: 'Total Received', value: money(grn.value), strong: true }]}
      notes="Goods received and inspected against the referenced purchase order."
      signatures={['Store Keeper', 'Site Engineer']}
    />
  );
}

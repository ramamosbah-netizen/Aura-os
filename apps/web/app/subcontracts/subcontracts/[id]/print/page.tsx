import { getJson } from '@/lib/api';
import DocumentSheet from '../../../../../components/document-sheet';

export const dynamic = 'force-dynamic';

interface SC {
  reference?: string | null; title: string; subcontractorName: string; projectName: string | null;
  status: string; value: number; createdAt: string;
}
const money = (n: number) => `AED ${Number(n).toLocaleString('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default async function SubcontractPrint({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sc = await getJson<SC>(`/api/subcontracts/${id}`);
  if (!sc) return <div style={{ padding: 40 }}>Subcontract not found or API offline.</div>;
  return (
    <DocumentSheet
      kind="SUBCONTRACT AGREEMENT"
      reference={sc.reference ?? id.slice(0, 8)}
      status={sc.status}
      from={{ heading: 'Main Contractor', lines: ['AURA OS Contracting LLC', 'Dubai, UAE'] }}
      to={{ heading: 'Subcontractor', lines: [sc.subcontractorName, sc.projectName ? `Project: ${sc.projectName}` : ''].filter(Boolean) }}
      meta={[
        { label: 'Date', value: (sc.createdAt ?? '').slice(0, 10) },
        { label: 'Scope', value: sc.title },
      ]}
      columns={[{ key: 'item', label: 'Scope of works' }, { key: 'amount', label: 'Subcontract Value', align: 'right' }]}
      rows={[{ item: sc.title, amount: money(sc.value) }]}
      totals={[{ label: 'Subcontract Value', value: money(sc.value), strong: true }]}
      notes="Works to be executed per the main contract terms. Progress paid via subcontractor claims (with retention); back-charges deducted."
      signatures={['Main Contractor', 'Subcontractor']}
    />
  );
}

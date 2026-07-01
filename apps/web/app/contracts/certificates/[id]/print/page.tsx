import { getJson } from '@/lib/api';
import DocumentSheet from '../../../../../components/document-sheet';

export const dynamic = 'force-dynamic';

interface IPC {
  reference: string | null; sequence: number; contractTitle: string | null; contractValue: number;
  accountName: string | null; status?: string; periodStart: string | null; periodEnd: string | null;
  cumulativeWorkDone: number; materialsOnSite: number; retentionPercent: number;
  advanceRecoveredToDate: number; previousCertifiedNet: number;
  grossToDate: number; retentionToDate: number; netCertifiedToDate: number; netThisCertificate: number;
}

const money = (n: number) => `AED ${Number(n).toLocaleString('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default async function IpcPrint({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const c = await getJson<IPC>(`/api/contracts/certificates/${id}`);
  if (!c) return <div style={{ padding: 40 }}>Payment certificate not found or API offline.</div>;

  return (
    <DocumentSheet
      kind="INTERIM PAYMENT CERTIFICATE"
      reference={c.reference ?? `IPC-${c.sequence}`}
      status={c.status}
      from={{ heading: 'Contractor', lines: ['AURA OS Contracting LLC', 'Dubai, UAE'] }}
      to={{ heading: 'Employer', lines: [c.accountName ?? '—', c.contractTitle ? `Contract: ${c.contractTitle}` : '', `Contract Value: ${money(c.contractValue)}`].filter(Boolean) }}
      meta={[
        { label: 'Certificate No.', value: String(c.sequence) },
        ...(c.periodStart ? [{ label: 'Period From', value: c.periodStart }] : []),
        ...(c.periodEnd ? [{ label: 'Period To', value: c.periodEnd }] : []),
        { label: 'Retention %', value: `${c.retentionPercent}%` },
      ]}
      columns={[
        { key: 'item', label: 'Description' },
        { key: 'amount', label: 'Amount', align: 'right' },
      ]}
      rows={[
        { item: 'Cumulative work done to date', amount: money(c.cumulativeWorkDone) },
        { item: 'Materials on site', amount: money(c.materialsOnSite) },
        { item: 'Gross value to date', amount: money(c.grossToDate) },
        { item: 'Less: retention to date', amount: `(${money(c.retentionToDate)})` },
        { item: 'Less: advance recovered to date', amount: `(${money(c.advanceRecoveredToDate)})` },
        { item: 'Net certified to date', amount: money(c.netCertifiedToDate) },
        { item: 'Less: previously certified', amount: `(${money(c.previousCertifiedNet)})` },
      ]}
      totals={[{ label: 'Net Payable This Certificate', value: money(c.netThisCertificate), strong: true }]}
      signatures={['Contractor', "Engineer / Consultant", 'Employer']}
    />
  );
}

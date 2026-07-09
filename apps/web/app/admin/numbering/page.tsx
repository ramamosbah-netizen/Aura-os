import { getJson } from '@/lib/api';
import { AdminHeader, AdminOffline, adminPage, type Kpi } from '@/components/admin-chrome';
import NumberingAdminClient, { type NumberSequence } from '@/components/numbering-admin-client';

export const dynamic = 'force-dynamic';

export default async function NumberingPage() {
  const sequences = await getJson<NumberSequence[]>('/api/admin/numbering');

  if (sequences === null) {
    return (
      <div style={adminPage}>
        <AdminHeader title="Document Numbering" glyph="#" backToHub subtitle="Gapless per-year sequences, prefixes, and padding per document type." />
        <AdminOffline label="Numbering" />
      </div>
    );
  }

  const modules = new Set(sequences.map((s) => s.module)).size;
  const issued = sequences.reduce((n, s) => n + (s.currentSeq ?? 0), 0);
  const years = new Set(sequences.map((s) => s.fiscalYear)).size;
  const kpis: Kpi[] = [
    { label: 'Sequences', value: sequences.length, sub: 'document counters', tone: 'accent' },
    { label: 'Modules', value: modules, sub: 'covered' },
    { label: 'Fiscal Years', value: years, sub: 'tracked' },
    { label: 'Numbers Issued', value: issued.toLocaleString(), sub: 'lifetime total', tone: 'info' },
  ];

  return (
    <div style={adminPage}>
      <AdminHeader
        title="Document Numbering"
        glyph="#"
        backToHub
        subtitle="Each document type has a gapless sequence per fiscal year (e.g. INV-2026-000042). Review the current counters and set the next number, prefix, or padding."
        kpis={kpis}
      />
      <NumberingAdminClient initialSequences={sequences} />
    </div>
  );
}

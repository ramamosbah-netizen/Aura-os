import Link from 'next/link';
import { getJson } from '@/lib/api';
import TenderDetail from '@/components/tender-detail';
import RecordChrome from '@/components/record-chrome';
import type { ComponentProps } from 'react';

export const dynamic = 'force-dynamic';

export default async function TenderBoqPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const tender = await getJson<ComponentProps<typeof TenderDetail>['tender']>(`/api/tendering/tenders/${id}`);
  return <div style={{ maxWidth: 1080, margin: '0 auto', padding: '28px 28px 64px' }}>
    <Link href={`/tendering/tenders/${id}`} style={{ color: 'var(--accent)' }}>← Tender dashboard</Link>
    {tender ? <>
      <RecordChrome type="Tender" title={`${tender.title} — BOQ workspace`} />
      <h2>BOQ workspace</h2>
      <p style={{ color: 'var(--muted)' }}>Prepare quantities here after reviewing the scope and bid qualification.</p>
      <p><Link href={`/tendering/tenders/${id}/pricing`} style={{ color: 'var(--accent)' }}>Open estimation &amp; pricing →</Link></p>
      <TenderDetail tender={tender} workspace="boq" />
    </> : <h1>Tender not found or unavailable</h1>}
  </div>;
}

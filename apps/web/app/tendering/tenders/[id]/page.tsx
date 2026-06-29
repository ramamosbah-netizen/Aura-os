import type { CSSProperties } from 'react';
import { getJson } from '@/lib/api';
import TenderDetail from '../../../../components/tender-detail';

export const dynamic = 'force-dynamic';

interface Tender {
  id: string;
  title: string;
  reference: string | null;
  accountName: string | null;
  status: 'draft' | 'submitted' | 'won' | 'lost';
  value: number;
  createdAt: string;
}

export default async function TenderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const tender = await getJson<Tender>(`/api/tendering/tenders/${id}`);

  if (!tender) {
    return (
      <div style={st.container}>
        <h1 style={st.h1}>Tender Not Found</h1>
        <p style={st.muted}>The requested tender does not exist or you do not have permission to view it.</p>
        <a href="/tendering/tenders" style={st.link}>← Back to Tenders</a>
      </div>
    );
  }

  return (
    <div style={st.container}>
      <div style={st.navRow}>
        <a href="/tendering/tenders" style={st.link}>← Back to Tenders</a>
      </div>
      <TenderDetail tender={tender} />
    </div>
  );
}

const st = {
  container: { maxWidth: 1080, margin: '0 auto', padding: '28px 28px 64px' } as CSSProperties,
  h1: { fontSize: 24, margin: '0 0 10px', color: 'var(--accent)' } as CSSProperties,
  muted: { color: 'var(--muted)', marginBottom: 20 } as CSSProperties,
  navRow: { marginBottom: 16 } as CSSProperties,
  link: { color: 'var(--accent)', textDecoration: 'none', fontSize: 14, fontWeight: 500 } as CSSProperties,
};

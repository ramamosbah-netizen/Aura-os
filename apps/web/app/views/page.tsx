import type { CSSProperties } from 'react';
import { getJson } from '@/lib/api';
import ViewsClient from '../../components/views-client';

export const dynamic = 'force-dynamic';

interface SavedView { id: string; label: string; path: string; query: string; createdAt: string }

export default async function ViewsPage() {
  const views = await getJson<SavedView[]>('/api/views');
  return (
    <div style={st.page}>
      <h1 style={st.h1}>Saved Views</h1>
      <p style={st.sub}>Named list filters. Use “☆ Save view” on any list page to add one here.</p>
      <ViewsClient initial={views ?? []} />
    </div>
  );
}

const st = {
  page: { maxWidth: 760, margin: '0 auto', padding: '28px 28px 64px' } as CSSProperties,
  h1: { fontSize: 28, margin: '0 0 6px', letterSpacing: -0.5 } as CSSProperties,
  sub: { color: 'var(--muted)', margin: '0 0 22px', lineHeight: 1.5 } as CSSProperties,
};

import type { CSSProperties } from 'react';
import { getJson } from '@/lib/api';

export const dynamic = 'force-dynamic';

interface SearchHit {
  type: string;
  id: string;
  title: string;
  subtitle: string;
  href: string;
}

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q = '' } = await searchParams;
  const query = q.trim();
  const hits = query ? await getJson<SearchHit[]>(`/api/search?q=${encodeURIComponent(query)}&limit=100`) : [];

  const byType = new Map<string, SearchHit[]>();
  for (const hit of hits ?? []) {
    const list = byType.get(hit.type) ?? [];
    list.push(hit);
    byType.set(hit.type, list);
  }

  return (
    <div style={st.page}>
      <h1 style={st.h1}>Search</h1>
      <form action="/search" method="get" style={st.form}>
        <input
          name="q"
          defaultValue={query}
          placeholder="Search accounts, tenders, projects, invoices, people…"
          style={st.input}
          autoFocus
        />
        <button type="submit" style={st.btn}>
          Search
        </button>
      </form>

      {!query ? (
        <p style={st.muted}>Type a name, title or reference — results come from every module.</p>
      ) : hits === null ? (
        <p style={st.muted}>API offline.</p>
      ) : hits.length === 0 ? (
        <p style={st.muted}>No results for “{query}”.</p>
      ) : (
        [...byType.entries()].map(([type, typeHits]) => (
          <section key={type} style={{ marginBottom: 22 }}>
            <h2 style={st.groupTitle}>
              {type} <span style={st.groupCount}>{typeHits.length}</span>
            </h2>
            <div style={st.panel}>
              <ul style={st.list}>
                {typeHits.map((hit) => (
                  <li key={hit.id} style={st.row}>
                    <a href={hit.href} style={st.title}>
                      {hit.title}
                    </a>
                    <span style={st.subtitle}>{hit.subtitle}</span>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        ))
      )}
    </div>
  );
}

const st = {
  page: { maxWidth: 860, margin: '0 auto', padding: '28px 28px 64px' } as CSSProperties,
  h1: { fontSize: 28, margin: '0 0 16px', letterSpacing: -0.5 } as CSSProperties,
  form: { display: 'flex', gap: 10, marginBottom: 24 } as CSSProperties,
  input: {
    flex: 1,
    background: 'var(--panel)',
    border: '1px solid var(--border)',
    borderRadius: 10,
    color: 'var(--text)',
    padding: '11px 14px',
    fontSize: 14.5,
    outline: 'none',
  } as CSSProperties,
  btn: {
    background: 'var(--accent)',
    color: '#0b0e14',
    fontWeight: 600,
    border: 'none',
    borderRadius: 10,
    padding: '0 18px',
    fontSize: 14,
    cursor: 'pointer',
  } as CSSProperties,
  muted: { color: 'var(--muted)' } as CSSProperties,
  groupTitle: { fontSize: 15, margin: '0 0 10px', display: 'flex', alignItems: 'center', gap: 8 } as CSSProperties,
  groupCount: {
    fontSize: 11.5,
    fontWeight: 600,
    color: 'var(--muted)',
    background: 'var(--panel-2)',
    border: '1px solid var(--border)',
    borderRadius: 999,
    padding: '1px 8px',
  } as CSSProperties,
  panel: {
    background: 'var(--panel)',
    border: '1px solid var(--border)',
    borderRadius: 14,
    padding: '4px 4px',
  } as CSSProperties,
  list: { listStyle: 'none', margin: 0, padding: 0 } as CSSProperties,
  row: {
    display: 'flex',
    alignItems: 'baseline',
    gap: 12,
    padding: '10px 14px',
    borderBottom: '1px solid var(--border)',
  } as CSSProperties,
  title: { color: 'var(--accent)', textDecoration: 'none', fontSize: 14.5, fontWeight: 600 } as CSSProperties,
  subtitle: { color: 'var(--muted)', fontSize: 13, marginLeft: 'auto' } as CSSProperties,
};

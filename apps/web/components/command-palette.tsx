'use client';

import {
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useRouter } from 'next/navigation';
import { ALL_ITEMS, CREATE_ACTIONS } from './nav';
import { readRecentItems, type RecentItem } from '@/lib/recent-items';

interface SearchHit {
  type: string;
  id: string;
  title: string;
  subtitle: string;
  href: string;
}

interface InboxItem {
  id: string;
  module: string;
  kind: string;
  title: string;
  action: string;
  href: string;
}

interface Row {
  href: string;
  label: string;
  sub: string;
  glyph: string;
  group: string;
}

/**
 * ⌘K command palette — fuzzy-jump across the platform AND global search over records.
 * Nav items match client-side; entity records come from the Nest global-search API
 * (debounced) and render above the nav matches.
 */
export default function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [sel, setSel] = useState(0);
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [recents, setRecents] = useState<RecentItem[]>([]);
  const [pending, setPending] = useState<InboxItem[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  const navRows = useMemo<Row[]>(() => {
    const q = query.trim().toLowerCase();
    const items = !q
      ? ALL_ITEMS
      : ALL_ITEMS.filter((i) => `${i.label} ${i.desc} ${i.href}`.toLowerCase().includes(q));
    return items.map((i) => ({ href: i.href, label: i.label, sub: i.desc, glyph: i.glyph, group: 'Navigate' }));
  }, [query]);

  const rows = useMemo<Row[]>(() => {
    const q = query.trim().toLowerCase();
    const recordRows: Row[] = hits.map((h) => ({
      href: h.href,
      label: h.title,
      sub: `${h.type} · ${h.subtitle}`,
      glyph: '◍',
      group: 'Records',
    }));
    // Recently opened records surface before anything else when the query is empty.
    const recentRows: Row[] = !q
      ? recents.map((r) => ({ href: r.href, label: r.title, sub: r.type, glyph: '⟲', group: 'Recent' }))
      : [];
    // Pending decisions from the universal inbox — actionable verbs, not just navigation.
    const pendingRows: Row[] = pending
      .filter((p) => !q || `${p.action} ${p.title} ${p.kind} ${p.module}`.toLowerCase().includes(q))
      .slice(0, q ? 6 : 4)
      .map((p) => ({ href: p.href, label: `${p.action}: ${p.title}`, sub: `${p.module} · ${p.kind}`, glyph: '◉', group: 'Pending' }));
    // Create/command verbs.
    const actionRows: Row[] = CREATE_ACTIONS.filter(
      (a) => !q || `${a.label} ${a.desc}`.toLowerCase().includes(q),
    ).map((a) => ({ href: a.href, label: a.label, sub: a.desc, glyph: '＋', group: 'Actions' }));
    // A queried palette always offers the full results page as the escape hatch.
    const seeAll: Row[] = q.length >= 2
      ? [{ href: `/search?q=${encodeURIComponent(query.trim())}`, label: `See all results for “${query.trim()}”`, sub: 'Search page', glyph: '⌕', group: 'Search' }]
      : [];
    return [...recentRows, ...pendingRows, ...recordRows, ...(q ? actionRows : []), ...seeAll, ...navRows, ...(q ? [] : actionRows)];
  }, [hits, navRows, recents, pending, query]);

  useEffect(() => {
    if (open) {
      setQuery('');
      setSel(0);
      setHits([]);
      setRecents(readRecentItems());
      // Live pending decisions for the "Pending" group (best-effort).
      fetch('/api/inbox')
        .then((r) => (r.ok ? r.json() : []))
        .then((data: InboxItem[]) => setPending(Array.isArray(data) ? data : []))
        .catch(() => undefined);
      const t = setTimeout(() => inputRef.current?.focus(), 0);
      return () => clearTimeout(t);
    }
  }, [open]);

  useEffect(() => setSel(0), [rows.length]);

  // Debounced global search over records (≥2 chars).
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setHits([]);
      return;
    }
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      fetch(`/api/search?q=${encodeURIComponent(q)}`, { signal: ctrl.signal })
        .then((r) => (r.ok ? r.json() : []))
        .then((data: SearchHit[]) => setHits(Array.isArray(data) ? data : []))
        .catch(() => undefined);
    }, 180);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [query]);

  if (!open) return null;

  function go(href: string) {
    onClose();
    router.push(href);
  }

  function onKeyDown(e: ReactKeyboardEvent) {
    if (e.key === 'Escape') {
      onClose();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSel((x) => Math.min(x + 1, rows.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSel((x) => Math.max(x - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const row = rows[sel];
      if (row) go(row.href);
    }
  }

  let lastGroup = '';

  return (
    <div style={s.overlay} onClick={onClose}>
      <div style={s.palette} onClick={(e) => e.stopPropagation()} onKeyDown={onKeyDown}>
        <input
          ref={inputRef}
          style={s.input}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search records or jump to…"
        />
        <ul style={s.list}>
          {rows.length === 0 ? (
            <li style={s.empty}>No matches</li>
          ) : (
            rows.map((row, i) => {
              const header = row.group !== lastGroup ? row.group : null;
              lastGroup = row.group;
              return (
                <div key={`${row.group}-${i}-${row.href}`}>
                  {header && <li style={s.groupHeader}>{header}</li>}
                  <li
                    style={i === sel ? { ...s.item, ...s.itemActive } : s.item}
                    onMouseEnter={() => setSel(i)}
                    onClick={() => go(row.href)}
                  >
                    <span style={s.glyph}>{row.glyph}</span>
                    <span style={s.label}>{row.label}</span>
                    <span style={s.desc}>{row.sub}</span>
                  </li>
                </div>
              );
            })
          )}
        </ul>
        <div style={s.footer}>
          <span><kbd style={s.kbd}>↑</kbd><kbd style={s.kbd}>↓</kbd> navigate</span>
          <span><kbd style={s.kbd}>↵</kbd> open</span>
          <span><kbd style={s.kbd}>esc</kbd> close</span>
        </div>
      </div>
    </div>
  );
}

const s = {
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(5,7,12,0.6)',
    backdropFilter: 'blur(2px)',
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'center',
    paddingTop: '12vh',
    zIndex: 100,
  } as CSSProperties,
  palette: {
    width: 560,
    maxWidth: 'calc(100vw - 32px)',
    background: 'var(--panel)',
    border: '1px solid var(--border)',
    borderRadius: 14,
    boxShadow: '0 24px 64px rgba(0,0,0,0.55)',
    overflow: 'hidden',
  } as CSSProperties,
  input: {
    width: '100%',
    border: 'none',
    borderBottom: '1px solid var(--border)',
    background: 'transparent',
    color: 'var(--text)',
    fontSize: 16,
    padding: '16px 18px',
    outline: 'none',
  } as CSSProperties,
  list: { listStyle: 'none', margin: 0, padding: 6, maxHeight: 360, overflowY: 'auto' } as CSSProperties,
  empty: { padding: '14px 14px', color: 'var(--muted)', fontSize: 14 } as CSSProperties,
  groupHeader: {
    padding: '8px 12px 4px',
    fontSize: 11,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    color: 'var(--muted)',
  } as CSSProperties,
  item: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '10px 12px',
    borderRadius: 9,
    cursor: 'pointer',
  } as CSSProperties,
  itemActive: { background: 'var(--panel-2)' } as CSSProperties,
  glyph: { width: 20, textAlign: 'center', color: 'var(--accent)' } as CSSProperties,
  label: { fontSize: 14, color: 'var(--text)' } as CSSProperties,
  desc: { fontSize: 12.5, color: 'var(--muted)', marginLeft: 'auto' } as CSSProperties,
  footer: {
    display: 'flex',
    gap: 16,
    padding: '10px 14px',
    borderTop: '1px solid var(--border)',
    color: 'var(--muted)',
    fontSize: 11.5,
  } as CSSProperties,
  kbd: {
    fontFamily: 'ui-monospace, monospace',
    background: 'var(--panel-2)',
    border: '1px solid var(--border)',
    borderRadius: 4,
    padding: '1px 5px',
    marginRight: 3,
  } as CSSProperties,
};

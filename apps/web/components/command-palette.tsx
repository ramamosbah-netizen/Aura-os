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
import { ALL_ITEMS } from './nav';
import { getRecents } from '@/lib/recent-items';

interface SearchHit {
  type: string;
  id: string;
  title: string;
  subtitle: string;
  href: string;
}

interface Row {
  href: string;
  label: string;
  sub: string;
  glyph: string;
  group: string;
}

// Quick actions (Linear-style) — verbs, not just navigation. Each takes the user
// to where the action happens (creates are inline forms on the list pages).
const ACTIONS: Row[] = [
  { href: '/crm/leads', label: 'Create Lead', sub: 'CRM', glyph: '＋', group: 'Actions' },
  { href: '/crm/accounts', label: 'Create Account', sub: 'CRM', glyph: '＋', group: 'Actions' },
  { href: '/crm/quotations', label: 'Create Quotation', sub: 'CRM', glyph: '＋', group: 'Actions' },
  { href: '/tendering/tenders', label: 'Create Tender', sub: 'Tendering', glyph: '＋', group: 'Actions' },
  { href: '/procurement/purchase-orders', label: 'Create Purchase Order', sub: 'Procurement', glyph: '＋', group: 'Actions' },
  { href: '/finance/invoices', label: 'Create Supplier Invoice', sub: 'Finance', glyph: '＋', group: 'Actions' },
  { href: '/projects/projects', label: 'Create Project', sub: 'Projects', glyph: '＋', group: 'Actions' },
  { href: '/inbox', label: 'Open Inbox — approvals', sub: 'Workspace', glyph: '📥', group: 'Actions' },
];

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
  const inputRef = useRef<HTMLInputElement>(null);

  const [recents, setRecents] = useState<Row[]>([]);

  const q = query.trim().toLowerCase();

  // Token match: every whitespace-separated word in the query must appear somewhere
  // in the haystack (order-independent) — so "create invoice" matches "Create
  // Supplier Invoice".
  const matches = (haystack: string): boolean => {
    const hay = haystack.toLowerCase();
    return q.split(/\s+/).every((w) => hay.includes(w));
  };

  const actionRows = useMemo<Row[]>(() => {
    if (!q) return ACTIONS;
    return ACTIONS.filter((a) => matches(`${a.label} ${a.sub}`));
  }, [q]);

  const navRows = useMemo<Row[]>(() => {
    const items = !q ? ALL_ITEMS : ALL_ITEMS.filter((i) => matches(`${i.label} ${i.desc} ${i.href}`));
    return items.map((i) => ({ href: i.href, label: i.label, sub: i.desc, glyph: i.glyph, group: 'Navigate' }));
  }, [q]);

  const rows = useMemo<Row[]>(() => {
    const recordRows: Row[] = hits.map((h) => ({
      href: h.href,
      label: h.title,
      sub: `${h.type} · ${h.subtitle}`,
      glyph: '◍',
      group: 'Records',
    }));
    // Empty query: recents first (fast return), then actions, then nav.
    // With a query: records + actions + nav (records ranked top).
    return q
      ? [...recordRows, ...actionRows, ...navRows]
      : [...recents, ...actionRows, ...navRows];
  }, [hits, actionRows, navRows, recents, q]);

  useEffect(() => {
    if (open) {
      setQuery('');
      setSel(0);
      setHits([]);
      setRecents(
        getRecents().map((r) => ({ href: r.href, label: r.label, sub: r.type, glyph: '🕘', group: 'Recent' })),
      );
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

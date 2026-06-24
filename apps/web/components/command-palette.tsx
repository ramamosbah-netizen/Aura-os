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

/**
 * ⌘K command palette — fuzzy-jump across the platform. Navigation-only for now;
 * actions (New document, Emit event…) plug into the same list later.
 */
export default function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [sel, setSel] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return ALL_ITEMS;
    return ALL_ITEMS.filter((i) =>
      `${i.label} ${i.desc} ${i.href}`.toLowerCase().includes(q),
    );
  }, [query]);

  useEffect(() => {
    if (open) {
      setQuery('');
      setSel(0);
      // focus after paint
      const t = setTimeout(() => inputRef.current?.focus(), 0);
      return () => clearTimeout(t);
    }
  }, [open]);

  useEffect(() => {
    setSel(0);
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
      setSel((s) => Math.min(s + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSel((s) => Math.max(s - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const item = results[sel];
      if (item) go(item.href);
    }
  }

  return (
    <div style={s.overlay} onClick={onClose}>
      <div style={s.palette} onClick={(e) => e.stopPropagation()} onKeyDown={onKeyDown}>
        <input
          ref={inputRef}
          style={s.input}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search or jump to…"
        />
        <ul style={s.list}>
          {results.length === 0 ? (
            <li style={s.empty}>No matches</li>
          ) : (
            results.map((item, i) => (
              <li
                key={item.href}
                style={i === sel ? { ...s.item, ...s.itemActive } : s.item}
                onMouseEnter={() => setSel(i)}
                onClick={() => go(item.href)}
              >
                <span style={s.glyph}>{item.glyph}</span>
                <span style={s.label}>{item.label}</span>
                <span style={s.desc}>{item.desc}</span>
              </li>
            ))
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
  list: { listStyle: 'none', margin: 0, padding: 6, maxHeight: 320, overflowY: 'auto' } as CSSProperties,
  empty: { padding: '14px 14px', color: 'var(--muted)', fontSize: 14 } as CSSProperties,
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

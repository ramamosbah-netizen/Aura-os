'use client';

import { type CSSProperties, useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { readTabs, closeTab, TABS_EVENT, type RecordTab } from '@/lib/tabs';

/**
 * VS Code-style tab strip for open records — sits under the topbar. Tabs are opened
 * by <RecordChrome> when a record page mounts and persist across reloads; clicking
 * switches records without losing the set, × closes (closing the active tab jumps
 * to its neighbour). Renders nothing until a record has been opened.
 */
export default function TabBar() {
  const router = useRouter();
  const pathname = usePathname();
  const [tabs, setTabs] = useState<RecordTab[]>([]);

  useEffect(() => {
    setTabs(readTabs());
    const refresh = () => setTabs(readTabs());
    window.addEventListener(TABS_EVENT, refresh);
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener(TABS_EVENT, refresh);
      window.removeEventListener('storage', refresh);
    };
  }, []);

  if (tabs.length === 0) return null;

  function onClose(e: React.MouseEvent, tab: RecordTab) {
    e.stopPropagation();
    const neighbour = closeTab(tab.href);
    if (pathname === tab.href) router.push(neighbour?.href ?? '/');
  }

  return (
    <div style={s.strip} role="tablist" aria-label="Open records">
      {tabs.map((tab) => {
        const active = pathname === tab.href;
        return (
          <div
            key={tab.href}
            role="tab"
            aria-selected={active}
            title={`${tab.type}: ${tab.title}`}
            style={active ? { ...s.tab, ...s.tabActive } : s.tab}
            onClick={() => router.push(tab.href)}
            onAuxClick={(e) => {
              if (e.button === 1) onClose(e, tab);
            }}
          >
            <span style={s.tabType}>{tab.type}</span>
            <span style={s.tabTitle}>{tab.title}</span>
            <button
              type="button"
              aria-label={`Close ${tab.title}`}
              style={s.close}
              onClick={(e) => onClose(e, tab)}
            >
              ×
            </button>
          </div>
        );
      })}
    </div>
  );
}

const s = {
  strip: {
    display: 'flex',
    alignItems: 'stretch',
    gap: 4,
    padding: '6px 16px 0',
    borderBottom: '1px solid var(--border)',
    background: 'var(--topbar-bg)',
    overflowX: 'auto',
  } as CSSProperties,
  tab: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    maxWidth: 220,
    minWidth: 0,
    padding: '6px 8px 6px 12px',
    border: '1px solid var(--border)',
    borderBottom: 'none',
    borderRadius: '9px 9px 0 0',
    background: 'var(--panel-2)',
    color: 'var(--muted)',
    fontSize: 12.5,
    cursor: 'pointer',
    userSelect: 'none',
    whiteSpace: 'nowrap',
  } as CSSProperties,
  // NOTE: no border* keys here — the base style uses border shorthands, and mixing
  // a longhand (borderColor) with them makes React warn on active↔inactive rerenders.
  tabActive: {
    background: 'var(--panel)',
    color: 'var(--text)',
    boxShadow: 'inset 0 2px 0 var(--accent)',
  } as CSSProperties,
  tabType: {
    fontSize: 10,
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    color: 'var(--accent)',
    flexShrink: 0,
  } as CSSProperties,
  tabTitle: { overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 } as CSSProperties,
  close: {
    background: 'none',
    border: 'none',
    color: 'var(--muted)',
    fontSize: 15,
    lineHeight: 1,
    cursor: 'pointer',
    padding: '0 4px',
    borderRadius: 4,
    flexShrink: 0,
  } as CSSProperties,
};

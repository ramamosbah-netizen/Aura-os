'use client';

import { type CSSProperties, type ReactNode, useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { NAV } from './nav';
import CommandPalette from './command-palette';
import type { SessionUser } from '../lib/session';

/**
 * The persistent app frame: a left sidebar (brand + grouped nav) and a top bar with
 * the ⌘K command-palette trigger. Pages render in <main>. Client component so it can
 * own the palette state + keyboard shortcut; `children` stay server-rendered.
 */
export default function AppShell({
  children,
  user,
}: {
  children: ReactNode;
  user?: SessionUser | null;
}) {
  const pathname = usePathname();
  const [paletteOpen, setPaletteOpen] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key.toLowerCase() === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // The login screen renders bare — no frame.
  if (pathname === '/login') return <>{children}</>;

  async function logout(): Promise<void> {
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.assign('/login');
  }

  return (
    <div style={s.root}>
      <aside style={s.sidebar}>
        <div style={s.brand}>
          <span style={{ color: 'var(--accent)' }}>◆</span> AURA
          <span style={{ color: 'var(--muted)' }}>OS</span>
        </div>
        <nav style={s.nav}>
          {NAV.map((group) => (
            <div key={group.title} style={s.group}>
              <div style={s.groupTitle}>{group.title}</div>
              {group.items.map((item) => {
                const active = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    style={active ? { ...s.link, ...s.linkActive } : s.link}
                  >
                    <span style={s.linkGlyph}>{item.glyph}</span>
                    {item.label}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>
        {user ? (
          <div style={s.userBox}>
            <div style={s.userInfo}>
              <span style={s.userDot} />
              <span style={s.userName}>{user.sub}</span>
            </div>
            <button type="button" style={s.signout} onClick={logout}>
              Sign out
            </button>
          </div>
        ) : null}
      </aside>

      <div style={s.col}>
        <header style={s.topbar}>
          <button type="button" style={s.search} onClick={() => setPaletteOpen(true)}>
            <span style={{ color: 'var(--muted)' }}>Search or jump to…</span>
            <span style={s.kbdHint}>⌘K</span>
          </button>
        </header>
        <main style={s.main}>{children}</main>
      </div>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </div>
  );
}

const SIDEBAR_W = 232;

const s = {
  root: { display: 'flex', minHeight: '100vh' } as CSSProperties,
  sidebar: {
    width: SIDEBAR_W,
    flexShrink: 0,
    display: 'flex',
    flexDirection: 'column',
    borderRight: '1px solid var(--border)',
    background: 'rgba(20,25,37,0.6)',
    padding: '20px 14px',
    position: 'sticky',
    top: 0,
    height: '100vh',
  } as CSSProperties,
  brand: { fontWeight: 700, fontSize: 17, letterSpacing: 0.5, padding: '4px 10px 22px' } as CSSProperties,
  group: { marginBottom: 18 } as CSSProperties,
  groupTitle: {
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    color: 'var(--muted)',
    padding: '0 10px 8px',
  } as CSSProperties,
  link: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '8px 10px',
    borderRadius: 9,
    color: 'var(--text)',
    fontSize: 14,
  } as CSSProperties,
  linkActive: { background: 'var(--panel-2)', color: '#fff' } as CSSProperties,
  linkGlyph: { width: 18, textAlign: 'center', color: 'var(--accent)' } as CSSProperties,
  col: { flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' } as CSSProperties,
  topbar: {
    height: 56,
    display: 'flex',
    alignItems: 'center',
    padding: '0 24px',
    borderBottom: '1px solid var(--border)',
    position: 'sticky',
    top: 0,
    background: 'rgba(11,14,20,0.7)',
    backdropFilter: 'blur(6px)',
    zIndex: 10,
  } as CSSProperties,
  search: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    width: 340,
    maxWidth: '60vw',
    background: 'var(--panel)',
    border: '1px solid var(--border)',
    borderRadius: 10,
    padding: '8px 12px',
    cursor: 'pointer',
    fontSize: 13.5,
  } as CSSProperties,
  kbdHint: {
    fontFamily: 'ui-monospace, monospace',
    fontSize: 11.5,
    color: 'var(--muted)',
    border: '1px solid var(--border)',
    borderRadius: 5,
    padding: '1px 6px',
  } as CSSProperties,
  main: { flex: 1 } as CSSProperties,
  nav: { flex: 1, overflowY: 'auto' } as CSSProperties,
  userBox: { borderTop: '1px solid var(--border)', paddingTop: 12, marginTop: 8 } as CSSProperties,
  userInfo: { display: 'flex', alignItems: 'center', gap: 8, padding: '4px 10px 8px' } as CSSProperties,
  userDot: { width: 7, height: 7, borderRadius: 999, background: 'var(--good)', flexShrink: 0 } as CSSProperties,
  userName: {
    fontSize: 13,
    color: 'var(--text)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  } as CSSProperties,
  signout: {
    width: '100%',
    background: 'transparent',
    border: '1px solid var(--border)',
    borderRadius: 9,
    color: 'var(--muted)',
    padding: '7px 10px',
    fontSize: 13,
    cursor: 'pointer',
  } as CSSProperties,
};

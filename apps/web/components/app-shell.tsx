'use client';

import { type CSSProperties, type ReactNode, useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { SECTIONS, findSuite, findActiveItem, findSection, type Suite } from './nav';
import CommandPalette from './command-palette';
import ThemeToggle from './theme-toggle';
import { pushRecent } from '@/lib/recent-items';
import type { SessionUser } from '@/lib/session';

/**
 * The persistent app frame — enterprise suite navigation:
 *  - Left sidebar: one row per SUITE (business area), grouped in sections.
 *  - Header: top bar (search / company / theme) plus a tab strip with the active
 *    suite's pages, so sibling pages are one click away without the sidebar.
 * Pages render in <main>. Client component so it can own the palette state +
 * keyboard shortcut; `children` stay server-rendered.
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
  const [companyDropdownOpen, setCompanyDropdownOpen] = useState(false);
  const [activeCompany, setActiveCompany] = useState('AURA Group HQ');
  const [isNarrow, setIsNarrow] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Below 900px the sidebar collapses into a hamburger-toggled overlay drawer.
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 900px)');
    const apply = () => setIsNarrow(mq.matches);
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);

  // Navigating closes the drawer.
  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  // Record the page in Recent Items so the palette can offer quick return.
  useEffect(() => {
    if (pathname === '/login') return;
    const suite = findSuite(pathname);
    if (!suite) return;
    const item = findActiveItem(suite, pathname);
    const label = item ? `${suite.label} · ${item.label}` : suite.label;
    pushRecent({ href: pathname, label, type: 'Page' });
  }, [pathname]);

  // Simulated authorized companies — in production, loaded from session/API
  const companies = [
    { id: 'company-hq', name: 'AURA Group HQ' },
    { id: 'company-mep', name: 'AURA MEP LLC' },
    { id: 'company-fm', name: 'AURA Facilities Management' },
    { id: 'company-elv', name: 'AURA ELV Systems' },
  ];

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

  const activeSuite = findSuite(pathname);

  async function logout(): Promise<void> {
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.assign('/login');
  }

  async function switchCompany(companyId: string, companyName: string) {
    setActiveCompany(companyName);
    setCompanyDropdownOpen(false);
    try {
      await fetch('/api/auth/switch-company', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId }),
      });
      // Refresh the current route to reload data with new company context
      window.location.reload();
    } catch (err) {
      console.error('Failed to switch company:', err);
    }
  }

  const sidebarStyle: CSSProperties = isNarrow
    ? { ...s.sidebar, ...s.sidebarDrawer, transform: drawerOpen ? 'translateX(0)' : 'translateX(-100%)' }
    : s.sidebar;

  return (
    <div style={s.root}>
      {isNarrow && drawerOpen && (
        <div style={s.backdrop} onClick={() => setDrawerOpen(false)} aria-hidden />
      )}
      <aside style={sidebarStyle}>
        <div style={s.brand}>
          <span style={{ color: 'var(--accent)' }}>◆</span> AURA
          <span style={{ color: 'var(--muted)' }}>OS</span>
        </div>
        <nav style={s.nav}>
          {SECTIONS.map((section) => (
            <div key={section.title} style={s.group}>
              <div style={s.groupTitle}>{section.title}</div>
              {section.suites.map((suite) => {
                const active = suite === activeSuite;
                return (
                  <Link
                    key={suite.label}
                    href={suite.items[0].href}
                    title={suite.desc}
                    style={active ? { ...s.link, ...s.linkActive } : s.link}
                  >
                    <span style={active ? { ...s.linkGlyph, ...s.linkGlyphActive } : s.linkGlyph}>
                      {suite.glyph}
                    </span>
                    {suite.label}
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
          {isNarrow && (
            <button
              type="button"
              aria-label="Open navigation"
              style={s.hamburger}
              onClick={() => setDrawerOpen((o) => !o)}
            >
              ☰
            </button>
          )}
          <button
            type="button"
            style={isNarrow ? { ...s.search, width: 'auto', flex: 1, minWidth: 0 } : s.search}
            onClick={() => setPaletteOpen(true)}
          >
            <span style={s.searchLabel}>{isNarrow ? 'Search…' : 'Search or jump to…'}</span>
            {!isNarrow && <span style={s.kbdHint}>⌘K</span>}
          </button>

          {/* ── Company Context Switcher ── */}
          <div style={s.companySwitcher}>
            <button
              type="button"
              style={s.companyButton}
              onClick={() => setCompanyDropdownOpen((o) => !o)}
            >
              <span style={s.companyDot} />
              <span style={s.companyName}>{activeCompany}</span>
              <span style={s.companyChevron}>{companyDropdownOpen ? '▴' : '▾'}</span>
            </button>
            {companyDropdownOpen && (
              <div style={s.companyDropdown}>
                {companies.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    style={{
                      ...s.companyOption,
                      ...(c.name === activeCompany ? s.companyOptionActive : {}),
                    }}
                    onClick={() => switchCompany(c.id, c.name)}
                  >
                    <span style={s.companyDotSmall} />
                    {c.name}
                    {c.name === activeCompany && <span style={{ marginLeft: 'auto', color: 'var(--good)' }}>✓</span>}
                  </button>
                ))}
              </div>
            )}
          </div>

          <ThemeToggle />
        </header>

        {/* ── Suite tab strip: sibling pages of the active suite ── */}
        {activeSuite && <SuiteTabs suite={activeSuite} pathname={pathname} />}

        <main style={s.main}>{children}</main>
      </div>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </div>
  );
}

function SuiteTabs({ suite, pathname }: { suite: Suite; pathname: string }) {
  const active = findActiveItem(suite, pathname);
  const section = findSection(suite);
  return (
    <div style={s.tabstripWrap}>
      {/* Breadcrumb: Section › Suite › Page */}
      <nav style={s.crumbs} aria-label="Breadcrumb">
        {section && (
          <>
            <span style={s.crumbMuted}>{section.title}</span>
            <span style={s.crumbSep}>›</span>
          </>
        )}
        <Link href={suite.items[0].href} style={s.crumbLink}>
          <span style={{ color: 'var(--accent)' }}>{suite.glyph}</span> {suite.label}
        </Link>
        {active && (
          <>
            <span style={s.crumbSep}>›</span>
            <span style={s.crumbCurrent}>{active.label}</span>
          </>
        )}
      </nav>

      {/* Page tabs within the suite */}
      {suite.items.length > 1 && (
        <div style={s.tabstrip}>
          <div style={s.tabs}>
            {suite.items.map((item) => {
              const isActive = item === active;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  title={item.desc}
                  style={isActive ? { ...s.tab, ...s.tabActive } : s.tab}
                >
                  {item.label}
                </Link>
              );
            })}
          </div>
        </div>
      )}
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
    background: 'var(--sidebar-bg)',
    padding: '20px 14px',
    position: 'sticky',
    top: 0,
    height: '100vh',
  } as CSSProperties,
  sidebarDrawer: {
    position: 'fixed',
    left: 0,
    top: 0,
    bottom: 0,
    zIndex: 40,
    background: 'var(--panel)',
    transition: 'transform 0.2s ease',
    boxShadow: '0 0 40px rgba(0,0,0,0.35)',
  } as CSSProperties,
  backdrop: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.45)',
    zIndex: 30,
  } as CSSProperties,
  hamburger: {
    background: 'transparent',
    border: '1px solid var(--border)',
    borderRadius: 9,
    color: 'var(--text)',
    fontSize: 16,
    padding: '5px 10px',
    marginRight: 12,
    cursor: 'pointer',
    flexShrink: 0,
  } as CSSProperties,
  brand: { fontWeight: 700, fontSize: 17, letterSpacing: 0.5, padding: '4px 10px 22px' } as CSSProperties,
  group: { marginBottom: 12 } as CSSProperties,
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
    padding: '6px 10px',
    borderRadius: 9,
    color: 'var(--text)',
    fontSize: 13.5,
  } as CSSProperties,
  linkActive: { background: 'var(--panel-2)', color: 'var(--text)', fontWeight: 600 } as CSSProperties,
  linkGlyph: { width: 18, textAlign: 'center', color: 'var(--muted)' } as CSSProperties,
  linkGlyphActive: { color: 'var(--accent)' } as CSSProperties,
  col: { flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' } as CSSProperties,
  topbar: {
    height: 56,
    display: 'flex',
    alignItems: 'center',
    padding: '0 24px',
    borderBottom: '1px solid var(--border)',
    position: 'sticky',
    top: 0,
    background: 'var(--topbar-bg)',
    backdropFilter: 'blur(6px)',
    zIndex: 10,
  } as CSSProperties,

  // ── Breadcrumb + suite tab strip ─────────────────────────────────────────
  tabstripWrap: {
    position: 'sticky',
    top: 56,
    background: 'var(--topbar-bg)',
    backdropFilter: 'blur(6px)',
    zIndex: 9,
    borderBottom: '1px solid var(--border)',
  } as CSSProperties,
  crumbs: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '9px 24px 0',
    fontSize: 12.5,
    flexWrap: 'wrap',
  } as CSSProperties,
  crumbMuted: { color: 'var(--muted)' } as CSSProperties,
  crumbSep: { color: 'var(--muted)', opacity: 0.6 } as CSSProperties,
  crumbLink: { color: 'var(--muted)', fontWeight: 500, display: 'inline-flex', alignItems: 'center', gap: 5 } as CSSProperties,
  crumbCurrent: { color: 'var(--text)', fontWeight: 600 } as CSSProperties,
  tabstrip: {
    display: 'flex',
    alignItems: 'center',
    padding: '0 24px',
    height: 40,
  } as CSSProperties,
  tabs: {
    display: 'flex',
    alignItems: 'center',
    gap: 2,
    overflowX: 'auto',
    scrollbarWidth: 'none',
    height: '100%',
  } as CSSProperties,
  tab: {
    display: 'flex',
    alignItems: 'center',
    height: '100%',
    padding: '0 12px',
    fontSize: 13,
    whiteSpace: 'nowrap',
    color: 'var(--muted)',
    borderBottom: '2px solid transparent',
    marginBottom: -1,
  } as CSSProperties,
  tabActive: {
    color: 'var(--text)',
    borderBottom: '2px solid var(--accent)',
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
  searchLabel: {
    color: 'var(--muted)',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
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

  // ── Company Context Switcher ──────────────────────────────────────────────
  companySwitcher: {
    position: 'relative',
    marginLeft: 'auto',
  } as CSSProperties,
  companyButton: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    background: 'var(--panel)',
    border: '1px solid var(--border)',
    borderRadius: 10,
    padding: '6px 14px',
    cursor: 'pointer',
    color: 'var(--text)',
    fontSize: 13,
    fontFamily: 'inherit',
    transition: 'border-color 0.15s',
  } as CSSProperties,
  companyDot: {
    width: 8,
    height: 8,
    borderRadius: 999,
    background: 'var(--accent)',
    flexShrink: 0,
  } as CSSProperties,
  companyName: {
    maxWidth: 180,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  } as CSSProperties,
  companyChevron: {
    fontSize: 10,
    color: 'var(--muted)',
  } as CSSProperties,
  companyDropdown: {
    position: 'absolute',
    top: 42,
    right: 0,
    width: 260,
    background: 'var(--panel)',
    border: '1px solid var(--border)',
    borderRadius: 12,
    padding: 6,
    zIndex: 100,
    boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
  } as CSSProperties,
  companyOption: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    width: '100%',
    background: 'transparent',
    border: 'none',
    borderRadius: 8,
    padding: '10px 12px',
    cursor: 'pointer',
    color: 'var(--text)',
    fontSize: 13,
    fontFamily: 'inherit',
    transition: 'background 0.12s',
  } as CSSProperties,
  companyOptionActive: {
    background: 'var(--panel-2)',
  } as CSSProperties,
  companyDotSmall: {
    width: 6,
    height: 6,
    borderRadius: 999,
    background: 'var(--muted)',
    flexShrink: 0,
  } as CSSProperties,
};

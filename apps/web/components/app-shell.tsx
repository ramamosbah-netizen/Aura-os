'use client';

import { type CSSProperties, type ReactNode, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { visibleNav, groupAllItems } from './nav';
import Breadcrumbs from './breadcrumbs';
import CommandPalette from './command-palette';
import TabBar from './tab-bar';
import ThemeToggle from './theme-toggle';
import OfflineSyncIndicator from './ui/offline-sync-indicator';
import type { SessionUser } from '@/lib/session';
// Form-engine plugins (field types, validators, formulas, toolbar actions)
// register once for the whole app - before any metadata form renders.
import '../lib/form-plugins';

/**
 * The persistent app frame: a left sidebar (brand + grouped nav) and a top bar with
 * the ⌘K command-palette trigger. Pages render in <main>. Client component so it can
 * own the palette state + keyboard shortcut; `children` stay server-rendered.
 */
export default function AppShell({
  children,
  user,
  navSuites,
  isAdmin,
}: {
  children: ReactNode;
  user?: SessionUser | null;
  /** allowed `suite.*` ids for the current role; null/undefined = show all */
  navSuites?: string[] | null;
  isAdmin?: boolean;
}) {
  const pathname = usePathname();
  // Module Manager: tenant-disabled business modules disappear from the nav for everyone
  // (the API rejects their routes with 403 regardless — this is the UX half).
  const [disabledModules, setDisabledModules] = useState<Set<string>>(new Set());
  useEffect(() => {
    fetch('/api/workspace/modules', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { disabled?: string[] } | null) => {
        if (d?.disabled?.length) setDisabledModules(new Set(d.disabled));
      })
      .catch(() => undefined);
  }, []);
  // Admins always see every suite; otherwise gate by the role's allowed suites.
  const keepItem = (i: { href: string }) => !disabledModules.has(i.href.split('/')[1] ?? '');
  const groups = visibleNav(isAdmin || navSuites == null ? null : new Set(navSuites))
    .map((g) =>
      g.areas
        ? { ...g, areas: g.areas.map((a) => ({ ...a, items: a.items.filter(keepItem) })).filter((a) => a.items.length > 0) }
        : { ...g, items: g.items.filter(keepItem) },
    )
    .filter((g) => (g.areas ? g.areas.length > 0 : g.items.length > 0));
  // ── Workspace model (Linear/VS Code): the sidebar SELECTS a workspace; the workspace owns its
  // pages as a horizontal tab row. The sidebar itself hides with ☰ / Ctrl+B for more table space. ──
  const activeGroup = useMemo(() => {
    if (pathname === '/') return 'Home';
    let best: { title: string; len: number } | null = null;
    for (const g of groups) {
      for (const it of groupAllItems(g)) {
        if (it.href !== '/' && (pathname === it.href || pathname.startsWith(`${it.href}/`)) && (!best || it.href.length > best.len)) {
          best = { title: g.title, len: it.href.length };
        }
      }
    }
    return best?.title ?? null;
  }, [groups, pathname]);
  // The tab row for the workspace you're in (null on Home / front-door pages).
  const workspaceTabs = useMemo(() => {
    if (!activeGroup || activeGroup === 'Home') return null;
    return groups.find((g) => g.title === activeGroup) ?? null;
  }, [groups, activeGroup]);
  // Level 2 (large workspaces only): which DOMAIN you're in, and its pages.
  const activeArea = useMemo(() => {
    if (!workspaceTabs?.areas) return null;
    let best: { title: string; len: number } | null = null;
    for (const a of workspaceTabs.areas) {
      for (const it of a.items) {
        if ((pathname === it.href || pathname.startsWith(`${it.href}/`)) && (!best || it.href.length > best.len)) {
          best = { title: a.title, len: it.href.length };
        }
      }
    }
    return best?.title ?? workspaceTabs.areas[0]?.title ?? null;
  }, [workspaceTabs, pathname]);
  const activeAreaItems = useMemo(
    () => workspaceTabs?.areas?.find((a) => a.title === activeArea)?.items ?? null,
    [workspaceTabs, activeArea],
  );
  const [sidebarHidden, setSidebarHidden] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('aura:sidebar-collapsed');
      if (stored === 'true') setSidebarHidden(true);
    }
  }, []);

  const toggleSidebar = () => {
    setSidebarHidden((prev) => {
      const next = !prev;
      if (typeof window !== 'undefined') {
        localStorage.setItem('aura:sidebar-collapsed', String(next));
      }
      return next;
    });
  };

  const [paletteOpen, setPaletteOpen] = useState(false);
  const [companyDropdownOpen, setCompanyDropdownOpen] = useState(false);
  const [activeCompany, setActiveCompany] = useState('AURA Group HQ');

  // Companies come from the admin registry (/admin/organization); the static list is
  // only the dev fallback when none are configured or the API is down.
  const FALLBACK_COMPANIES = [
    { id: 'company-hq', name: 'AURA Group HQ' },
    { id: 'company-mep', name: 'AURA MEP LLC' },
    { id: 'company-fm', name: 'AURA Facilities Management' },
    { id: 'company-elv', name: 'AURA ELV Systems' },
  ];
  const [companies, setCompanies] = useState(FALLBACK_COMPANIES);

  useEffect(() => {
    fetch('/api/admin/companies', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: Array<{ id: string; name: string; active?: boolean }> | null) => {
        const active = Array.isArray(d) ? d.filter((c) => c.active !== false) : [];
        if (active.length > 0) setCompanies(active.map((c) => ({ id: c.id, name: c.name })));
      })
      .catch(() => undefined);
  }, []);

  const [unreadCount, setUnreadCount] = useState<number>(0);

  useEffect(() => {
    fetch('/api/notifications', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: Array<{ read?: boolean }> | null) => {
        if (Array.isArray(d)) {
          const unread = d.filter((n) => !n.read).length;
          setUnreadCount(unread);
        }
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => undefined);
    }
  }, []);

  const [createDropdownOpen, setCreateDropdownOpen] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key.toLowerCase() === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
      if (e.key.toLowerCase() === 'b' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        toggleSidebar();
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

  return (
    <div style={s.root}>
      {/* WCAG 2.4.1 Bypass Blocks — first tab stop on every page. Lets a keyboard
          user jump the ~60-link sidebar instead of tabbing through it every time. */}
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>
      {!sidebarHidden && (
      <aside className="app-sidebar" style={s.sidebar} aria-label="Primary">
        <div className="sidebar-brand" style={s.brand}>
          <div style={s.brandLogo} aria-hidden>
            ◆
          </div>
          <div className="sidebar-brand-text">
            <div style={s.brandName}>AURA OS</div>
            <div style={s.brandSub}>ENTERPRISE ERP</div>
          </div>
        </div>
        <nav style={s.nav} aria-label="Main navigation">
          {(() => {
            const home = groups.find((g) => g.title === 'Home');
            const admin = groups.find((g) => g.title === 'Administration');
            const workspaces = groups.filter((g) => g.title !== 'Home' && g.title !== 'Administration');
            // A workspace is ONE line — it selects the workspace (lands on its first page). Its pages
            // are the horizontal tab row, not sidebar children.
            const wsLink = (group: (typeof groups)[number]) => {
              const active = activeGroup === group.title;
              return (
                <Link
                  key={group.title}
                  href={groupAllItems(group)[0]?.href ?? '/'}
                  className="sidebar-link"
                  title={group.title}
                  aria-current={active ? 'page' : undefined}
                  style={active ? { ...s.link, ...s.linkActive } : s.link}
                >
                  <span style={active ? { ...s.linkGlyph, ...s.linkGlyphActive } : s.linkGlyph}>{group.glyph}</span>
                  <span className="sidebar-label" style={{ fontWeight: 600 }}>{group.title}</span>
                </Link>
              );
            };
            return (
              <>
                {home?.items.map((item) => {
                  const active = pathname === item.href;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className="sidebar-link"
                      title={item.label}
                      aria-current={active ? 'page' : undefined}
                      style={active ? { ...s.link, ...s.linkActive } : s.link}
                    >
                      <span style={active ? { ...s.linkGlyph, ...s.linkGlyphActive } : s.linkGlyph}>{item.glyph}</span>
                      <span className="sidebar-label">{item.label}</span>
                    </Link>
                  );
                })}
                {workspaces.length > 0 && <div style={s.navDivider} />}
                {workspaces.map(wsLink)}
                {admin && <div style={s.navDivider} />}
                {admin && wsLink(admin)}
              </>
            );
          })()}
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
      )}

      <div style={s.col}>
        <header className="app-topbar" style={s.topbar}>
          <button
            type="button"
            style={s.hamburger}
            onClick={toggleSidebar}
            aria-label={sidebarHidden ? 'Show sidebar' : 'Hide sidebar'}
            title="Toggle sidebar (Ctrl+B)"
          >
            ☰
          </button>
          <button type="button" className="app-topbar-search" style={s.search} onClick={() => setPaletteOpen(true)}>
            <span style={{ color: 'var(--muted)' }}>Search or jump to…</span>
            <span style={s.kbdHint}>⌘K</span>
          </button>

          <div className="app-topbar-crumbs" style={s.crumbSlot}>
            <Breadcrumbs />
          </div>

          {/* ── Quick Create Action ── */}
          <div style={{ position: 'relative', marginRight: 10 }}>
            <button
              type="button"
              style={{
                background: 'var(--accent)',
                border: 'none',
                borderRadius: 8,
                color: '#fff',
                padding: '6px 12px',
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 5,
              }}
              onClick={() => setCreateDropdownOpen((o) => !o)}
            >
              <span>+ Create</span>
              <span style={{ fontSize: 10 }}>{createDropdownOpen ? '▴' : '▾'}</span>
            </button>
            {createDropdownOpen && (
              <div style={{ ...s.companyDropdown, width: 190, right: 0 }}>
                <Link href="/crm/leads" onClick={() => setCreateDropdownOpen(false)} style={s.companyOption}>
                  + New Lead
                </Link>
                <Link href="/crm/quotations" onClick={() => setCreateDropdownOpen(false)} style={s.companyOption}>
                  + New Quotation
                </Link>
                <Link href="/procurement/purchase-orders" onClick={() => setCreateDropdownOpen(false)} style={s.companyOption}>
                  + New PO
                </Link>
                <Link href="/site/daily-reports" onClick={() => setCreateDropdownOpen(false)} style={s.companyOption}>
                  + New Daily Report
                </Link>
              </div>
            )}
          </div>

          {/* ── Pulsing Notification Bell ── */}
          <Link
            href="/inbox"
            style={{
              position: 'relative',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 34,
              height: 34,
              borderRadius: 8,
              background: 'var(--panel)',
              border: '1px solid var(--border)',
              color: 'var(--text)',
              textDecoration: 'none',
              marginRight: 10,
              fontSize: 14,
            }}
            title={unreadCount > 0 ? `${unreadCount} unread notification(s)` : 'Inbox & Notifications'}
          >
            <span>🔔</span>
            {unreadCount > 0 && (
              <span
                style={{
                  position: 'absolute',
                  top: -4,
                  right: -4,
                  minWidth: 16,
                  height: 16,
                  borderRadius: 999,
                  background: 'var(--bad)',
                  color: '#fff',
                  fontSize: 10,
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '0 4px',
                  boxShadow: '0 0 6px var(--bad)',
                }}
              >
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </Link>

          {/* ── Offline Sync Status ── */}
          <OfflineSyncIndicator />

          {/* ── Company Context Switcher ── */}
          <div style={s.companySwitcher}>
            <button
              type="button"
              style={s.companyButton}
              onClick={() => setCompanyDropdownOpen((o) => !o)}
            >
              <span style={s.companyDot} />
              <span className="app-topbar-company-name" style={s.companyName}>{activeCompany}</span>
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
        {workspaceTabs && (
          <nav style={s.wsTabbar} aria-label={`${workspaceTabs.title} navigation`}>
            <span style={s.wsTabbarName}>{workspaceTabs.glyph} {workspaceTabs.title}</span>
            <div style={s.wsTabScroll}>
              {workspaceTabs.areas
                ? workspaceTabs.areas.map((area) => {
                    const active = area.title === activeArea;
                    return (
                      <Link key={area.title} href={area.items[0]?.href ?? '/'} style={active ? { ...s.wsTab, ...s.wsTabActive } : s.wsTab}>
                        <span style={{ opacity: 0.8, fontSize: 12 }}>{area.glyph}</span>
                        {area.title}
                      </Link>
                    );
                  })
                : workspaceTabs.items.map((it) => {
                    const active = pathname === it.href || pathname.startsWith(`${it.href}/`);
                    return (
                      <Link key={it.href} href={it.href} style={active ? { ...s.wsTab, ...s.wsTabActive } : s.wsTab}>
                        <span style={{ opacity: 0.8, fontSize: 12 }}>{it.glyph}</span>
                        {it.label}
                      </Link>
                    );
                  })}
            </div>
          </nav>
        )}
        {activeAreaItems && (
          <nav style={s.wsSubTabbar} aria-label={`${activeArea} navigation`}>
            <div style={s.wsTabScroll}>
              {activeAreaItems.map((it) => {
                const active = pathname === it.href || pathname.startsWith(`${it.href}/`);
                return (
                  <Link key={it.href} href={it.href} style={active ? { ...s.wsSubTab, ...s.wsSubTabActive } : s.wsSubTab}>
                    <span style={{ opacity: 0.75, fontSize: 11.5 }}>{it.glyph}</span>
                    {it.label}
                  </Link>
                );
              })}
            </div>
          </nav>
        )}
        <TabBar />
        <main id="main-content" style={s.main} tabIndex={-1}>
          {children}
        </main>
      </div>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </div>
  );
}

/* Sidebar width now lives in the .app-sidebar CSS class (globals.css) so media
   queries can collapse it to a rail; see the note on s.sidebar below. */

const s = {
  root: { display: 'flex', minHeight: '100vh' } as CSSProperties,
  // NOTE: width / position / height / display / flex-direction / padding / borders
  // deliberately live in the .app-sidebar CSS class, NOT here. Inline styles win over
  // stylesheets, so anything set here can never be overridden by a media query — that
  // is exactly why the shell was desktop-only. Keep this object free of layout.
  sidebar: {
    flexShrink: 0,
  } as CSSProperties,
  brand: { display: 'flex', alignItems: 'center', gap: 11, padding: '2px 8px 22px' } as CSSProperties,
  brandLogo: {
    width: 36,
    height: 36,
    borderRadius: 10,
    background: 'var(--accent-grad)',
    color: 'var(--accent-ink)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 18,
    fontWeight: 900,
    flexShrink: 0,
    boxShadow: '0 4px 14px var(--accent-soft)',
  } as CSSProperties,
  brandName: { fontWeight: 800, fontSize: 15, letterSpacing: 0.3, color: 'var(--text)' } as CSSProperties,
  brandSub: { fontSize: 9, letterSpacing: 1.5, color: 'var(--muted)', marginTop: 1, fontWeight: 700 } as CSSProperties,
  group: { marginBottom: 4 } as CSSProperties,
  navDivider: { height: 1, background: 'var(--border)', margin: '10px 6px' } as CSSProperties,
  hamburger: {
    background: 'transparent', border: 'none', color: 'var(--muted)', fontSize: 18,
    cursor: 'pointer', padding: '4px 12px 4px 0', lineHeight: 1, flexShrink: 0,
  } as CSSProperties,
  wsTabbar: {
    display: 'flex', alignItems: 'center', gap: 14, padding: '0 24px', height: 46,
    borderBottom: '1px solid var(--border)', background: 'var(--panel)',
  } as CSSProperties,
  wsTabbarName: { fontSize: 13, fontWeight: 800, color: 'var(--text)', flexShrink: 0, letterSpacing: 0.2 } as CSSProperties,
  wsTabScroll: { display: 'flex', alignItems: 'center', gap: 4, overflowX: 'auto', flex: 1 } as CSSProperties,
  wsTab: {
    display: 'inline-flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap',
    padding: '7px 12px', borderRadius: 8, fontSize: 13, color: 'var(--muted)',
  } as CSSProperties,
  wsTabActive: { color: 'var(--text)', background: 'var(--panel-2)', fontWeight: 700 } as CSSProperties,
  wsSubTabbar: {
    display: 'flex', alignItems: 'center', gap: 10, padding: '0 24px', height: 40,
    borderBottom: '1px solid var(--border)', background: 'var(--panel-2)',
  } as CSSProperties,
  wsSubTab: {
    display: 'inline-flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap',
    padding: '5px 11px', borderRadius: 7, fontSize: 12.5, color: 'var(--muted)',
  } as CSSProperties,
  wsSubTabActive: { color: 'var(--accent)', fontWeight: 700 } as CSSProperties,
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
  linkActive: {
    background: 'var(--accent-grad)',
    color: 'var(--accent-ink)',
    fontWeight: 700,
    boxShadow: '0 2px 12px var(--accent-soft)',
  } as CSSProperties,
  linkGlyph: { width: 18, textAlign: 'center', color: 'var(--accent)' } as CSSProperties,
  linkGlyphActive: { color: 'var(--accent-ink)' } as CSSProperties,
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
  crumbSlot: { marginLeft: 18, minWidth: 0, flex: 1, overflow: 'hidden' } as CSSProperties,
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

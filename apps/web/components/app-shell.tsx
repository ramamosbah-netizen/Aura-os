'use client';

import { type CSSProperties, type ReactNode, useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { visibleNav } from './nav';
import Breadcrumbs from './breadcrumbs';
import CommandPalette from './command-palette';
import TabBar from './tab-bar';
import ThemeToggle from './theme-toggle';
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
  const groups = visibleNav(isAdmin || navSuites == null ? null : new Set(navSuites))
    .map((g) => ({ ...g, items: g.items.filter((i) => !disabledModules.has(i.href.split('/')[1] ?? '')) }))
    .filter((g) => g.items.length > 0);
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
      <aside style={s.sidebar}>
        <div style={s.brand}>
          <div style={s.brandLogo}>◆</div>
          <div>
            <div style={s.brandName}>AURA OS</div>
            <div style={s.brandSub}>ENTERPRISE ERP</div>
          </div>
        </div>
        <nav style={s.nav}>
          {groups.map((group) => (
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
                    <span style={active ? { ...s.linkGlyph, ...s.linkGlyphActive } : s.linkGlyph}>
                      {item.glyph}
                    </span>
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

          <div style={s.crumbSlot}>
            <Breadcrumbs />
          </div>

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
        <TabBar />
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
    background: 'var(--sidebar-bg)',
    padding: '20px 14px',
    position: 'sticky',
    top: 0,
    height: '100vh',
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

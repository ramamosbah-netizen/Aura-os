'use client';

import type { CSSProperties, ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { PROJECT_AREAS } from '@/lib/project-areas';

// Project Delivery Workspace shell (slice P3). One project, all delivery areas in one place: a
// context header + a left rail that re-projects the delivery modules under `/project/[id]/…`.
// The engines and 360s are unchanged — this is the surface that gathers them around a project.

interface ProjectHead {
  id: string;
  title: string;
  reference: string | null;
  status: string;
}

const NAV: Array<{ slug: string; label: string; icon: string }> = [
  { slug: '', label: 'Overview', icon: '📊' },
  ...PROJECT_AREAS.map((a) => ({ slug: a.slug, label: a.label, icon: a.icon })),
  { slug: 'team', label: 'Team', icon: '👥' },
];

export default function ProjectShell({ project, children }: { project: ProjectHead; children: ReactNode }) {
  const pathname = usePathname();
  const base = `/project/${project.id}`;
  const badge =
    project.status === 'active' ? 'badge badge-good'
    : project.status === 'completed' ? 'badge badge-accent'
    : project.status === 'cancelled' ? 'badge badge-bad'
    : 'badge';

  return (
    <div style={st.wrap}>
      <aside style={st.rail}>
        <Link href="/projects/projects" style={st.back}>← All projects</Link>
        <div style={st.projName}>{project.title}</div>
        <div style={st.projMeta}>
          <span className={badge}>{project.status}</span>
          {project.reference ? <span style={st.ref}>{project.reference}</span> : null}
        </div>
        <nav style={st.nav}>
          {NAV.map((item) => {
            const href = item.slug ? `${base}/${item.slug}` : base;
            const active = item.slug ? pathname === href || pathname.startsWith(`${href}/`) : pathname === base;
            return (
              <Link key={item.slug || 'overview'} href={href} style={{ ...st.navItem, ...(active ? st.navOn : {}) }}>
                <span style={st.navIcon}>{item.icon}</span>
                {item.label}
              </Link>
            );
          })}
        </nav>
        <Link href="/ai" style={st.ai}>🤖 AI Assistant</Link>
      </aside>
      <section style={st.content}>{children}</section>
    </div>
  );
}

const st = {
  wrap: { display: 'flex', gap: 0, alignItems: 'stretch', minHeight: 'calc(100vh - 120px)' } as CSSProperties,
  rail: { width: 232, flexShrink: 0, borderRight: '1px solid var(--border)', padding: '20px 14px', display: 'flex', flexDirection: 'column', gap: 4 } as CSSProperties,
  back: { color: 'var(--muted)', textDecoration: 'none', fontSize: 12, marginBottom: 12 } as CSSProperties,
  projName: { fontSize: 15, fontWeight: 800, color: 'var(--text)', lineHeight: 1.3, marginBottom: 6 } as CSSProperties,
  projMeta: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 16 } as CSSProperties,
  ref: { fontSize: 11, color: 'var(--muted)', fontFamily: 'ui-monospace, monospace' } as CSSProperties,
  nav: { display: 'flex', flexDirection: 'column', gap: 2 } as CSSProperties,
  navItem: { display: 'flex', alignItems: 'center', gap: 9, padding: '8px 10px', borderRadius: 8, color: 'var(--muted)', textDecoration: 'none', fontSize: 13, fontWeight: 600 } as CSSProperties,
  navOn: { background: 'var(--panel)', color: 'var(--accent)', border: '1px solid var(--border)' } as CSSProperties,
  navIcon: { fontSize: 14, width: 18, textAlign: 'center' } as CSSProperties,
  ai: { marginTop: 'auto', paddingTop: 16, color: 'var(--muted)', textDecoration: 'none', fontSize: 12.5, fontWeight: 600 } as CSSProperties,
  content: { flex: 1, minWidth: 0, padding: '24px 28px 64px' } as CSSProperties,
};

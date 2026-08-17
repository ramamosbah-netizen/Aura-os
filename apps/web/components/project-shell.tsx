'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import {
  ArrowLeft,
  Bot,
  ClipboardCheck,
  FileStack,
  Gauge,
  HardHat,
  LayoutDashboard,
  RadioTower,
  ShieldCheck,
  Users,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import { PROJECT_AREAS } from '@/lib/project-areas';
import { useProjectContext } from '@/lib/project-context';
import { ELV_DISCIPLINES } from '@/lib/project-scope';
import styles from './project-shell.module.css';

interface ProjectHead {
  id: string;
  title: string;
  reference: string | null;
  status: string;
}

const AREA_ICONS: Record<string, LucideIcon> = {
  engineering: RadioTower,
  site: HardHat,
  quality: ClipboardCheck,
  hse: ShieldCheck,
  commissioning: Wrench,
  documents: FileStack,
};

const NAV: Array<{ slug: string; label: string; icon: LucideIcon }> = [
  { slug: '', label: 'Command center', icon: LayoutDashboard },
  { slug: 'controls', label: 'Project controls', icon: Gauge },
  ...PROJECT_AREAS.map((area) => ({
    slug: area.slug,
    label: area.label,
    icon: AREA_ICONS[area.slug] ?? Gauge,
  })),
  { slug: 'team', label: 'Project team', icon: Users },
];

export default function ProjectShell({ project, children }: { project: ProjectHead; children: ReactNode }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { disciplineId, setDiscipline } = useProjectContext();
  const base = `/project/${project.id}`;
  const query = searchParams.toString();
  const scoped = (href: string): string => (query ? `${href}?${query}` : href);
  const statusClass =
    project.status === 'active' ? 'badge badge-good'
      : project.status === 'completed' ? 'badge badge-accent'
        : project.status === 'cancelled' ? 'badge badge-bad'
          : 'badge';

  return (
    <div className={styles.workspace}>
      <aside className={styles.rail} aria-label="Project workspace">
        <Link href="/projects/projects" className={styles.backLink}>
          <ArrowLeft size={14} aria-hidden />
          All projects
        </Link>

        <div className={styles.projectIdentity}>
          <div className={styles.identityMark} aria-hidden>
            {project.reference?.slice(0, 2).toUpperCase() || 'PX'}
          </div>
          <div className={styles.identityCopy}>
            <span className={styles.eyebrow}>Project context</span>
            <strong className={styles.projectName}>{project.title}</strong>
          </div>
        </div>

        <div className={styles.projectMeta}>
          <span className={statusClass}>{project.status}</span>
          {project.reference ? <code className={styles.reference}>{project.reference}</code> : null}
        </div>

        <label className={styles.lens}>
          <span>System / discipline lens</span>
          <select
            aria-label="System or discipline lens"
            value={disciplineId ?? ''}
            onChange={(event) => setDiscipline(event.target.value || null)}
          >
            <option value="">All systems</option>
            {ELV_DISCIPLINES.map((discipline) => (
              <option key={discipline.id} value={discipline.id}>{discipline.label}</option>
            ))}
          </select>
        </label>

        <nav className={styles.navigation} aria-label="Project delivery areas">
          {NAV.map((item) => {
            const href = item.slug ? `${base}/${item.slug}` : base;
            const active = item.slug
              ? pathname === href || pathname.startsWith(`${href}/`)
              : pathname === base;
            const Icon = item.icon;
            return (
              <Link
                key={item.slug || 'overview'}
                href={scoped(href)}
                className={active ? `${styles.navItem} ${styles.navItemActive}` : styles.navItem}
                aria-current={active ? 'page' : undefined}
              >
                <Icon size={16} strokeWidth={1.8} aria-hidden />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <Link href="/ai" className={styles.aiLink}>
          <Bot size={16} aria-hidden />
          Open AI workspace
        </Link>
      </aside>
      <section className={styles.content}>{children}</section>
    </div>
  );
}

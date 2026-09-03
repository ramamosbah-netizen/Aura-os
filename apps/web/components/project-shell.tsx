'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import {
  ArrowLeft,
  Bot,
  CalendarRange,
  ClipboardCheck,
  FileStack,
  Gauge,
  LayoutDashboard,
  ShoppingCart,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { useProjectContext } from '@/lib/project-context';
import { ELV_DISCIPLINES } from '@/lib/project-scope';
import styles from './project-shell.module.css';

interface ProjectHead {
  id: string;
  title: string;
  reference: string | null;
  status: string;
}

const PEOPLE_NAV: Array<{ key: string; slug: string; label: string; icon: LucideIcon }> = [
  { slug: 'team', key: 'team', label: 'Project team', icon: Users },
];

// Delivery records remain available as project-scoped context links, but are not repeated as a
// second module navigation. Their canonical workspace is Delivery Operations.

export default function ProjectShell({ project, children }: { project: ProjectHead; children: ReactNode }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { disciplineId, setDiscipline } = useProjectContext();
  const base = `/project/${project.id}`;
  const query = searchParams.toString();
  const scoped = (href: string): string => {
    if (!query || href.includes('?')) return href;
    const hashIndex = href.indexOf('#');
    if (hashIndex === -1) return `${href}?${query}`;
    return `${href.slice(0, hashIndex)}?${query}${href.slice(hashIndex)}`;
  };
  const officeNav: NavItem[] = [
    { key: 'overview', label: 'Overview', icon: LayoutDashboard, href: base, active: pathname === base },
    { key: 'schedule', label: 'Plan & schedule', icon: CalendarRange, href: `/projects/schedule?projectId=${encodeURIComponent(project.id)}`, active: pathname === '/projects/schedule' },
    { key: 'progress', label: 'Progress & execution', icon: Gauge, href: `${base}/site`, active: pathname.startsWith(`${base}/site`) },
    { key: 'controls', label: 'Commercial & cost', icon: Gauge, href: `${base}/controls`, active: pathname.startsWith(`${base}/controls`) },
    { key: 'risks', label: 'Risks & issues', icon: Gauge, href: `${base}#needs-attention`, active: false },
    { key: 'changes', label: 'Changes', icon: Gauge, href: `${base}/controls?tab=variations`, active: pathname.startsWith(`${base}/controls`) && searchParams.get('tab') === 'variations' },
  ];
  const deliveryNav: NavItem[] = [
    { key: 'subcontracts', label: 'Subcontracts', icon: FileStack, href: `/subcontracts/subcontracts?projectId=${encodeURIComponent(project.id)}`, active: pathname === '/subcontracts/subcontracts' && searchParams.get('projectId') === project.id },
    { key: 'procurement', label: 'Procurement', icon: ShoppingCart, href: `/procurement/purchase-requests?projectId=${encodeURIComponent(project.id)}`, active: pathname.startsWith('/procurement/purchase-requests') || pathname.startsWith('/procurement/purchase-orders') },
    { key: 'approvals', label: 'Approvals & actions', icon: ClipboardCheck, href: `/my-work/approvals?projectId=${encodeURIComponent(project.id)}`, active: pathname.startsWith('/my-work/approvals') },
    { key: 'evidence', label: 'Evidence & documents', icon: FileStack, href: `${base}/documents`, active: pathname.startsWith(`${base}/documents`) },
    { key: 'team', label: 'Team & ownership', icon: Users, href: `${base}/team`, active: pathname.startsWith(`${base}/team`) },
    { key: 'activity', label: 'Activity & history', icon: Gauge, href: `${base}#activity-history`, active: false },
    { key: 'closeout', label: 'Handover & closeout', icon: ClipboardCheck, href: `${base}/controls?tab=closeout`, active: pathname.startsWith(`${base}/controls`) && searchParams.get('tab') === 'closeout' },
  ];
  const statusClass =
    project.status === 'active' ? 'badge badge-good'
      : project.status === 'completed' ? 'badge badge-accent'
        : project.status === 'cancelled' ? 'badge badge-bad'
          : 'badge';

  return (
    <div className={styles.workspace}>
      <header className={styles.contextBar} aria-label="Project workspace">
        <div className={styles.contextTop}>
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
          <Link href="/ai" className={styles.aiLink}>
            <Bot size={16} aria-hidden />
            AI workspace
          </Link>
        </div>
        <nav className={styles.navigation} aria-label="Project delivery areas">
          <NavGroup label="Project office" items={officeNav} pathname={pathname} base={base} scoped={scoped} />
          <NavGroup label="Delivery" items={deliveryNav} pathname={pathname} base={base} scoped={scoped} />
          <NavGroup label="People" items={PEOPLE_NAV} pathname={pathname} base={base} scoped={scoped} />
        </nav>
        <div className={styles.navHint}>
          <span>Project 360 connects the work; specialist domains remain the canonical owners.</span>
          <Link href="/operations/overview">Open specialist views →</Link>
        </div>
      </header>
      <section className={styles.content}>{children}</section>
    </div>
  );
}

interface NavItem {
  key: string;
  label: string;
  icon: LucideIcon;
  href?: string;
  active?: boolean;
  slug?: string;
}

function NavGroup({
  label,
  items,
  pathname,
  base,
  scoped,
}: {
  label: string;
  items: NavItem[];
  pathname: string;
  base: string;
  scoped: (href: string) => string;
}) {
  return (
    <div className={styles.navGroup}>
      <span className={styles.navGroupLabel}>{label}</span>
      {items.map((item) => {
        const href = item.href ?? (item.slug ? `${base}/${item.slug}` : base);
        const active = item.active ?? (item.slug
          ? pathname === href || pathname.startsWith(`${href}/`)
          : pathname === base);
        const Icon = item.icon;
        return (
          <Link
            key={item.key}
            href={scoped(href)}
            className={active ? `${styles.navItem} ${styles.navItemActive}` : styles.navItem}
            aria-current={active ? 'page' : undefined}
          >
            <Icon size={16} strokeWidth={1.8} aria-hidden />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </div>
  );
}

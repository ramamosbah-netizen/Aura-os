'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import {
  Bot,
  CalendarRange,
  CircleDollarSign,
  ClipboardCheck,
  ClipboardList,
  FileStack,
  FileText,
  Gauge,
  Handshake,
  HardHat,
  History,
  LayoutDashboard,
  ListChecks,
  ShoppingCart,
  ShieldCheck,
  Wrench,
  Users,
  ChevronDown,
  type LucideIcon,
} from 'lucide-react';
import { useProjectContext } from '@/lib/project-context';
import { ELV_DISCIPLINES } from '@/lib/project-scope';
import styles from './project-shell.module.css';

interface ProjectHead {
  id: string;
  title: string;
  reference: string | null;
  contractId?: string | null;
  status: string;
}

// Delivery records remain available as project-scoped context links. Their canonical workspace
// stays with the owning domain; this rail only gives the Project Manager one coherent entry point.

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
  const projectNav: NavItem[] = [
    { key: 'overview', label: 'Overview', icon: LayoutDashboard, href: base, active: pathname === base },
    { key: 'setup', label: 'Setup', icon: ClipboardList, href: `${base}#project-setup`, active: false },
    { key: 'scope', label: 'Scope & contract', icon: FileText, href: project.contractId ? `/contracts/contracts/${project.contractId}` : `${base}#project-setup`, active: project.contractId ? pathname.startsWith('/contracts/contracts/') : false },
    { key: 'team', label: 'Team & resources', icon: Users, href: `${base}/team`, active: pathname.startsWith(`${base}/team`) },
  ];
  const planNav: NavItem[] = [
    { key: 'schedule', label: 'Plan & schedule', icon: CalendarRange, href: `/projects/schedule?projectId=${encodeURIComponent(project.id)}`, active: pathname === '/projects/schedule' },
    { key: 'wbs', label: 'WBS & progress', icon: Gauge, href: `${base}/controls`, active: pathname.startsWith(`${base}/controls`) && !['variations', 'closeout'].includes(searchParams.get('tab') ?? '') },
    { key: 'controls', label: 'Project controls', icon: Gauge, href: `${base}/controls`, active: pathname.startsWith(`${base}/controls`) },
    { key: 'risks', label: 'Risks & issues', icon: ShieldCheck, href: `${base}#needs-attention`, active: false },
    { key: 'changes', label: 'Changes & claims', icon: Handshake, href: `${base}/controls?tab=variations`, active: pathname.startsWith(`${base}/controls`) && searchParams.get('tab') === 'variations' },
  ];
  const deliveryNav: NavItem[] = [
    { key: 'engineering', label: 'Engineering', icon: Wrench, href: `${base}/engineering`, active: pathname === `${base}/engineering` },
    { key: 'procurement', label: 'Procurement', icon: ShoppingCart, href: `/procurement/purchase-requests?projectId=${encodeURIComponent(project.id)}`, active: pathname.startsWith('/procurement/purchase-requests') || pathname.startsWith('/procurement/purchase-orders') },
    { key: 'subcontracts', label: 'Subcontracts', icon: FileStack, href: `/subcontracts/subcontracts?projectId=${encodeURIComponent(project.id)}`, active: pathname === '/subcontracts/subcontracts' && searchParams.get('projectId') === project.id },
    { key: 'site', label: 'Site execution', icon: HardHat, href: `${base}/site`, active: pathname.startsWith(`${base}/site`) },
    { key: 'quality', label: 'Quality', icon: ClipboardCheck, href: `${base}/quality`, active: pathname === `${base}/quality` },
    { key: 'hse', label: 'HSE', icon: ShieldCheck, href: `${base}/hse`, active: pathname === `${base}/hse` },
  ];
  const commercialNav: NavItem[] = [
    { key: 'budget', label: 'Budget & cost', icon: CircleDollarSign, href: `${base}/controls?tab=cost`, active: pathname.startsWith(`${base}/controls`) && searchParams.get('tab') === 'cost' },
    { key: 'certification', label: 'Certification', icon: ClipboardCheck, href: `/contracts/certificates?projectId=${encodeURIComponent(project.id)}`, active: pathname.startsWith('/contracts/certificates') },
  ];
  const informationNav: NavItem[] = [
    { key: 'documents', label: 'Documents', icon: FileStack, href: `${base}/documents`, active: pathname.startsWith(`${base}/documents`) },
    { key: 'approvals', label: 'Approvals & actions', icon: ListChecks, href: `/my-work/approvals?projectId=${encodeURIComponent(project.id)}`, active: pathname.startsWith('/my-work/approvals') },
    { key: 'activity', label: 'Activity & history', icon: History, href: `${base}#activity-history`, active: false },
  ];
  const completionNav: NavItem[] = [
    { key: 'commissioning', label: 'Testing & commissioning', icon: Wrench, href: `/commissioning?projectId=${encodeURIComponent(project.id)}`, active: pathname.startsWith('/commissioning') },
    { key: 'handover', label: 'Handover', icon: ClipboardCheck, href: `/handover?projectId=${encodeURIComponent(project.id)}`, active: pathname.startsWith('/handover') },
    { key: 'closeout', label: 'Closeout', icon: ClipboardCheck, href: `${base}/controls?tab=closeout`, active: pathname.startsWith(`${base}/controls`) && searchParams.get('tab') === 'closeout' },
  ];
  const statusClass =
    project.status === 'active' ? 'badge badge-good'
      : project.status === 'completed' ? 'badge badge-accent'
        : project.status === 'cancelled' ? 'badge badge-bad'
          : 'badge';

  return (
    <div className={styles.workspace}>
      <aside className={styles.projectRail} aria-label="Project workspace">
        <div className={styles.contextTop}>
          <span className={styles.contextLabel}>PROJECT 360</span>
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
        <nav className={styles.navigation} aria-label="Project 360 navigation">
          <NavGroup label="Project" items={projectNav} pathname={pathname} base={base} scoped={scoped} />
          <NavGroup label="Plan & control" items={planNav} pathname={pathname} base={base} scoped={scoped} />
          <NavGroup label="Delivery" items={deliveryNav} pathname={pathname} base={base} scoped={scoped} />
          <NavGroup label="Commercial" items={commercialNav} pathname={pathname} base={base} scoped={scoped} />
          <NavGroup label="Information" items={informationNav} pathname={pathname} base={base} scoped={scoped} />
          <NavGroup label="Completion" items={completionNav} pathname={pathname} base={base} scoped={scoped} />
        </nav>
        <div className={styles.navHint}>
          <span>Project 360 connects the work; specialist domains remain the canonical owners.</span>
          <Link href="/operations/overview">Open specialist views →</Link>
        </div>
      </aside>
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
    <details className={styles.navGroup} open>
      <summary className={styles.navGroupLabel}><span>{label}</span><ChevronDown size={13} aria-hidden /></summary>
      <div className={styles.navGroupItems}>{items.map((item) => {
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
      })}</div>
    </details>
  );
}

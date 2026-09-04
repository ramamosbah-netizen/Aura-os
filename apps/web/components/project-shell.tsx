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
  HardHat,
  History,
  LayoutDashboard,
  ListChecks,
  ShoppingCart,
  ShieldCheck,
  Wrench,
  ArrowUpRight,
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
  const workspace = (section: string): string => `${base}/workspace/${section}`;
  const navItems: NavItem[] = [
    { key: 'overview', group: 'Project', label: 'Overview', description: 'Project cockpit and live health', icon: LayoutDashboard, href: base, active: pathname === base },
    { key: 'project', group: 'Project', label: 'Project', description: 'Setup, scope and ownership', icon: ClipboardList, href: workspace('project'), active: pathname === workspace('project') },
    { key: 'plan', group: 'Plan & Control', label: 'Plan & Control', description: 'Schedule, WBS and project controls', icon: CalendarRange, href: workspace('plan'), active: pathname === workspace('plan') || pathname.startsWith(`${base}/controls`) && !['cost', 'closeout'].includes(searchParams.get('tab') ?? '') },
    { key: 'engineering', group: 'Delivery', label: 'Engineering', description: 'Drawings, RFIs and technical records', icon: Wrench, href: workspace('engineering'), active: pathname === workspace('engineering') || pathname === `${base}/engineering` },
    { key: 'procurement', group: 'Delivery', label: 'Procurement', description: 'Material requirements and buying', icon: ShoppingCart, href: workspace('procurement'), active: pathname === workspace('procurement') || pathname.startsWith('/procurement/') },
    { key: 'subcontracts', group: 'Delivery', label: 'Subcontracts', description: 'Packages, tenders and awards', icon: FileStack, href: workspace('subcontracts'), active: pathname === workspace('subcontracts') || pathname.startsWith('/subcontracts/') },
    { key: 'site', group: 'Delivery', label: 'Site', description: 'Work instructions, reports and progress', icon: HardHat, href: workspace('site'), active: pathname === workspace('site') || pathname.startsWith(`${base}/site`) },
    { key: 'quality', group: 'Delivery', label: 'Quality', description: 'Inspections, NCRs and corrective actions', icon: ClipboardCheck, href: workspace('quality'), active: pathname === workspace('quality') || pathname === `${base}/quality` },
    { key: 'hse', group: 'Delivery', label: 'HSE', description: 'Permits, observations and safety actions', icon: ShieldCheck, href: workspace('hse'), active: pathname === workspace('hse') || pathname.startsWith('/hse/') },
    { key: 'commercial', group: 'Commercial', label: 'Commercial', description: 'Contract value, cost and changes', icon: CircleDollarSign, href: workspace('commercial'), active: pathname === workspace('commercial') || pathname.startsWith(`${base}/controls`) && searchParams.get('tab') === 'cost' },
    { key: 'documents', group: 'Information', label: 'Documents', description: 'Controlled project information', icon: FileStack, href: workspace('documents'), active: pathname === workspace('documents') || pathname.startsWith(`${base}/documents`) },
    { key: 'approvals', group: 'Information', label: 'Approvals & Actions', description: 'Decisions and project actions', icon: ListChecks, href: workspace('approvals'), active: pathname === workspace('approvals') || pathname.startsWith('/my-work/approvals') },
    { key: 'testing', group: 'Completion', label: 'Testing & Commissioning', description: 'Test plans, records and commissioning', icon: Wrench, href: workspace('testing'), active: pathname === workspace('testing') || pathname.startsWith('/commissioning') },
    { key: 'handover', group: 'Completion', label: 'Handover & Closeout', description: 'Readiness, closeout and acceptance', icon: ClipboardCheck, href: workspace('handover'), active: pathname === workspace('handover') || pathname.startsWith('/handover') },
    { key: 'activity', group: 'Information', label: 'Activity & History', description: 'Timeline and audit history', icon: History, href: workspace('activity'), active: pathname === workspace('activity') },
  ];
  const navGroups = ['Project', 'Plan & Control', 'Delivery', 'Commercial', 'Information', 'Completion']
    .map((group) => ({ group, items: navItems.filter((item) => item.group === group) }))
    .filter((group) => group.items.length > 0);
  const statusClass =
    project.status === 'active' ? 'badge badge-good'
      : project.status === 'completed' ? 'badge badge-accent'
        : project.status === 'cancelled' ? 'badge badge-bad'
          : 'badge';

  const workspaceNavigation = (
      <section className={styles.projectRail} aria-label="Project workspace">
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
        <div className={styles.workspaceTitle}>
          <div>
            <span>PROJECT 360 WORKSPACE</span>
            <h2>Project 360</h2>
            <p>Open the project management workspace you need.</p>
          </div>
          <strong>{navItems.length} shortcuts</strong>
        </div>
        <nav className={styles.navigation} aria-label="Project 360 navigation">
          {navGroups.map(({ group, items }) => <section key={group} className={styles.navGroup} aria-labelledby={`project-nav-${group.replace(/\s+/g, '-').toLowerCase()}`}>
            <div className={styles.navGroupHeader}>
              <span id={`project-nav-${group.replace(/\s+/g, '-').toLowerCase()}`}>{group}</span>
              <i aria-hidden />
            </div>
            <div className={styles.navGroupGrid}>
              {items.map((item) => {
                const Icon = item.icon;
                return <Link key={item.key} href={scoped(item.href ?? base)} className={item.active ? `${styles.navItem} ${styles.navItemActive}` : styles.navItem} aria-current={item.active ? 'page' : undefined}><span className={styles.navItemTop}><Icon size={16} strokeWidth={1.8} aria-hidden /><ArrowUpRight size={14} aria-hidden /></span><span className={styles.navItemCopy}><strong>{item.label}</strong><small>{item.description}</small></span></Link>;
              })}
            </div>
          </section>)}
        </nav>
        <div className={styles.navHint}>
          <span>Project 360 connects the work; specialist domains remain the canonical owners.</span>
          <Link href="/operations/overview">Open specialist views →</Link>
        </div>
      </section>
  );

  // Inner Project 360 pages keep only the project context header. Navigation is
  // intentionally not repeated here; Overview and Setup own the grouped launcher
  // below their content, matching the Sales suite's shortcut pattern.
  const contextHeader = (
      <section className={styles.contextBar} aria-label="Project context">
        <Link href="/projects/projects" className={styles.contextBack}>← All projects</Link>
        <div className={styles.contextBarIdentity}>
          <div className={styles.identityMark} aria-hidden>{project.reference?.slice(0, 2).toUpperCase() || 'PX'}</div>
          <div className={styles.identityCopy}>
            <span className={styles.eyebrow}>Project 360</span>
            <strong className={styles.projectName}>{project.title}</strong>
            <span className={styles.contextBarMeta}>{project.reference || 'Reference not established'} · {project.status}</span>
          </div>
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
        <Link href="/ai" className={styles.aiLink}><Bot size={15} aria-hidden /> AI workspace</Link>
      </section>
  );

  const isOverview = pathname === base;
  const isSetup = pathname === workspace('project');
  const showFullLauncher = isOverview || isSetup;
  return (
    <div className={styles.workspace}>
      <section className={styles.content}>
        {!showFullLauncher ? contextHeader : null}
        {children}
      </section>
      {showFullLauncher ? workspaceNavigation : null}
    </div>
  );
}

interface NavItem {
  key: string;
  group: string;
  label: string;
  description: string;
  icon: LucideIcon;
  href?: string;
  active?: boolean;
}

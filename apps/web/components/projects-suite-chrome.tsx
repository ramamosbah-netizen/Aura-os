import Link from 'next/link';
import {
  CalendarRange,
  CheckCircle2,
  ClipboardCheck,
  FolderKanban,
  GitBranch,
  Gauge,
  LayoutDashboard,
  type LucideIcon,
} from 'lucide-react';
import styles from './projects-suite-chrome.module.css';

type SuiteNavItem = { href: string; label: string; icon: LucideIcon; key: string };

const NAV_ITEMS: SuiteNavItem[] = [
  { key: 'overview', label: 'Overview', href: '/projects/dashboard', icon: LayoutDashboard },
  { key: 'register', label: 'Projects', href: '/projects/projects', icon: FolderKanban },
  { key: 'schedule', label: 'Plan & schedule', href: '/projects/schedule', icon: CalendarRange },
  { key: 'controls', label: 'Controls', href: '/projects/controls', icon: Gauge },
  { key: 'changes', label: 'Changes', href: '/projects/variations', icon: GitBranch },
  { key: 'approvals', label: 'Approvals', href: '/projects/approvals', icon: ClipboardCheck },
  { key: 'closeout', label: 'Closeout', href: '/projects/closeout', icon: CheckCircle2 },
];

export default function ProjectsSuiteChrome({
  active,
  title,
  description,
  children,
}: {
  active: string;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className={styles.frame}>
      <header className={styles.header}>
        <div className={styles.identity}>
          <Link href="/projects/dashboard" className={styles.brand} aria-label="Projects overview">
            <span className={styles.brandMark}><FolderKanban size={15} aria-hidden /></span>
            <span><small>AURA OS / PROJECTS</small><strong>Project delivery suite</strong></span>
          </Link>
          <span className={styles.divider} aria-hidden />
          <div className={styles.pageIdentity}>
            <span className={styles.eyebrow}>Workspace</span>
            <h1>{title}</h1>
            <p>{description}</p>
          </div>
        </div>
        <Link href="/projects/projects" className={styles.openRegister}>Open project register <span>↗</span></Link>
      </header>
      <nav className={styles.nav} aria-label="Projects suite navigation">
        <ProjectsSuiteNav active={active} />
      </nav>
      <div className={styles.content}>{children}</div>
    </div>
  );
}

/** Compact navigation used by the suite landing dashboard without duplicating its hero. */
export function ProjectsSuiteNav({ active }: { active: string }) {
  return <>
    {NAV_ITEMS.map((item) => {
      const Icon = item.icon;
      const selected = item.key === active;
      return <Link key={item.key} href={item.href} className={selected ? `${styles.navItem} ${styles.navItemActive}` : styles.navItem} aria-current={selected ? 'page' : undefined}>
        <Icon size={15} aria-hidden /><span>{item.label}</span>
      </Link>;
    })}
  </>;
}

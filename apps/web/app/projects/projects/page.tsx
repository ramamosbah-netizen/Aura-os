import { CalendarDays, ChevronRight, CircleDot, Clock3, FolderKanban, Search, SlidersHorizontal, Sparkles, WalletCards } from 'lucide-react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { fetchJson, getJson } from '@/lib/api';
import DataStateNotice from '@/components/ui/data-state';
import ProjectCreate, { ProjectEdit } from '../../../components/project-create';
import styles from './projects-register.module.css';

export const dynamic = 'force-dynamic';

interface Project {
  id: string;
  title: string;
  contractTitle: string | null;
  accountName: string | null;
  status: string;
  value: number;
  createdAt: string;
}

interface ActiveContract {
  id: string;
  title: string;
  accountId: string | null;
  accountName: string | null;
  value: number;
}

const STATUS_LABELS: Record<string, string> = {
  planned: 'Planned',
  active: 'Active',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

function money(n: number): string {
  return n > 0 ? `AED ${n.toLocaleString('en-AE', { maximumFractionDigits: 0 })}` : 'Not established';
}

function dateLabel(iso: string): string {
  return new Date(iso).toLocaleDateString('en-AE', { day: '2-digit', month: 'short', year: 'numeric' });
}

function statusClass(status: string): string {
  return status === 'active' ? styles.statusActive
    : status === 'completed' ? styles.statusCompleted
      : status === 'cancelled' ? styles.statusCancelled
        : styles.statusPlanned;
}

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<{ projectId?: string; q?: string; status?: string }>;
}) {
  const { projectId, q: rawQuery, status: rawStatus } = await searchParams;
  const query = (rawQuery ?? '').trim();
  const status = rawStatus ?? 'all';

  const [projectsResult, activeContracts] = await Promise.all([
    fetchJson<Project[]>('/api/projects/projects'),
    getJson<ActiveContract[]>('/api/contracts/contracts?status=active'),
  ]);

  const projects: Project[] = projectsResult.ok ? projectsResult.data : [];
  if (projectId && projectsResult.ok && projects.some((project) => project.id === projectId)) {
    redirect(`/project/${encodeURIComponent(projectId)}/controls`);
  }

  const normalizedQuery = query.toLowerCase();
  const visibleProjects = projects.filter((project) => {
    const matchesStatus = status === 'all' || project.status === status;
    const haystack = `${project.title} ${project.contractTitle ?? ''} ${project.accountName ?? ''}`.toLowerCase();
    return matchesStatus && (!normalizedQuery || haystack.includes(normalizedQuery));
  });
  const activeCount = projects.filter((project) => project.status === 'active').length;
  const plannedCount = projects.filter((project) => project.status === 'planned').length;
  const completedCount = projects.filter((project) => project.status === 'completed').length;
  const portfolioValue = projects.reduce((sum, project) => sum + (project.value || 0), 0);
  const registerCountLabel = projectsResult.ok ? `${visibleProjects.length} shown` : 'Unavailable';

  return (
    <div className={styles.page}>
      <header className={styles.hero}>
        <div className={styles.heroCopy}>
          <div className={styles.eyebrow}><span>Projects / Portfolio</span><span className={styles.live}><i />Live workspace</span></div>
          <h1>Projects, in motion.</h1>
          <p>One clear view of every project, its commercial origin, and the next decision needed to move delivery forward.</p>
        </div>
        <div className={styles.heroActions}>
          <Link href="/projects/schedule" className={styles.secondaryAction}><CalendarDays size={15} aria-hidden /> Plan & schedule</Link>
          <div className={styles.createAction}><ProjectCreate contracts={(activeContracts ?? []).map((contract) => ({
            id: contract.id,
            title: contract.title,
            accountId: contract.accountId,
            accountName: contract.accountName,
            value: contract.value,
          }))} /></div>
        </div>
      </header>

      <section className={styles.signalGrid} aria-label="Portfolio snapshot">
        <article className={`${styles.signalCard} ${styles.signalLead}`}>
          <span className={styles.signalIcon}><FolderKanban size={18} aria-hidden /></span>
          <div><small>Portfolio</small><strong>{projectsResult.ok ? projects.length : '—'}</strong><span>{projectsResult.ok ? 'total projects' : 'data unavailable'}</span></div>
          <div className={styles.signalAccent} aria-hidden />
        </article>
        <article className={styles.signalCard}>
          <span className={`${styles.signalIcon} ${styles.iconGreen}`}><CircleDot size={18} aria-hidden /></span>
          <div><small>In delivery</small><strong>{projectsResult.ok ? activeCount : '—'}</strong><span>{projectsResult.ok ? 'active projects' : 'data unavailable'}</span></div>
        </article>
        <article className={styles.signalCard}>
          <span className={`${styles.signalIcon} ${styles.iconBlue}`}><Clock3 size={18} aria-hidden /></span>
          <div><small>Pipeline</small><strong>{projectsResult.ok ? plannedCount : '—'}</strong><span>{projectsResult.ok ? 'planned projects' : 'data unavailable'}</span></div>
        </article>
        <article className={styles.signalCard}>
          <span className={`${styles.signalIcon} ${styles.iconAmber}`}><WalletCards size={18} aria-hidden /></span>
          <div><small>Portfolio value</small><strong>{projectsResult.ok && portfolioValue > 0 ? `AED ${(portfolioValue / 1000).toLocaleString('en-AE', { maximumFractionDigits: 0 })}k` : '—'}</strong><span>{projectsResult.ok ? `${completedCount} completed` : 'data unavailable'}</span></div>
        </article>
      </section>

      <section className={styles.register} aria-labelledby="projects-register-title" data-testid="projects-register">
        <div className={styles.registerHeader}>
          <div>
            <p className={styles.kicker}>Official register</p>
            <div className={styles.titleLine}><h2 id="projects-register-title">Your project portfolio</h2><span className={styles.countPill}>{registerCountLabel}</span></div>
            <p className={styles.registerDescription}>Open a project workspace for the complete plan, controls, execution context and closeout trail.</p>
          </div>
          <form method="get" className={styles.filters} aria-label="Filter projects">
            <label className={styles.searchBox}><Search size={15} aria-hidden /><span className="sr-only">Search projects</span><input name="q" defaultValue={query} placeholder="Search projects, clients…" /></label>
            <label className={styles.selectBox}><SlidersHorizontal size={14} aria-hidden /><span className="sr-only">Status</span><select name="status" defaultValue={status}><option value="all">All statuses</option><option value="active">Active</option><option value="planned">Planned</option><option value="completed">Completed</option><option value="cancelled">Cancelled</option></select></label>
            <button type="submit" className={styles.filterButton}>Apply</button>
            {query || status !== 'all' ? <Link href="/projects/projects" className={styles.resetLink}>Reset</Link> : null}
          </form>
        </div>

        {!projectsResult.ok ? (
          <DataStateNotice error={projectsResult.error} subject="projects" compact />
        ) : projects.length === 0 ? (
          <div className={styles.emptyState}><span className={styles.emptyIcon}><FolderKanban size={20} aria-hidden /></span><h3>No projects yet</h3><p>Start a project from an active contract to create the first delivery workspace.</p></div>
        ) : visibleProjects.length === 0 ? (
          <div className={styles.emptyState}><span className={styles.emptyIcon}><Search size={20} aria-hidden /></span><h3>No matching projects</h3><p>Try a different search or clear the filters to see the full portfolio.</p><Link href="/projects/projects" className={styles.resetButton}>Clear filters</Link></div>
        ) : (
          <div className={styles.projectGrid}>
            {visibleProjects.map((project, index) => (
              <article key={project.id} className={`${styles.projectCard} ${index === 0 ? styles.projectCardFeatured : ''}`}>
                <div className={styles.cardTopline}><span className={`${styles.status} ${statusClass(project.status)}`}><i />{STATUS_LABELS[project.status] ?? project.status}</span><span className={styles.cardDate}>Added {dateLabel(project.createdAt)}</span></div>
                <Link href={`/project/${project.id}`} className={styles.projectTitle}>{project.title}<ChevronRight size={16} aria-hidden /></Link>
                <div className={styles.projectOrigin}><span>{project.accountName ?? 'Account not established'}</span><b>·</b><span>{project.contractTitle ?? 'No contract linked'}</span></div>
                <div className={styles.cardMetrics}>
                  <div><small>Contract value</small><strong>{money(project.value)}</strong></div>
                  <div><small>Delivery workspace</small><strong>Project 360</strong></div>
                </div>
                <div className={styles.cardFooter}><Link href={`/project/${project.id}`} className={styles.workspaceLink}>Open workspace <ChevronRight size={14} aria-hidden /></Link><Link href={`/project/${project.id}/controls`} className={styles.controlsLink}>Controls</Link><ProjectEdit project={project} /></div>
              </article>
            ))}
          </div>
        )}
      </section>

      <aside className={styles.guidance}>
        <div className={styles.guidanceIcon}><Sparkles size={17} aria-hidden /></div>
        <div><strong>Keep the project moving</strong><p>Plan in Projects, execute in Delivery Operations, and use Project 360 to connect the decisions without duplicating domain records.</p></div>
        <Link href="/operations/overview">Open Delivery Operations <ChevronRight size={14} aria-hidden /></Link>
      </aside>
    </div>
  );
}

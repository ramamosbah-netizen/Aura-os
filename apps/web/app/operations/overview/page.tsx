import Link from 'next/link';
import {
  AlertTriangle,
  ArrowRight,
  Boxes,
  ClipboardList,
  FolderKanban,
  PackageCheck,
  ShoppingCart,
  TrendingUp,
} from 'lucide-react';
import { fetchJson } from '@/lib/api';
import DataStateNotice, { DataDegradedNotice } from '@/components/ui/data-state';
import styles from './operations-overview.module.css';

export const dynamic = 'force-dynamic';

interface Po { status?: string; value?: number; projectId?: string | null }
interface Pr { status: string; value?: number; projectId?: string | null; title?: string; reference?: string | null }
interface Stock { code?: string; name?: string; quantityOnHand?: number; avgCost?: number; reorderLevel?: number; reorderQty?: number }
interface Evm {
  plannedValue: number;
  earnedValue: number;
  actualCost: number;
  costVariance: number;
  scheduleVariance: number;
  cpi: number;
  spi: number;
}
interface PortfolioProject {
  id: string;
  title: string;
  reference?: string | null;
  accountName?: string | null;
  status: 'planned' | 'active' | 'completed' | 'cancelled';
  value: number;
  evm: Evm;
  atRisk: boolean;
}

const CLOSED_PO = new Set(['received', 'closed', 'cancelled', 'completed']);
const aed = (value: number): string => `AED ${Math.round(value).toLocaleString()}`;
const indexTone = (value: number): string => value >= 1 ? styles.good : value >= 0.9 ? styles.warn : styles.bad;

export default async function OperationsOverviewPage() {
  const [portfolioResult, poResult, prResult, stockResult] = await Promise.all([
    fetchJson<PortfolioProject[]>('/api/projects/projects/portfolio'),
    fetchJson<Po[]>('/api/procurement/purchase-orders'),
    fetchJson<Pr[]>('/api/procurement/purchase-requests'),
    fetchJson<Stock[]>('/api/inventory/stock'),
  ]);

  const results = [portfolioResult, poResult, prResult, stockResult];
  const failedReads = results.filter((result) => !result.ok).length;
  const firstError = results.find((result) => !result.ok);
  if (failedReads === results.length && firstError && !firstError.ok) {
    return <DataStateNotice error={firstError.error} subject="the operations command center" />;
  }

  const projects = portfolioResult.ok ? portfolioResult.data ?? [] : [];
  const poRows = poResult.ok ? poResult.data ?? [] : [];
  const prRows = prResult.ok ? prResult.data ?? [] : [];
  const stockRows = stockResult.ok ? stockResult.data ?? [] : [];

  const activeProjects = projects
    .filter((project) => project.status === 'active')
    .sort((a, b) => Number(b.atRisk) - Number(a.atRisk) || a.title.localeCompare(b.title));
  const atRisk = activeProjects.filter((project) => project.atRisk);
  const openPos = poRows.filter((po) => !CLOSED_PO.has((po.status ?? '').toLowerCase()));
  const openPoValue = openPos.reduce((sum, po) => sum + (Number(po.value) || 0), 0);
  const submittedPrs = prRows.filter((pr) => pr.status.toLowerCase() === 'submitted');
  const draftPrs = prRows.filter((pr) => pr.status.toLowerCase() === 'draft');
  const submittedPrValue = submittedPrs.reduce((sum, pr) => sum + (Number(pr.value) || 0), 0);
  const stockValue = stockRows.reduce(
    (sum, item) => sum + (Number(item.quantityOnHand) || 0) * (Number(item.avgCost) || 0),
    0,
  );
  const lowStock = stockRows
    .filter((item) => (Number(item.reorderLevel) || 0) > 0 && (Number(item.quantityOnHand) || 0) <= (Number(item.reorderLevel) || 0))
    .sort((a, b) => (Number(a.quantityOnHand) || 0) - (Number(b.quantityOnHand) || 0));

  return (
    <main className={styles.page} data-testid="operations-command-center">
      <header className={styles.hero}>
        <div>
          <div className={styles.eyebrow}><span aria-hidden /> Operations command center</div>
          <h1>Project delivery operations</h1>
          <p>Active projects first, with the supply and approval signals that can interrupt field execution.</p>
        </div>
        <div className={styles.heroActions}>
          <Link href="/projects/dashboard" className={styles.secondaryAction}>Portfolio</Link>
          <Link href="/procurement/purchase-requests" className={styles.primaryAction}>
            <ClipboardList size={15} aria-hidden /> Purchase requests
          </Link>
        </div>
      </header>

      {failedReads > 0 ? (
        <DataDegradedNotice message={`${failedReads} live data source${failedReads === 1 ? ' is' : 's are'} temporarily unavailable. Available sections remain live.`} />
      ) : null}

      <section className={styles.projectSection} aria-labelledby="active-projects-heading">
        <div className={styles.sectionHeading}>
          <div>
            <span className={styles.sectionKicker}>Project delivery spine</span>
            <h2 id="active-projects-heading">Active projects</h2>
          </div>
          <div className={styles.sectionSummary}>
            <span><b>{activeProjects.length}</b> active</span>
            <span className={atRisk.length ? styles.bad : styles.good}><b>{atRisk.length}</b> at risk</span>
          </div>
        </div>

        {activeProjects.length === 0 ? (
          <div className={styles.emptyProjects}>
            <FolderKanban size={20} aria-hidden />
            <div><strong>No active projects</strong><span>Start project execution to bring it into this command center.</span></div>
          </div>
        ) : (
          <div className={styles.projectGrid}>
            {activeProjects.slice(0, 8).map((project) => {
              const projectOpenPos = openPos.filter((po) => po.projectId === project.id);
              const projectSubmittedPrs = submittedPrs.filter((pr) => pr.projectId === project.id);
              const completion = project.evm.plannedValue > 0
                ? Math.max(0, Math.min(100, (project.evm.earnedValue / project.evm.plannedValue) * 100))
                : null;
              return (
                <Link key={project.id} href={`/project/${project.id}`} className={project.atRisk ? `${styles.projectCard} ${styles.projectCardRisk}` : styles.projectCard}>
                  <div className={styles.projectTopline}>
                    <span className={project.atRisk ? styles.riskFlag : styles.liveFlag}>
                      {project.atRisk ? 'Needs attention' : 'On watch'}
                    </span>
                    {project.reference ? <code>{project.reference}</code> : null}
                  </div>
                  <div className={styles.projectTitleRow}>
                    <div>
                      <h3>{project.title}</h3>
                      <p>{project.accountName ?? 'Project delivery'}</p>
                    </div>
                    <ArrowRight size={17} aria-hidden />
                  </div>
                  <div className={styles.progressHeader}>
                    <span>Earned-value completion</span>
                    <strong>{completion === null ? 'No baseline' : `${Math.round(completion)}%`}</strong>
                  </div>
                  <div className={styles.progressTrack} aria-hidden>
                    <span style={{ width: `${completion ?? 0}%` }} />
                  </div>
                  <div className={styles.projectSignals}>
                    <span>SPI <b className={indexTone(project.evm.spi)}>{project.evm.spi.toFixed(2)}</b></span>
                    <span>CPI <b className={indexTone(project.evm.cpi)}>{project.evm.cpi.toFixed(2)}</b></span>
                    <span>Open PO <b>{projectOpenPos.length}</b></span>
                    <span>PR approval <b className={projectSubmittedPrs.length ? styles.warn : undefined}>{projectSubmittedPrs.length}</b></span>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </section>

      <section className={styles.supplySection} aria-labelledby="supply-heading">
        <div className={styles.sectionHeading}>
          <div>
            <span className={styles.sectionKicker}>Operational control</span>
            <h2 id="supply-heading">Supply and approval pulse</h2>
          </div>
        </div>

        <div className={styles.kpiGrid}>
          <Kpi icon={ShoppingCart} label="Open purchase orders" value={String(openPos.length)} detail={aed(openPoValue)} />
          <Kpi icon={ClipboardList} label="Awaiting PR approval" value={String(submittedPrs.length)} detail={aed(submittedPrValue)} alert={submittedPrs.length > 0} />
          <Kpi icon={PackageCheck} label="Draft purchase requests" value={String(draftPrs.length)} detail="not yet submitted" />
          <Kpi icon={Boxes} label="Inventory value" value={aed(stockValue)} detail={`${stockRows.length} stocked items`} />
          <Kpi icon={AlertTriangle} label="Below reorder" value={String(lowStock.length)} detail="need replenishment" alert={lowStock.length > 0} />
        </div>

        <div className={styles.queueGrid}>
          <section className={styles.queuePanel}>
            <div className={styles.queueHeading}>
              <div><span className={styles.sectionKicker}>Material risk</span><h3>Below reorder level</h3></div>
              <Link href="/inventory/stock">Inventory <ArrowRight size={14} aria-hidden /></Link>
            </div>
            {lowStock.length === 0 ? (
              <p className={styles.clearMessage}>Every stocked item is above its reorder level.</p>
            ) : (
              <div className={styles.queueRows}>
                {lowStock.slice(0, 7).map((item, index) => (
                  <Link key={item.code ?? index} href="/inventory/stock" className={styles.queueRow}>
                    <span className={styles.queueCode}>{item.code ?? 'ITEM'}</span>
                    <strong>{item.name ?? item.code ?? 'Stock item'}</strong>
                    <span className={styles.bad}>{item.quantityOnHand ?? 0} on hand</span>
                    <small>reorder at {item.reorderLevel ?? 0}</small>
                  </Link>
                ))}
              </div>
            )}
          </section>

          <section className={styles.queuePanel}>
            <div className={styles.queueHeading}>
              <div><span className={styles.sectionKicker}>Approval flow</span><h3>Purchase requests</h3></div>
              <Link href="/procurement/purchase-requests">Open register <ArrowRight size={14} aria-hidden /></Link>
            </div>
            <div className={styles.approvalSummary}>
              <div><span>Submitted for approval</span><strong className={submittedPrs.length ? styles.warn : styles.good}>{submittedPrs.length}</strong><small>{aed(submittedPrValue)}</small></div>
              <div><span>Draft, not submitted</span><strong>{draftPrs.length}</strong><small>requires owner action</small></div>
              <div><span>Open PO commitment</span><strong>{openPos.length}</strong><small>{aed(openPoValue)}</small></div>
            </div>
            <div className={styles.domainLinks}>
              <Link href="/procurement/dashboard">Procurement</Link>
              <Link href="/site/control">Site</Link>
              <Link href="/quality/control">Quality</Link>
              <Link href="/hse/control">HSE</Link>
              <Link href="/commissioning">Commissioning</Link>
            </div>
          </section>
        </div>
      </section>
    </main>
  );
}

function Kpi({
  icon: Icon,
  label,
  value,
  detail,
  alert,
}: {
  icon: typeof TrendingUp;
  label: string;
  value: string;
  detail: string;
  alert?: boolean;
}) {
  return (
    <div className={styles.kpiCard}>
      <div className={styles.kpiLabel}><Icon size={15} aria-hidden /><span>{label}</span></div>
      <strong className={alert ? styles.bad : undefined}>{value}</strong>
      <small>{detail}</small>
    </div>
  );
}

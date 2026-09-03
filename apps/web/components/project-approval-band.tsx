'use client';

import type { CSSProperties } from 'react';
import { ArrowRight, CheckCircle2, ClipboardCheck, FolderKanban, ListChecks } from 'lucide-react';
import AuraTabLink from './aura-tab-link';
import shellStyles from './suite-dashboard-shell.module.css';
import styles from './project-approval-band.module.css';
import type { DeliveryProject } from './project-delivery-dashboard';
import type { DeliveryVariation } from './project-change-control-band';

export default function ProjectApprovalBand({ projects, variations, totalApprovals }: { projects: DeliveryProject[] | null; variations: DeliveryVariation[] | null; totalApprovals: number | null }) {
  const pending = (variations ?? []).filter((variation) => variation.status === 'submitted');
  const byProject = new Map<string, { title: string; count: number; effect: number }>();
  for (const variation of pending) {
    const project = projects?.find((row) => row.id === variation.projectId);
    const current = byProject.get(variation.projectId) ?? { title: variation.projectTitle ?? project?.title ?? `Project ${variation.projectId.slice(0, 8)}`, count: 0, effect: 0 };
    current.count += 1;
    current.effect += variation.signedAmount ?? (variation.type === 'omission' ? -variation.amount : variation.amount);
    byProject.set(variation.projectId, current);
  }
  if (projects && variations) {
    for (const project of projects) {
      if (!byProject.has(project.id)) byProject.set(project.id, { title: project.title, count: 0, effect: 0 });
    }
  }
  const projectRows = [...byProject.entries()].sort((a, b) => (b[1].count - a[1].count) || a[1].title.localeCompare(b[1].title)).slice(0, 5);
  const projectCount = byProject.size;

  return (
    <section className={shellStyles.band} aria-label="Project approvals and actions" id="project-approvals" data-testid="project-approval-band">
      <div className={shellStyles.bandHead}>
        <div>
          <p className={shellStyles.sectionKicker}><ClipboardCheck size={12} style={{ verticalAlign: 'middle', marginRight: 5 }} /> Approvals &amp; actions</p>
          <h2>Project decisions, grouped by project</h2>
        </div>
        <AuraTabLink href="/projects/approvals" tabTitle="Project approvals" tabType="Projects">Open project approvals <ArrowRight aria-hidden /></AuraTabLink>
      </div>
      <div className={shellStyles.bandStages} style={{ '--stage-count': 3 } as CSSProperties}>
        <AuraTabLink href="/projects/approvals" tabTitle="Project approvals" tabType="Projects" className={shellStyles.bandStage}><small>All project actions</small><b>{totalApprovals === null ? '—' : totalApprovals}</b><span>{totalApprovals === null ? 'data unavailable' : totalApprovals === 1 ? 'decision waiting' : 'decisions waiting'}</span><i /></AuraTabLink>
        <AuraTabLink href="/projects/variations?status=submitted" tabTitle="Pending variations" tabType="Projects" className={shellStyles.bandStage}><small>C6 variation approvals</small><b>{variations === null ? '—' : pending.length}</b><span>{variations === null ? 'data unavailable' : pending.length === 1 ? 'submitted variation' : 'submitted variations'}</span><i /></AuraTabLink>
        <AuraTabLink href="/projects/variations?status=submitted" tabTitle="Projects requiring action" tabType="Projects" className={shellStyles.bandStage}><small>Projects requiring action</small><b>{variations === null ? '—' : projectCount}</b><span>{variations === null ? 'data unavailable' : projectCount === 1 ? 'open project context' : 'open project contexts'}</span><i /></AuraTabLink>
      </div>
      {projectRows.length ? <div className={styles.approvalList}>{projectRows.map(([projectId, row]) => <AuraTabLink key={projectId} href={`/project/${projectId}`} tabTitle={row.title} tabType="Project" className={styles.approvalRow}><span className={styles.approvalIcon}><FolderKanban size={15} /></span><span className={styles.approvalCopy}><strong>{row.title}</strong><small>{row.count ? `${row.count} pending variation${row.count === 1 ? '' : 's'} · ${row.effect < 0 ? '−' : '+'}AED ${Math.abs(Math.round(row.effect)).toLocaleString('en-AE')} proposed effect` : 'No pending variation approvals · open project context'}</small></span><span className={styles.approvalCta}>Open Project 360 <ArrowRight size={13} /></span></AuraTabLink>)}</div> : <div className={styles.approvalEmpty}><CheckCircle2 size={17} /><span>{variations === null ? 'Project approval data is unavailable.' : 'No projects are available for approval context.'}</span><AuraTabLink href="/projects/variations#raise-variation" tabTitle="Raise variation" tabType="Projects"><ListChecks size={13} /> Create a variation</AuraTabLink></div>}
    </section>
  );
}

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const CLIENT = resolve(__dirname, 'components/project-360-client.tsx');
const REGISTER = resolve(__dirname, 'app/projects/projects/page.tsx');
const OVERVIEW = resolve(__dirname, 'app/project/[projectId]/page.tsx');
const SCHEDULE = resolve(__dirname, 'app/projects/schedule/page.tsx');
const SHELL = resolve(__dirname, 'components/project-shell.tsx');
const WORKSPACE = resolve(__dirname, 'app/project/[projectId]/workspace/[section]/page.tsx');

describe('Project 360 canonical delivery contract', () => {
  it('exposes delivery evidence in the canonical controls workspace', () => {
    const source = readFileSync(CLIENT, 'utf8');
    for (const label of ['Commercial handover', 'Frozen item mapping', 'WBS / CBS structure', 'Quantity ledger', 'Cost Ledger and EVM']) {
      expect(source).toContain(label);
    }
    expect(source).toContain('PV / SV / SPI');
    expect(source).toContain('Unavailable — no time-phased baseline');
    expect(source).toContain('Certified %');
  });

  it('exposes only governed authoring and protects ledger-owned fields', () => {
    const source = readFileSync(CLIENT, 'utf8');
    for (const marker of ['wbs-authoring-form', 'cbs-authoring-form', 'delay-authoring-form', 'eot-authoring-form', 'Create WBS', 'Create CBS', 'Log delay', 'Create EOT draft']) {
      expect(source).toContain(marker);
    }
    expect(source).toContain("'/api/projects/wbs'");
    expect(source).toContain("'/api/projects/cbs'");
    expect(source).toContain("'/api/projects/delays'");
    expect(source).toContain("'/api/projects/eot-claims'");
    expect(source).toContain('Actual and committed values are Cost Ledger/commitment projections');
    expect(source).not.toContain('aria-label="CBS actual"');
    expect(source).not.toContain('aria-label="WBS progress"');
  });

  it('routes query-selected legacy Project details to Project 360', () => {
    const source = readFileSync(REGISTER, 'utf8');
    expect(source).toContain('redirect(`/project/${encodeURIComponent(projectId)}/controls`)');
    expect(source).not.toContain("import ProjectDetail");
  });

  it('keeps Project 360 actions contextual while preserving domain ownership', () => {
    const overview = readFileSync(OVERVIEW, 'utf8');
    for (const marker of [
      '/projects/schedule?projectId=',
      '/site/instructions?projectId=',
      '/site/daily-reports?projectId=',
      '/engineering/drawings?projectId=',
      '/quality/ncrs?projectId=',
      '/subcontracts/subcontracts?projectId=',
      '/procurement/purchase-requests?projectId=',
      'Procurement & subcontracts',
      'Commercial & evidence',
      'Project Action',
    ]) {
      expect(overview).toContain(marker);
    }
    const subcontracts = readFileSync(resolve(__dirname, 'app/subcontracts/subcontracts/page.tsx'), 'utf8');
    expect(subcontracts).toContain('projectId ? `/api/subcontracts?projectId=');
    expect(subcontracts).toContain('initialProjectId={projectId || undefined}');
    const schedule = readFileSync(SCHEDULE, 'utf8');
    expect(schedule).toContain('selectedProjectId={projectId}');
    expect(schedule).toContain('scopedSchedules');
    const shell = readFileSync(SHELL, 'utf8');
    for (const label of ['Overview', 'Project', 'Plan & Control', 'Engineering', 'Procurement', 'Subcontracts', 'Site', 'Quality', 'HSE', 'Commercial', 'Documents', 'Approvals & Actions', 'Testing & Commissioning', 'Handover & Closeout', 'Activity & History']) {
      expect(shell).toContain(label);
    }
  });

  it('keeps Supply Chain canonical while composing project context', () => {
    const prs = readFileSync(resolve(__dirname, 'app/procurement/purchase-requests/page.tsx'), 'utf8');
    const pos = readFileSync(resolve(__dirname, 'app/procurement/purchase-orders/page.tsx'), 'utf8');
    expect(prs).toContain('projectId?: string');
    expect(prs).toContain('Showing purchase requests linked to this project.');
    expect(prs).toContain('initialProjectId={project ? scopedProjectId : \'\'}');
    expect(pos).toContain('Showing purchase orders linked to this project.');
    expect(pos).toContain('initialProjectId={project ? scopedProjectId : \'\'}');
    expect(readFileSync(resolve(__dirname, 'components/pr-list.tsx'), 'utf8')).toContain('initialValues={initialProjectId ? { projectId: initialProjectId } : undefined}');
    expect(readFileSync(resolve(__dirname, 'components/po-create.tsx'), 'utf8')).toContain('initialValues={initialProjectId ? { projectId: initialProjectId } : undefined}');
  });

  it('presents Project 360 as a guided management cockpit', () => {
    const overview = readFileSync(OVERVIEW, 'utf8');
    for (const marker of ['Project 360 / Overview', 'Project health', 'Needs attention', 'Project timeline', 'Delivery status', 'Commercial &amp; control', 'Recent activity', 'Project Action', 'canonical owner']) {
      expect(overview).toContain(marker);
    }
  });

  it('uses a direct Project 360 rail for project-level shortcuts', () => {
    const shell = readFileSync(SHELL, 'utf8');
    const css = readFileSync(resolve(__dirname, 'components/project-shell.module.css'), 'utf8');
    expect(shell).toContain('<section className={styles.projectRail}');
    expect(shell).toContain('Project 360 navigation');
    expect(shell).toContain('navGroups.map');
    expect(css).toContain('.projectRail');
    expect(css).toContain('.navItemActive');
  });

  it('keeps every approved Project 360 parent available as a contextual shortcut', () => {
    const shell = readFileSync(SHELL, 'utf8');
    const workspace = readFileSync(WORKSPACE, 'utf8');
    for (const label of ['Overview', 'Project', 'Plan & Control', 'Engineering', 'Procurement', 'Subcontracts', 'Site', 'Quality', 'HSE', 'Commercial', 'Documents', 'Approvals & Actions', 'Testing & Commissioning', 'Handover & Closeout', 'Activity & History']) {
      expect(shell).toContain(`label: '${label}'`);
    }
    for (const section of ['project', 'plan', 'engineering', 'procurement', 'subcontracts', 'site', 'quality', 'hse', 'commercial', 'documents', 'approvals', 'testing', 'handover', 'activity']) {
      expect(workspace).toContain(`${section}:`);
    }
    expect(workspace).toContain('Project context preserved');
    expect(workspace).toContain('function contextHref');
  });
});

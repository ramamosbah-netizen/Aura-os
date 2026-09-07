import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const CLIENT = resolve(__dirname, 'components/project-360-client.tsx');
const REGISTER = resolve(__dirname, 'app/projects/projects/page.tsx');
const OVERVIEW = resolve(__dirname, 'app/project/[projectId]/page.tsx');
const SCHEDULE = resolve(__dirname, 'app/projects/schedule/page.tsx');
const GANTT = resolve(__dirname, 'components/gantt-client.tsx');
const LEGACY_CONTROLS = resolve(__dirname, 'app/controls/page.tsx');
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
    // Certification used to be a single "Certified %" column, which read the same whether a
    // quantity had been certified by the engineer or merely billed. The ledger now states the
    // provenance instead, and the certified position keeps its own headline figure.
    expect(source).toContain('CERTIFIED or BILLED (see provenance)');
    expect(source).toContain('% of contract');
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
    // These assertions used to read the /project/[projectId] route file, which held a second
    // hand-written dashboard. That route now renders the same record as /controls, deliberately —
    // a project had TWO overviews answering the same questions from different code. The actions
    // moved with it, so this reads the record. What is being protected is unchanged: every action
    // opens the module that OWNS the record, carrying this project as context.
    const overview = readFileSync(CLIENT, 'utf8');
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
      'Governed actions',
    ]) {
      expect(overview).toContain(marker);
    }
    // The ownership statement itself, not just the links — this is the sentence that stops
    // Project 360 drifting into being a second authority for other modules' records.
    expect(overview).toContain('it does not take ownership of it');
    const subcontracts = readFileSync(resolve(__dirname, 'app/subcontracts/subcontracts/page.tsx'), 'utf8');
    expect(subcontracts).toContain('projectId ? `/api/subcontracts?projectId=');
    expect(subcontracts).toContain('initialProjectId={projectId || undefined}');
    const schedule = readFileSync(SCHEDULE, 'utf8');
    expect(schedule).toContain('selectedProjectId={projectId}');
    expect(schedule).toContain('scopedSchedules');
    for (const marker of ['Plan &amp; schedule health', 'Gantt chart', 'Read from authoritative planning evidence']) {
      expect(schedule).toContain(marker);
    }
    expect(readFileSync(GANTT, 'utf8')).toContain('Gantt timeline');
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

  it('keeps legacy WBS control links on the canonical Project 360 control workspace', () => {
    const legacy = readFileSync(LEGACY_CONTROLS, 'utf8');
    expect(legacy).toContain("tab === 'wbs' ? 'delivery' : tab");
    expect(legacy).toContain('/project/${encodeURIComponent(projectId)}/controls');
    const client = readFileSync(resolve(__dirname, 'components/project-360-client.tsx'), 'utf8');
    // The overview tab reports the delivery chain as EVIDENCE ("Not established" is a real
    // answer, distinct from "empty") rather than as a list of control areas to visit. The two
    // shortcuts the legacy links depended on — scope structure and the schedule — are still
    // reachable from it, which is what these links actually need.
    for (const marker of ['project-controls-overview', 'Delivery chain', 'Not established', 'Governed actions']) {
      expect(client).toContain(marker);
    }
    expect(client).toContain("['Allocate scope value', `${base}/controls?tab=delivery`]");
    expect(client).toContain("['Add task or milestone', `/projects/schedule?projectId=${id}`]");
  });

  it('presents Project 360 as a guided management cockpit', () => {
    // The cockpit is the shared record system, not a bespoke dashboard: the same header, band,
    // KPIs and insight rail every other 360 uses. That is the point of the rebuild — one set of
    // components answering "what is this, how is it doing, what do I do next" the same way
    // everywhere, so the answers cannot drift per screen.
    const client = readFileSync(CLIENT, 'utf8');
    for (const marker of ['RecordShell', 'RecordHeader', 'RecordSituation', 'RecordNextAction', 'RecordHealth', 'RecordMissing', 'InsightsPanel']) {
      expect(client).toContain(marker);
    }

    // The route keeps the anchor the shell and the browser suite key off — reaching a delivery
    // area through the shell rather than by typing a URL.
    const overview = readFileSync(OVERVIEW, 'utf8');
    expect(overview).toContain('data-testid="project-command-center"');
    expect(overview).toContain('<Project360Client');
    // And it must NOT grow a second dashboard again: no health thresholds computed in the route.
    expect(overview).not.toMatch(/atRisk|spi <|cpi </i);
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

  it('treats Project Setup as a focused configuration workspace', () => {
    const workspace = readFileSync(WORKSPACE, 'utf8');
    for (const marker of ['Project Setup', 'SETUP PROGRESS', 'PROJECT DETAILS', 'SCOPE &amp; CONTRACT', 'TEAM &amp; OWNERSHIP', 'SYSTEMS / DISCIPLINES', 'RECENT SETUP ACTIVITY']) {
      expect(workspace).toContain(marker);
    }
    expect(workspace).toContain('No manual READY flags are stored here.');
    expect(workspace).toContain('fetchJson<Row[]>(`/api/projects/${encodeURIComponent(projectId)}/members`');
  });
});

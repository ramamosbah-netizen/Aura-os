import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const CLIENT = resolve(__dirname, 'components/project-360-client.tsx');
const REGISTER = resolve(__dirname, 'app/projects/projects/page.tsx');
const OVERVIEW = resolve(__dirname, 'app/project/[projectId]/page.tsx');
const SCHEDULE = resolve(__dirname, 'app/projects/schedule/page.tsx');

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
      'Upload evidence',
    ]) {
      expect(overview).toContain(marker);
    }
    const schedule = readFileSync(SCHEDULE, 'utf8');
    expect(schedule).toContain('selectedProjectId={projectId}');
    expect(schedule).toContain('scopedSchedules');
  });
});

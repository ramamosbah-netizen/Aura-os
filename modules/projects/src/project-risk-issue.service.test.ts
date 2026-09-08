import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { AccessService, type EventStore, NullTxRunner, TenantContext, type TxRunner } from '@aura/core';
import { ProjectRiskService } from './project-risk.service';
import { ProjectIssueService } from './project-issue.service';
import { ProjectRiskMaterialisationService } from './project-risk-materialisation.service';
import { InMemoryProjectRiskStore } from './in-memory-project-risk-store';
import { InMemoryProjectIssueStore } from './in-memory-project-issue-store';
import type { ProjectStore } from './project-store';
import { makeProject } from './domain/project';

/**
 * §21 at the service boundary: three authorities, governance, tenancy, provenance.
 *
 * Two of these tests assert SHAPE rather than behaviour, and they are the most important ones here.
 * `REFERENCE ≠ OWNERSHIP` and the risk/issue authority split are not rules a service checks at
 * runtime — they are rules the dependency graph makes unbreakable. A test that only exercised
 * behaviour would keep passing on the day someone imports QualityService into the issue service.
 */

const TODAY = '2026-09-08';

function fixture(tenantId = 'tenant-a') {
  const project = makeProject({ tenantId, title: 'Risk register project' });
  const events = { append: vi.fn(async () => undefined), appendWithClient: vi.fn(async () => undefined) } as unknown as EventStore;
  const access = { assert: vi.fn() } as unknown as AccessService;
  const projects = { get: vi.fn(async (id: string) => (id === project.id ? project : null)) } as unknown as ProjectStore;
  const tenant = { boundTenantId: () => tenantId } as unknown as TenantContext;
  const risks = new InMemoryProjectRiskStore();
  const issues = new InMemoryProjectIssueStore();
  const tx: TxRunner = new NullTxRunner();

  return {
    project, events, access, projects, tenant, risks, issues, tx, tenantId,
    riskSvc: new ProjectRiskService(risks, events, tenant, projects, access),
    issueSvc: new ProjectIssueService(issues, events, tenant, projects, access),
    materialise: new ProjectRiskMaterialisationService(risks, issues, events, tx, tenant, projects, access),
  };
}

type Fx = ReturnType<typeof fixture>;

const raiseRisk = (f: Fx, over: Record<string, unknown> = {}) =>
  f.riskSvc.raise({
    tenantId: f.tenantId, projectId: f.project.id, title: 'Authority approval may be delayed',
    actorId: 'u-pm', ...over,
  });

const raiseIssue = (f: Fx, over: Record<string, unknown> = {}) =>
  f.issueSvc.raise({
    tenantId: f.tenantId, projectId: f.project.id, title: 'Workfront not released',
    actorId: 'u-pm', ...over,
  });

const permissionsAsserted = (f: Fx): string[] =>
  (f.access.assert as ReturnType<typeof vi.fn>).mock.calls.map((c) => (c[1] as { permission: string }).permission);

describe('governance', () => {
  it('demands project ownership and a governed permission on each register', async () => {
    const f = fixture();
    await raiseRisk(f);
    expect(permissionsAsserted(f)).toContain('projects.risk.create');

    await raiseIssue(f);
    expect(permissionsAsserted(f)).toContain('projects.issue.create');

    // A risk raised against another tenant's project is not a permission problem — the project is
    // simply not there to raise it against, and saying otherwise would confirm it exists.
    await expect(raiseRisk(f, { tenantId: 'tenant-b' })).rejects.toThrow('not found');
  });

  it('checks permission again on every lifecycle move, not only at creation', async () => {
    const f = fixture();
    const issue = await raiseIssue(f);
    (f.access.assert as ReturnType<typeof vi.fn>).mockClear();
    await f.issueSvc.setStatus(issue.id, 'in_progress', { actorId: 'u-pm' });
    expect(permissionsAsserted(f)).toEqual(['projects.issue.update']);
  });

  it('refuses to hand back another tenant\'s record', async () => {
    const f = fixture();
    const risk = await raiseRisk(f);
    const issue = await raiseIssue(f);

    const otherTenant = { boundTenantId: () => 'tenant-b' } as unknown as TenantContext;
    const outsiderRisk = new ProjectRiskService(f.risks, f.events, otherTenant, f.projects, f.access);
    const outsiderIssue = new ProjectIssueService(f.issues, f.events, otherTenant, f.projects, f.access);

    expect(await outsiderRisk.get(risk.id)).toBeNull();
    expect(await outsiderIssue.get(issue.id)).toBeNull();
    // And cannot move what it cannot read.
    await expect(outsiderIssue.setStatus(issue.id, 'in_progress', { actorId: 'u-pm' })).rejects.toThrow('not found');
  });
});

describe('the registers, end to end', () => {
  it('records a raised risk as an event with its severity and area', async () => {
    const f = fixture();
    await raiseRisk(f, { area: 'AUTHORITY', likelihood: 'high', impact: 'high' });
    expect(f.events.append).toHaveBeenCalledWith([
      expect.objectContaining({
        type: 'projects.risk.raised',
        payload: expect.objectContaining({ area: 'AUTHORITY', severity: 'CRITICAL' }),
      }),
    ]);
  });

  it('carries the previous status on a lifecycle move', async () => {
    const f = fixture();
    const risk = await raiseRisk(f);
    await f.riskSvc.setStatus(risk.id, 'MITIGATING', { actorId: 'u-pm' });
    // A register that records only where something ended cannot answer how it got there.
    expect(f.events.append).toHaveBeenLastCalledWith([
      expect.objectContaining({ payload: expect.objectContaining({ fromStatus: 'OPEN', toStatus: 'MITIGATING' }) }),
    ]);
  });

  it('rolls each register up against a date the caller supplies', async () => {
    const f = fixture();
    await raiseRisk(f, { likelihood: 'high', impact: 'high' });
    await raiseIssue(f, { severity: 'critical' });
    await raiseIssue(f, { severity: 'minor', dueDate: '2026-08-01' });

    // The two summaries are read separately and composed by the caller with ONE date, so "overdue"
    // cannot mean two different days on the two halves of one screen.
    expect(await f.riskSvc.summaryFor(f.project.id, TODAY)).toMatchObject({ open: 1, openCritical: 1 });
    expect(await f.issueSvc.summaryFor(f.project.id, TODAY)).toMatchObject({ open: 2, openCritical: 1, overdue: 1 });
  });

  it('refuses to fabricate provenance on the ordinary raise path', async () => {
    const f = fixture();
    const risk = await raiseRisk(f);
    // Accepting originRiskId here would be a second writer for provenance, and could claim a risk
    // had landed while it is still sitting OPEN on the register.
    await expect(raiseIssue(f, { originRiskId: risk.id }))
      .rejects.toThrow(/can only be linked to a risk by materialising that risk/);
    expect((await f.riskSvc.get(risk.id))?.status).toBe('OPEN');
  });
});

describe('materialisation — the one command that spans both registers', () => {
  it('requires BOTH permissions, because it does two governed things', async () => {
    const f = fixture();
    const risk = await raiseRisk(f);
    (f.access.assert as ReturnType<typeof vi.fn>).mockClear();
    await f.materialise.materialise(risk.id, { actorId: 'u-pm' });
    // Someone allowed to raise issues but not to move risks must not close a risk through this
    // door, and vice versa.
    expect(permissionsAsserted(f)).toEqual(['projects.risk.update', 'projects.issue.create']);
  });

  it('persists the new issue and the retired risk together', async () => {
    const f = fixture();
    const risk = await raiseRisk(f, { likelihood: 'high', impact: 'high', mitigation: 'Chase weekly' });
    const { issue } = await f.materialise.materialise(risk.id, { severity: 'critical', actorId: 'u-pm' });

    const storedRisk = await f.riskSvc.get(risk.id);
    const storedIssue = await f.issueSvc.get(issue.id);
    // ONE pointer, and it lives on the issue.
    expect(storedIssue?.originRiskId).toBe(risk.id);
    expect(storedRisk).not.toHaveProperty('linkedIssueId');
    // The forecast survives: what was predicted, and what was being done about it.
    expect(storedRisk).toMatchObject({ status: 'MATERIALISED', severity: 'CRITICAL', mitigation: 'Chase weekly' });
    // And the risk's own row is not how "what did it become?" is answered.
    expect((await f.issueSvc.findByOriginRisk(risk.id))?.id).toBe(issue.id);
  });

  it('writes both registers and both events inside one transaction', async () => {
    const f = fixture();
    const risk = await raiseRisk(f);
    const run = vi.spyOn(f.tx, 'run');
    await f.materialise.materialise(risk.id, { actorId: 'u-pm' });

    expect(run).toHaveBeenCalledTimes(1);
    // Transaction-aware writes, not the plain ones — otherwise a rollback would leave the issue
    // committed and the risk still open.
    const types = (f.events.appendWithClient as ReturnType<typeof vi.fn>).mock.calls
      .flatMap((c) => (c[1] as Array<{ type: string }>).map((e) => e.type));
    expect(types).toEqual(['projects.risk.materialised', 'projects.issue.raised']);
    expect(f.events.append).not.toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ type: 'projects.risk.materialised' })]),
    );
  });

  it('leaves the risk out of the live count once it has landed', async () => {
    const f = fixture();
    const risk = await raiseRisk(f, { likelihood: 'high', impact: 'high' });
    await f.materialise.materialise(risk.id, { actorId: 'u-pm' });

    // Counted once, as a live issue — not twice, as an exposure and a problem.
    expect(await f.riskSvc.summaryFor(f.project.id, TODAY)).toMatchObject({ open: 0, materialised: 1, resolved: 0 });
    expect(await f.issueSvc.summaryFor(f.project.id, TODAY)).toMatchObject({ open: 1, fromRisk: 1 });
  });

  it('materialises a risk exactly once', async () => {
    const f = fixture();
    const risk = await raiseRisk(f);
    await f.materialise.materialise(risk.id, { actorId: 'u-pm' });
    await expect(f.materialise.materialise(risk.id, { actorId: 'u-pm' })).rejects.toThrow(/already materialised/);
    expect((await f.issueSvc.list({ projectId: f.project.id })).length).toBe(1);
  });

  it('rejects materialisation aimed at a project the risk does not belong to, and changes nothing', async () => {
    const f = fixture();
    const risk = await raiseRisk(f);
    (f.events.appendWithClient as ReturnType<typeof vi.fn>).mockClear();

    await expect(
      f.materialise.materialise(risk.id, { expectedProjectId: 'some-other-project', actorId: 'u-pm' }),
    ).rejects.toThrow(/does not belong to project some-other-project/);

    // No issue created.
    expect(await f.issueSvc.list({ projectId: f.project.id })).toHaveLength(0);
    // Risk unchanged and still live.
    expect(await f.riskSvc.get(risk.id)).toMatchObject({ status: 'OPEN' });
    // No materialisation event — a rejected command must not leave a trace claiming it happened.
    expect(f.events.appendWithClient).not.toHaveBeenCalled();
  });
});

describe('the authority split, enforced by the dependency graph', () => {
  const source = (file: string) => readFileSync(join(__dirname, file), 'utf8');
  const importsOf = (file: string) => [...source(file).matchAll(/from '([^']+)'/g)].map((m) => m[1]);

  it('gives the risk service no way to write an issue, and the issue service no way to write a risk', () => {
    // One service owning both registers becomes a unified register with two tables behind it,
    // whatever the schema says. This is what stops that happening by accident.
    expect(importsOf('project-risk.service.ts')).not.toContain('./project-issue-store');
    expect(importsOf('project-risk.service.ts')).not.toContain('./domain/project-issue');
    expect(importsOf('project-issue.service.ts')).not.toContain('./project-risk-store');
  });

  it('holds no dependency capable of writing another domain\'s record', () => {
    // Closing an issue cannot close NCR-17 because there is no path from these services to
    // Quality — not because a check refuses it. A future import of a domain service would silently
    // create that path, so the imports are pinned.
    for (const file of ['project-issue.service.ts', 'project-risk.service.ts', 'project-risk-materialisation.service.ts']) {
      const foreign = importsOf(file).filter((i) => i.startsWith('@aura/') && !['@aura/shared', '@aura/core'].includes(i));
      expect(foreign, `${file} must never reach another domain`).toEqual([]);
    }
  });

  it('lets only the materialisation command hold both stores', () => {
    const both = importsOf('project-risk-materialisation.service.ts');
    expect(both).toContain('./project-risk-store');
    expect(both).toContain('./project-issue-store');
    // And it is the only one, so the transaction has exactly one owner.
    const holdsBoth = ['project-risk.service.ts', 'project-issue.service.ts']
      .filter((f) => importsOf(f).includes('./project-risk-store') && importsOf(f).includes('./project-issue-store'));
    expect(holdsBoth).toEqual([]);
  });

  it('resolving an issue writes to the issue store and to nothing else', async () => {
    const f = fixture();
    const issue = await raiseIssue(f, {
      references: [
        { module: 'quality', recordType: 'ncr', recordId: 'ncr-17', label: 'NCR-17' },
        { module: 'procurement', recordType: 'purchase-order', recordId: 'po-105', label: 'PO-105' },
      ],
    });
    const riskWrite = vi.spyOn(f.risks, 'update');

    const resolved = await f.issueSvc.setStatus(issue.id, 'resolved', {
      note: 'Client released the workfront on 6 Sep', actorId: 'u-pm',
    });

    expect(resolved.status).toBe('resolved');
    expect(resolved.references).toHaveLength(2);
    expect(riskWrite).not.toHaveBeenCalled();
    // The event says how many records this issue pointed at, so an auditor can see what was NOT
    // closed alongside it.
    expect(f.events.append).toHaveBeenLastCalledWith([
      expect.objectContaining({ payload: expect.objectContaining({ toStatus: 'resolved', referencedRecords: 2 }) }),
    ]);
  });
});

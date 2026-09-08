import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { AccessService, type EventStore, TenantContext } from '@aura/core';
import { RiskIssueService } from './risk-issue.service';
import { InMemoryProjectIssueStore, InMemoryProjectRiskStore } from './in-memory-risk-issue-store';
import type { ProjectStore } from './project-store';
import { makeProject } from './domain/project';

/**
 * §21 at the service boundary: governance, tenancy, provenance — and the authority line.
 *
 * The most important test in this file is the last one. `REFERENCE ≠ OWNERSHIP` is not a rule the
 * service checks at runtime; it is a rule the dependency graph makes unbreakable, and that is what
 * is asserted rather than a comment promising it.
 */

const TODAY = '2026-09-08';

function fixture(tenantId = 'tenant-a') {
  const project = makeProject({ tenantId, title: 'Risk register project' });
  const events = { append: vi.fn(async () => undefined) } as unknown as EventStore;
  const access = { assert: vi.fn() } as unknown as AccessService;
  const projects = {
    get: vi.fn(async (id: string) => (id === project.id ? project : null)),
  } as unknown as ProjectStore;
  const tenant = { boundTenantId: () => tenantId } as unknown as TenantContext;
  const risks = new InMemoryProjectRiskStore();
  const issues = new InMemoryProjectIssueStore();
  const service = new RiskIssueService(risks, issues, events, tenant, projects, access);
  return { service, project, events, access, projects, risks, issues, tenantId };
}

const raiseRisk = (f: ReturnType<typeof fixture>, over: Record<string, unknown> = {}) =>
  f.service.raiseRisk({
    tenantId: f.tenantId, projectId: f.project.id, title: 'Authority approval may be delayed',
    actorId: 'u-pm', ...over,
  });

const raiseIssue = (f: ReturnType<typeof fixture>, over: Record<string, unknown> = {}) =>
  f.service.raiseIssue({
    tenantId: f.tenantId, projectId: f.project.id, title: 'Workfront not released',
    actorId: 'u-pm', ...over,
  });

describe('governance', () => {
  it('demands project ownership and a governed permission on each register', async () => {
    const f = fixture();
    await raiseRisk(f);
    expect(f.access.assert).toHaveBeenCalledWith('u-pm', expect.objectContaining({ permission: 'projects.risk.create' }));

    await raiseIssue(f);
    expect(f.access.assert).toHaveBeenCalledWith('u-pm', expect.objectContaining({ permission: 'projects.issue.create' }));

    // A risk raised against another tenant's project is not a permission problem — the project is
    // simply not there to raise it against.
    await expect(raiseRisk(f, { tenantId: 'tenant-b' })).rejects.toThrow('not found');
  });

  it('checks permission again on every lifecycle move, not only at creation', async () => {
    const f = fixture();
    const issue = await raiseIssue(f);
    (f.access.assert as ReturnType<typeof vi.fn>).mockClear();
    await f.service.setIssueStatus(issue.id, 'in_progress', { actorId: 'u-pm' });
    expect(f.access.assert).toHaveBeenCalledWith('u-pm', expect.objectContaining({ permission: 'projects.issue.update' }));
  });

  it('refuses to hand back another tenant\'s record', async () => {
    const f = fixture();
    const risk = await raiseRisk(f);
    const issue = await raiseIssue(f);

    const outsider = new RiskIssueService(
      f.risks, f.issues, f.events,
      { boundTenantId: () => 'tenant-b' } as unknown as TenantContext,
      f.projects, f.access,
    );
    expect(await outsider.getRisk(risk.id)).toBeNull();
    expect(await outsider.getIssue(issue.id)).toBeNull();
    // And cannot move what it cannot read.
    await expect(outsider.setIssueStatus(issue.id, 'in_progress', { actorId: 'u-pm' })).rejects.toThrow('not found');
  });
});

describe('the register, end to end', () => {
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
    await f.service.setRiskStatus(risk.id, 'MITIGATING', { actorId: 'u-pm' });
    // A register that records only where something ended cannot answer how it got there.
    expect(f.events.append).toHaveBeenLastCalledWith([
      expect.objectContaining({ payload: expect.objectContaining({ fromStatus: 'OPEN', toStatus: 'MITIGATING' }) }),
    ]);
  });

  it('rolls both registers up against one date', async () => {
    const f = fixture();
    await raiseRisk(f, { likelihood: 'high', impact: 'high' });
    await raiseIssue(f, { severity: 'critical' });
    await raiseIssue(f, { severity: 'minor', dueDate: '2026-08-01' });

    const register = await f.service.registerFor(f.project.id, TODAY);
    expect(register.riskSummary).toMatchObject({ open: 1, openCritical: 1 });
    expect(register.issueSummary).toMatchObject({ open: 2, openCritical: 1, overdue: 1 });
    // One date decides "overdue" on both sides of one screen, because it is passed in rather than
    // read from the clock twice.
    expect(register.risks).toHaveLength(1);
    expect(register.issues).toHaveLength(2);
  });
});

describe('materialisation writes both registers', () => {
  it('persists the new issue and the linked risk together', async () => {
    const f = fixture();
    const risk = await raiseRisk(f, { likelihood: 'high', impact: 'high', mitigation: 'Chase weekly' });
    const { issue } = await f.service.materialiseRisk(risk.id, { severity: 'critical', actorId: 'u-pm' });

    const storedRisk = await f.service.getRisk(risk.id);
    const storedIssue = await f.service.getIssue(issue.id);
    expect(storedIssue?.originRiskId).toBe(risk.id);
    expect(storedRisk?.linkedIssueId).toBe(issue.id);
    // The forecast survives: what was predicted and what was being about it are both still readable.
    expect(storedRisk).toMatchObject({ status: 'RESOLVED', severity: 'CRITICAL', mitigation: 'Chase weekly' });
  });

  it('reports the landing as its own event, and the issue as raised', async () => {
    const f = fixture();
    const risk = await raiseRisk(f);
    (f.events.append as ReturnType<typeof vi.fn>).mockClear();
    await f.service.materialiseRisk(risk.id, { actorId: 'u-pm' });

    const types = (f.events.append as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0][0].type);
    expect(types).toEqual(['projects.risk.materialised', 'projects.issue.raised']);
  });

  it('leaves the risk out of the live count once it has landed', async () => {
    const f = fixture();
    const risk = await raiseRisk(f, { likelihood: 'high', impact: 'high' });
    await f.service.materialiseRisk(risk.id, { actorId: 'u-pm' });

    const register = await f.service.registerFor(f.project.id, TODAY);
    // Counted once, as a live issue — not twice, as an exposure and a problem.
    expect(register.riskSummary).toMatchObject({ open: 0, materialised: 1, resolved: 0 });
    expect(register.issueSummary).toMatchObject({ open: 1, fromRisk: 1 });
  });
});

describe('REFERENCE ≠ OWNERSHIP, enforced by the dependency graph', () => {
  it('resolving an issue writes to the issue store and to nothing else', async () => {
    const f = fixture();
    const issue = await raiseIssue(f, {
      links: [
        { module: 'quality', recordType: 'ncr', recordId: 'ncr-17', label: 'NCR-17' },
        { module: 'procurement', recordType: 'purchase-order', recordId: 'po-105', label: 'PO-105' },
      ],
    });
    const riskWrite = vi.spyOn(f.risks, 'update');

    const resolved = await f.service.setIssueStatus(issue.id, 'resolved', {
      note: 'Client released the workfront on 6 Sep', actorId: 'u-pm',
    });

    expect(resolved.status).toBe('resolved');
    // The links are untouched, and there is no second register this could have reached into.
    expect(resolved.links).toHaveLength(2);
    expect(riskWrite).not.toHaveBeenCalled();
    // The event says how many records this issue pointed at, so an auditor can see what was NOT
    // closed alongside it.
    expect(f.events.append).toHaveBeenLastCalledWith([
      expect.objectContaining({ payload: expect.objectContaining({ toStatus: 'resolved', linkedRecords: 2 }) }),
    ]);
  });

  it('holds no dependency capable of writing to another domain', () => {
    // The structural proof. Closing an issue cannot close NCR-17 because there is no path from this
    // service to Quality — not because a check refuses it. A future import of a domain service here
    // would silently create that path, so the constructor's dependencies are pinned.
    const source = readFileSync(join(__dirname, 'risk-issue.service.ts'), 'utf8');
    const imports = [...source.matchAll(/from '([^']+)'/g)].map((m) => m[1]);
    const foreign = imports.filter((i) => i.startsWith('@aura/') && !['@aura/shared', '@aura/core'].includes(i));
    expect(foreign, 'a §21 issue must never gain the ability to write another domain\'s record').toEqual([]);
    // And nothing local beyond the two registers, the project it hangs off, and the event log.
    const local = imports.filter((i) => i.startsWith('./'));
    expect(local.sort()).toEqual([
      './domain/project-issue', './domain/project-risk', './project-store', './risk-issue-store',
    ]);
  });
});

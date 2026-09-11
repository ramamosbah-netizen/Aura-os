import { describe, expect, it, vi } from 'vitest';
import { WorkItemsService } from './work-items.service';

/**
 * §21 registers reaching My Work — the fourteenth and fifteenth sources.
 *
 * My Work stays an AGGREGATOR. No task table is created for risks or issues, and nothing here
 * writes: the register is the authority, and this surface points at it.
 *
 * Both scopes are computable (AURA-PM-001): a risk/issue carries `ownerId` — the accountable user —
 * beside the free-text `owner` name, so "assigned to me" is answered by id equality. The name is
 * still matched against nothing; these tests pin both halves — an id assigns, a lookalike name does
 * not — so nobody later "fixes" the name into a phantom assignment.
 */

const empty = () => Promise.resolve([]);

const risk = (over: Record<string, unknown> = {}) => ({
  id: 'r1', tenantId: 'tenant-a', projectId: 'p1', reference: null,
  title: 'Authority approval may be delayed', description: null, area: 'AUTHORITY',
  likelihood: 'high', impact: 'high', severity: 'CRITICAL',
  mitigation: 'Weekly follow-up', acceptanceReason: null,
  owner: 'R. Mosbah', targetDate: '2026-08-20', status: 'OPEN',
  createdAt: '2026-08-01T00:00:00.000Z', createdBy: 'user-a', updatedAt: '2026-08-01T00:00:00.000Z',
  ...over,
});

const issue = (over: Record<string, unknown> = {}) => ({
  id: 'i1', tenantId: 'tenant-a', projectId: 'p1', reference: null,
  title: 'Riser 3 access blocked', description: 'Main contractor scaffolding',
  area: 'INTERFACE', severity: 'critical', status: 'open', owner: 'Site manager',
  raisedAt: '2026-09-01T00:00:00.000Z', raisedBy: 'user-a', dueDate: '2026-09-05',
  resolution: null, resolvedAt: null, resolvedBy: null, originRiskId: null, references: [],
  createdAt: '2026-09-01T00:00:00.000Z', createdBy: 'user-a', updatedAt: '2026-09-01T00:00:00.000Z',
  ...over,
});

function harness(risks: unknown[] = [], issues: unknown[] = []) {
  const activities = { list: vi.fn(async () => []) };
  const engineering = { listDrawings: empty, listRfis: empty, listTechnicalQueries: empty };
  const quality = { listNcrs: empty, listSnags: empty };
  const hse = { listCapas: empty };
  const prs = { list: empty }, rfqs = { list: empty }, pos = { list: empty };
  const projectRisks = { list: vi.fn(async () => risks) };
  const projectIssues = { list: vi.fn(async () => issues) };
  const notifications = { record: vi.fn(async () => ({})) };
  const service = new WorkItemsService(
    activities as never, engineering as never, quality as never, hse as never,
    prs as never, rfqs as never, pos as never,
    projectRisks as never, projectIssues as never, notifications as never,
  );
  return { service, projectRisks, projectIssues };
}

describe('project risks and issues in My Work', () => {
  it('surfaces a risk I raised, pointing at the register rather than owning it', async () => {
    const { service } = harness([risk()]);
    const { items } = await service.list('tenant-a', 'user-a');
    const item = items.find((i) => i.source === 'project-risk');

    expect(item).toMatchObject({
      module: 'Projects', kind: 'Risk', sourceId: 'r1', sourceStatus: 'OPEN', status: 'todo',
      // CRITICAL comes from the matrix, and the work list keeps that grade rather than flattening
      // it into the generic due-date priority.
      priority: 'critical',
      // The date the mitigation was PROMISED for — the only date a risk has.
      dueAt: '2026-08-20',
      href: '/project/p1/controls?tab=risks',
    });
    // No actions. My Work does not resolve a risk; the register does.
    expect(item?.actions).toEqual([]);
  });

  it('reads only the LIVE registers, because a closed one is history rather than work', async () => {
    const { service, projectRisks, projectIssues } = harness();
    await service.list('tenant-a', 'user-a');
    expect(projectRisks.list).toHaveBeenCalledWith(expect.objectContaining({ openOnly: true }));
    expect(projectIssues.list).toHaveBeenCalledWith(expect.objectContaining({ openOnly: true }));
    // And bounded: this is every register in the tenant, not one project's.
    expect(projectRisks.list).toHaveBeenCalledWith(expect.objectContaining({ limit: expect.any(Number) }));
  });

  it('does not match a lookalike NAME against an actor id', async () => {
    // owner is free text. Someone else's risk must not appear just because the owner NAME happens to
    // equal the actor id — only owner_id assigns. This is the guard AURA-PM-001 must not regress.
    const { service } = harness([risk({ createdBy: 'someone-else', owner: 'user-a', ownerId: null })]);
    const { items } = await service.list('tenant-a', 'user-a');
    expect(items.find((i) => i.source === 'project-risk')).toBeUndefined();
  });

  it('answers "assigned to me" from owner_id — a risk owned but not raised by me (AURA-PM-001)', async () => {
    const { service } = harness([risk({ createdBy: 'someone-else', ownerId: 'user-a' })]);
    const { items } = await service.list('tenant-a', 'user-a');
    const item = items.find((i) => i.source === 'project-risk');
    expect(item).toBeDefined();
    expect(item?.scopes).toEqual(['assigned']);
  });

  it('answers "assigned to me" for an issue owned but not raised by me', async () => {
    const { service } = harness([], [issue({ createdBy: 'coordinator', raisedBy: 'coordinator', ownerId: 'user-a' })]);
    const { items } = await service.list('tenant-a', 'user-a');
    const item = items.find((i) => i.source === 'project-issue');
    expect(item?.scopes).toEqual(['assigned']);
  });

  it('claims both scopes when I own AND raised it', async () => {
    const { service } = harness([risk({ ownerId: 'user-a' })], [issue({ ownerId: 'user-a' })]);
    const { items } = await service.list('tenant-a', 'user-a');
    for (const item of items.filter((i) => i.module === 'Projects')) {
      expect(item.scopes).toEqual(['assigned', 'created']);
    }
  });

  it('claims only `created` when no owner id is set — a name-only owner assigns nothing', async () => {
    const { service } = harness([risk()], [issue()]);
    const { items } = await service.list('tenant-a', 'user-a');
    for (const item of items.filter((i) => i.module === 'Projects')) {
      expect(item.scopes).toEqual(['created']);
    }
  });

  it('treats an accepted risk as carrying no outstanding action', async () => {
    // The register still shows it as live — a decision to carry an exposure is not a decision that
    // it is gone. A to-do list answers a different question, and the two are allowed to differ.
    const { service } = harness([risk({ status: 'ACCEPTED', acceptanceReason: 'Client carries it' })]);
    const { items } = await service.list('tenant-a', 'user-a');
    expect(items.find((i) => i.source === 'project-risk')?.status).toBe('done');
  });

  it('surfaces an issue I raised, at the severity someone declared', async () => {
    const { service } = harness([], [issue()]);
    const { items } = await service.list('tenant-a', 'user-a');
    expect(items.find((i) => i.source === 'project-issue')).toMatchObject({
      module: 'Projects', kind: 'Issue', status: 'todo', priority: 'critical',
      dueAt: '2026-09-05', href: '/project/p1/controls?tab=risks',
    });
  });

  it('counts an issue raised by someone else on my behalf as mine', async () => {
    // `raisedBy` is who observed it; `createdBy` is who typed it. They differ whenever an issue is
    // written up for somebody, and either is a reason to see it.
    const { service } = harness([], [issue({ createdBy: 'coordinator', raisedBy: 'user-a' })]);
    const { items } = await service.list('tenant-a', 'user-a');
    expect(items.find((i) => i.source === 'project-issue')).toBeDefined();
  });

  it('reports Projects as a connected source', async () => {
    const { service } = harness();
    const { coverage } = await service.list('tenant-a', 'user-a');
    expect(coverage.connected).toContain('Projects');
  });
});

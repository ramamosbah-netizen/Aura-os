import { describe, it, expect, vi } from 'vitest';
import { NullTxRunner, type AccessService, type EventStore, type TenantContext } from '@aura/core';
import {
  ActivityService,
  LeadService,
  InMemoryLeadStore,
  InMemoryActivityStore,
} from '@aura/crm';
import { LeadCommandController } from './lead-command.controller';

/**
 * S1 Lead OS E2E — a lead SURFACES in "Needs Attention" (unassigned, no follow-up, stale),
 * then CLEARS once it is assigned, responded to, and given a scheduled next step. Drives the
 * real command controller over in-memory stores; Activity is the source of truth for the
 * follow-up facts the controller derives.
 */
function harness() {
  const events = {
    append: vi.fn().mockResolvedValue(undefined),
    appendWithClient: vi.fn().mockResolvedValue(undefined),
  } as unknown as EventStore;
  const access = { assert: vi.fn() } as unknown as AccessService;
  const leadStore = new InMemoryLeadStore();
  const activityStore = new InMemoryActivityStore();
  const leads = new LeadService(leadStore, events, new NullTxRunner(), access);
  const activities = new ActivityService(activityStore, events);
  const tenant = { get: () => ({ tenantId: 't1', companyId: null, actorId: 'u1' }) } as unknown as TenantContext;
  const controller = new LeadCommandController(leads, activities, tenant);
  return { leads, activities, controller };
}

interface CommandRow {
  id: string;
  assignedToMe: boolean;
  attention: { needsAttention: boolean; gaps: string[]; severity: string | null };
}
interface CommandOut { counts: { all: number; mine: number; needsAttention: number; nurture: number }; leads: CommandRow[] }

describe('LeadCommandController — surface then clear', () => {
  it('a brand-new lead surfaces, and clears after assign + response + next step', async () => {
    const { leads, activities, controller } = harness();

    const lead = await leads.create({ tenantId: 't1', name: 'Globex' });

    // 1) Surfaces: unassigned, no scheduled follow-up, never touched.
    const before = (await controller.command()) as CommandOut;
    const rowBefore = before.leads.find((r) => r.id === lead.id)!;
    expect(rowBefore.attention.needsAttention).toBe(true);
    expect(rowBefore.attention.gaps).toEqual(expect.arrayContaining(['UNASSIGNED', 'NO_NEXT_ACTIVITY', 'STALE']));
    expect(before.counts.needsAttention).toBeGreaterThanOrEqual(1);

    // 2) Work it: assign to me, log a completed call (first response + touch), schedule a future follow-up.
    await leads.assign(lead.id, 'u1');
    await activities.create({
      tenantId: 't1', type: 'call', subject: 'Intro call', status: 'completed',
      relatedType: 'lead', relatedId: lead.id, completedAt: new Date().toISOString(),
    });
    const future = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
    await activities.create({
      tenantId: 't1', type: 'task', subject: 'Send proposal', status: 'open',
      relatedType: 'lead', relatedId: lead.id, dueDate: future,
    });

    // 3) Clears.
    const after = (await controller.command()) as CommandOut;
    const rowAfter = after.leads.find((r) => r.id === lead.id)!;
    expect(rowAfter.attention.needsAttention).toBe(false);
    expect(rowAfter.attention.gaps).toEqual([]);
    expect(rowAfter.assignedToMe).toBe(true);
    expect(after.counts.mine).toBe(1);
  });
});

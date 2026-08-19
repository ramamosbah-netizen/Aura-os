import { describe, expect, it, vi } from 'vitest';
import { ForbiddenException } from '@nestjs/common';
import { WorkItemsService } from './work-items.service';

const empty = () => Promise.resolve([]);

function harness() {
  const activity = {
    id: 'a1', tenantId: 'tenant-a', companyId: null, type: 'task', subject: 'Assigned task', notes: null,
    relatedType: 'project', relatedId: 'p1', relatedName: 'Project One', dueDate: '2026-08-15', status: 'open',
    startedAt: null, completedAt: null, outcome: null, direction: null, counterparty: null,
    assigneeId: 'user-a', createdAt: '2026-08-01T00:00:00.000Z', createdBy: 'user-a',
    reminderAt: null, reminderSentAt: null, recurrence: 'none', recurrenceEndsOn: null, recurrenceSeriesId: null,
  };
  const activities = {
    list: vi.fn(async () => [activity]),
    get: vi.fn(async () => activity),
    create: vi.fn(async (input: Record<string, unknown>) => ({ ...activity, ...input, id: 'created-1', relatedType: null, relatedId: null, relatedName: null })),
    updateDetails: vi.fn(async (_id: string, patch: Record<string, unknown>) => ({ ...activity, ...patch })),
    archive: vi.fn(async () => ({ ...activity, status: 'cancelled' })),
    start: vi.fn(), complete: vi.fn(), reopen: vi.fn(),
  };
  const engineering = { listDrawings: empty, listRfis: empty, listTechnicalQueries: empty };
  const quality = { listNcrs: empty, listSnags: empty };
  const hse = { listCapas: empty };
  const prs = { list: empty }, rfqs = { list: empty }, pos = { list: empty };
  const notifications = { record: vi.fn(async () => ({})) };
  const service = new WorkItemsService(activities as never, engineering as never, quality as never, hse as never, prs as never, rfqs as never, pos as never, notifications as never);
  return { service, activities, notifications };
}

describe('WorkItemsService', () => {
  it('queries activities by tenant and current user in the source store and de-duplicates scopes', async () => {
    const { service, activities } = harness();
    const result = await service.list('tenant-a', 'user-a');
    expect(activities.list).toHaveBeenCalledWith({ tenantId: 'tenant-a', assigneeId: 'user-a', limit: 1000 });
    expect(activities.list).toHaveBeenCalledWith({ tenantId: 'tenant-a', createdBy: 'user-a', limit: 1000 });
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({ id: 'crm-activity:a1', status: 'todo', scopes: ['assigned', 'created'], origin: 'self' });
  });

  it('identifies system-created and other-user-created assignments without exposing unrelated tasks', async () => {
    const { service, activities } = harness();
    const base = await activities.get();
    activities.list.mockImplementation(async (input: { assigneeId?: string; createdBy?: string }) => {
      if (input.assigneeId === 'user-a') return [
        { ...base, id: 'system-task', createdBy: null, subject: 'Automated compliance reminder' },
        { ...base, id: 'delegated-task', createdBy: 'manager-a', subject: 'Review delegated document' },
      ];
      return [];
    });
    const result = await service.list('tenant-a', 'user-a');
    expect(result.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ sourceId: 'system-task', origin: 'system', scopes: ['assigned'] }),
      expect.objectContaining({ sourceId: 'delegated-task', origin: 'other', scopes: ['assigned'] }),
    ]));
  });

  it('refuses quick actions for a non-command source', async () => {
    const { service } = harness();
    await expect(service.act('tenant-a', 'user-a', 'quality-ncr', 'n1', 'complete')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('refuses a CRM quick action when the caller is not the assignee', async () => {
    const { service, activities } = harness();
    activities.get.mockResolvedValue({ id: 'a1', tenantId: 'tenant-a', assigneeId: 'someone-else' });
    await expect(service.act('tenant-a', 'user-a', 'crm-activity', 'a1', 'complete')).rejects.toBeInstanceOf(ForbiddenException);
    expect(activities.complete).not.toHaveBeenCalled();
  });

  it('creates a personal task owned by the signed-in user', async () => {
    const { service, activities } = harness();
    const item = await service.create('tenant-a', 'user-a', { title: 'Prepare weekly plan', memo: 'Before stand-up', dueAt: '2026-08-18' });
    expect(activities.create).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: 'tenant-a', type: 'task', subject: 'Prepare weekly plan', assigneeId: 'user-a', createdBy: 'user-a',
    }));
    expect(item).toMatchObject({ source: 'crm-activity', editable: true, deletable: true, reschedulable: true, origin: 'self' });
  });

  it('reschedules an owned task and preserves a dated justification in its memo', async () => {
    const { service, activities } = harness();
    const item = await service.reschedule('tenant-a', 'user-a', 'crm-activity', 'a1', '2026-08-22', 'Waiting for consultant response');
    expect(activities.updateDetails).toHaveBeenCalledWith('a1', expect.objectContaining({
      dueDate: '2026-08-22',
      notes: expect.stringMatching(/2026-08-15.*2026-08-22[\s\S]*consultant response/),
    }), 'user-a');
    expect(item.dueAt).toBe('2026-08-22');
  });

  it('soft-deletes only an owned personal task', async () => {
    const { service, activities } = harness();
    await expect(service.remove('tenant-a', 'user-a', 'crm-activity', 'a1')).resolves.toEqual({ deleted: true });
    expect(activities.archive).toHaveBeenCalledWith('a1', 'user-a');
    activities.get.mockResolvedValue({ ...await activities.get(), createdBy: 'another-user' });
    await expect(service.remove('tenant-a', 'user-a', 'crm-activity', 'a1')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('records due reminders once and marks them as dispatched', async () => {
    const { service, activities, notifications } = harness();
    activities.list.mockResolvedValue([{ ...await activities.get(), reminderAt: '2026-01-01T08:00:00.000Z', reminderSentAt: null }]);
    await expect(service.dispatchDueReminders('tenant-a', 'user-a')).resolves.toEqual({ dispatched: 1 });
    expect(notifications.record).toHaveBeenCalledWith(expect.objectContaining({ userId: 'user-a', category: 'my-work', refId: 'a1' }));
    expect(activities.updateDetails).toHaveBeenCalledWith('a1', expect.objectContaining({ reminderSentAt: expect.any(String) }), 'user-a');
  });

  it('creates the next occurrence when a recurring personal task is completed', async () => {
    const { service, activities } = harness();
    const recurring = { ...await activities.get(), recurrence: 'weekly', recurrenceEndsOn: '2026-09-30', reminderAt: '2026-08-14T09:00:00.000Z' };
    activities.get.mockResolvedValue(recurring);
    activities.complete.mockResolvedValue({ ...recurring, status: 'completed', completedAt: '2026-08-16T09:00:00.000Z' });
    await service.act('tenant-a', 'user-a', 'crm-activity', 'a1', 'complete');
    expect(activities.create).toHaveBeenCalledWith(expect.objectContaining({ dueDate: '2026-08-22', recurrence: 'weekly', recurrenceSeriesId: 'a1' }));
  });
});

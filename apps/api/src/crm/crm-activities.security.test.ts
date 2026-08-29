import 'reflect-metadata';
import { ForbiddenException } from '@nestjs/common';
import { PERMISSIONS_KEY } from '@aura/core';
import type { Activity } from '../../../../modules/crm/src/domain/activity';
import { ActivityService } from '../../../../modules/crm/src/activity.service';
import { InMemoryActivityStore } from '../../../../modules/crm/src/in-memory-activity-store';
import { describe, expect, it, vi } from 'vitest';
import { CrmActivitiesController } from './crm-activities.controller';
import { CrmTimelineController } from './crm-timeline.controller';
import { ActivityReferenceService } from './activity-reference.service';

const permissionOf = (target: object, handler: string): string[] | undefined =>
  Reflect.getMetadata(PERMISSIONS_KEY, (target as Record<string, unknown>)[handler]);

describe('CRM activity authorization contract', () => {
  it('uses explicit business permissions for activity routes', () => {
    expect(permissionOf(CrmActivitiesController.prototype, 'create')).toEqual(['crm.activity.create']);
    expect(permissionOf(CrmActivitiesController.prototype, 'list')).toEqual(['crm.activity.read']);
    expect(permissionOf(CrmActivitiesController.prototype, 'paged')).toEqual(['crm.activity.read']);
    expect(permissionOf(CrmTimelineController.prototype, 'timeline')).toEqual(['crm.activity.read']);
    expect(permissionOf(CrmActivitiesController.prototype, 'get')).toEqual(['crm.activity.read']);
    for (const handler of ['cancel', 'start', 'reopen', 'complete']) {
      expect(permissionOf(CrmActivitiesController.prototype, handler)).toEqual(['crm.activity.update']);
    }
  });

  it('prevents an unassigned user from changing personal work lifecycle', async () => {
    const store = new InMemoryActivityStore();
    const service = new ActivityService(store, { append: async () => undefined } as never);
    const activity = await service.create({
      tenantId: 'tenant-a', type: 'task', subject: 'Private task', assigneeId: 'user-b', createdBy: 'user-b',
    });

    await expect(service.start(activity.id, 'user-a')).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.complete(activity.id, undefined, undefined, 'user-a')).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.cancel(activity.id, 'user-a')).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.reopen(activity.id, 'user-a')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('enforces the related reference pair at the service boundary', async () => {
    const service = new ActivityService(new InMemoryActivityStore(), { append: async () => undefined } as never);
    await expect(service.create({ tenantId: 'tenant-a', type: 'note', subject: 'dangling', relatedType: 'account' } as never))
      .rejects.toThrow('relatedType and relatedId must be supplied together');
    await expect(service.create({ tenantId: 'tenant-a', type: 'note', subject: 'invalid', relatedType: 'not-a-type', relatedId: 'id' } as never))
      .rejects.toThrow('invalid relatedType');
  });

  it('allows the assigned user to change personal work lifecycle', async () => {
    const store = new InMemoryActivityStore();
    const service = new ActivityService(store, { append: async () => undefined } as never);
    const activity = await service.create({
      tenantId: 'tenant-a', type: 'task', subject: 'Assigned task', assigneeId: 'user-b', createdBy: 'user-a',
    });
    const started = await service.start(activity.id, 'user-b');
    expect(started.status).toBe('in_progress');
    const completed = await service.complete(activity.id, undefined, 'done', 'user-b');
    expect(completed.status).toBe('completed');
  });

  it('records actor and status transitions for lifecycle audit events', async () => {
    const append = vi.fn(async () => undefined);
    const service = new ActivityService(new InMemoryActivityStore(), { append } as never);
    const activity = await service.create({ tenantId: 'tenant-a', type: 'task', subject: 'Audited task', assigneeId: 'user-a', createdBy: 'user-a' });
    append.mockClear();

    await service.start(activity.id, 'user-a');
    expect(append.mock.calls[0][0][0]).toMatchObject({
      type: 'crm.activity.started',
      actorId: 'user-a',
      payload: { previousStatus: 'open', status: 'in_progress' },
    });

    append.mockClear();
    await service.complete(activity.id, undefined, 'done', 'user-a');
    expect(append.mock.calls[0][0][0]).toMatchObject({
      type: 'crm.activity.completed',
      actorId: 'user-a',
      payload: { previousStatus: 'in_progress', status: 'completed' },
    });
  });

  it('forces bound tenant scope even when a caller supplies another tenant filter', async () => {
    const store = new InMemoryActivityStore();
    const tenant = { boundTenantId: () => 'tenant-a' } as never;
    const service = new ActivityService(store, { append: async () => undefined } as never, tenant);
    await service.create({ tenantId: 'tenant-a', type: 'note', subject: 'A' });
    await service.create({ tenantId: 'tenant-b', type: 'note', subject: 'B' });
    const rows = await service.list({ tenantId: 'tenant-b' });
    expect(rows).toHaveLength(1);
    expect((rows[0] as Activity).tenantId).toBe('tenant-a');
  });

  it('rejects missing and foreign-tenant polymorphic references before persistence', async () => {
    const get = (record: { tenantId: string } | null) => async () => record;
    const references = new ActivityReferenceService(
      { get: get(null) } as never,
      { get: get(null) } as never,
      { get: get(null) } as never,
      { get: get({ tenantId: 'tenant-b' }) } as never,
      { get: get(null) } as never,
      { get: get(null) } as never,
      { get: get(null) } as never,
      { get: get(null) } as never,
    );
    await expect(references.validate('tenant-a', 'account', '11111111-1111-4111-8111-111111111111')).rejects.toThrow('related record not found');
    await expect(references.validate('tenant-a', 'opportunity', '22222222-2222-4222-8222-222222222222')).rejects.toThrow('related record not found');
    await expect(references.validate('tenant-a', 'account', undefined)).rejects.toThrow('supplied together');
  });

  it('rejects unknown, foreign-tenant, and inactive assignees through the canonical directory', async () => {
    const users = {
      ensureTenant: vi.fn(async () => undefined),
      get: vi.fn((tenantId: string, userId: string) => {
        if (tenantId !== 'tenant-a') return null;
        if (userId === 'inactive') return { tenantId, userId, active: false };
        if (userId === 'valid') return { tenantId, userId, active: true };
        return null;
      }),
    };
    const service = new ActivityService(new InMemoryActivityStore(), { append: async () => undefined } as never, null, users as never);

    await expect(service.create({ tenantId: 'tenant-a', type: 'task', subject: 'unknown', assigneeId: 'missing' }))
      .rejects.toThrow('active user');
    await expect(service.create({ tenantId: 'tenant-a', type: 'task', subject: 'foreign', assigneeId: 'tenant-b-user' }))
      .rejects.toThrow('active user');
    await expect(service.create({ tenantId: 'tenant-a', type: 'task', subject: 'inactive', assigneeId: 'inactive' }))
      .rejects.toThrow('inactive');
    await expect(service.create({ tenantId: 'tenant-a', type: 'task', subject: 'valid', assigneeId: 'valid' })).resolves.toMatchObject({ assigneeId: 'valid' });
    expect(users.ensureTenant).toHaveBeenCalledWith('tenant-a');
  });
});

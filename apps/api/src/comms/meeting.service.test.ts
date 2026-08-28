import { describe, expect, it, vi } from 'vitest';
import { MeetingService } from './meeting.service';
import { InMemoryMeetingStore } from './meeting-store';

const input = { tenantId: 't1', companyId: null, organizerId: 'u-admin', title: 'Weekly progress', startsAt: '2026-08-30T06:00:00.000Z', endsAt: '2026-08-30T07:00:00.000Z', timezone: 'Asia/Dubai', meetingType: 'progress' as const };

describe('MeetingService', () => {
  it('creates a meeting and indexes it in Communication', async () => {
    const store = new InMemoryMeetingStore(); const activities = { create: vi.fn().mockResolvedValue({ id: 'activity-1' }) }; const notifications = { record: vi.fn().mockResolvedValue({}) }; const comms = { publishTimeline: vi.fn().mockResolvedValue(undefined) };
    const service = new MeetingService(store, activities as never, notifications as never, comms as never);
    const meeting = await service.create(input);
    expect(meeting.title).toBe('Weekly progress'); expect(activities.create).toHaveBeenCalledWith(expect.objectContaining({ type: 'meeting', subject: 'Weekly progress' })); expect(comms.publishTimeline).toHaveBeenCalledOnce();
  });

  it('turns an action item into a My Work task and preserves its meeting link', async () => {
    const store = new InMemoryMeetingStore(); const activities = { create: vi.fn().mockResolvedValue({ id: 'task-1' }) }; const notifications = { record: vi.fn().mockResolvedValue({}) }; const comms = { publishTimeline: vi.fn().mockResolvedValue(undefined) };
    const service = new MeetingService(store, activities as never, notifications as never, comms as never); const meeting = await service.create(input);
    const updated = await service.addItem('t1', 'u-admin', meeting.id, { kind: 'action', title: 'Submit revised drawing', ownerId: 'u-site', dueAt: '2026-08-31' });
    expect(updated.actionItems[0]).toMatchObject({ title: 'Submit revised drawing', taskId: 'task-1', ownerId: 'u-site' }); expect(activities.create).toHaveBeenLastCalledWith(expect.objectContaining({ type: 'task', assigneeId: 'u-site', relatedType: null }));
  });

  it('requires minutes before closing', async () => {
    const store = new InMemoryMeetingStore(); const service = new MeetingService(store, { create: vi.fn() } as never, { record: vi.fn() } as never, { publishTimeline: vi.fn() } as never); const meeting = await service.create(input);
    await expect(service.close('t1', meeting.id, null)).rejects.toThrow('Minutes are required');
  });

  it('does not allow an unrelated user to mutate a meeting', async () => {
    const store = new InMemoryMeetingStore(); const service = new MeetingService(store, { create: vi.fn() } as never, { record: vi.fn() } as never, { publishTimeline: vi.fn() } as never);
    const meeting = await service.create({ ...input, attendees: [{ userId: 'u-site', displayName: 'Site' }] });
    await expect(service.update('t1', meeting.id, { title: 'Hijacked' }, 'u-other', false, null)).rejects.toThrow('Meeting not found');
    await expect(service.close('t1', meeting.id, 'Minutes', 'u-other', false, null)).rejects.toThrow('Meeting not found');
    await expect(service.addItem('t1', 'u-other', meeting.id, { kind: 'action', title: 'Hijacked' }, false, null)).rejects.toThrow('Meeting not found');
  });
});

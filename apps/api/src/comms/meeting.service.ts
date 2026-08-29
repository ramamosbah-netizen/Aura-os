import { BadRequestException, Inject, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { ActivityService, type ActivityRelatedType } from '@aura/crm';
import { NotificationService } from '@aura/core';
import { newId } from '@aura/shared';
import { COMMS_STORE, type CommsStore } from './comms-store';
import { MEETING_STORE, type Meeting, type MeetingAttendee, type MeetingItem, type MeetingPatch, type MeetingStore, type MeetingType } from './meeting-store';
import { ActivityReferenceService } from '../crm/activity-reference.service';

const RELATED_TYPES = new Set(['account', 'contact', 'lead', 'opportunity', 'quotation', 'tender', 'contract', 'project']);

@Injectable()
export class MeetingService {
  constructor(
    @Inject(MEETING_STORE) private readonly store: MeetingStore,
    private readonly activities: ActivityService,
    private readonly notifications: NotificationService,
    @Inject(COMMS_STORE) private readonly comms: CommsStore,
    @Optional() private readonly references?: ActivityReferenceService,
  ) {}

  async list(tenantId: string, companyId: string | null, scope?: string): Promise<Meeting[]> {
    const rows = await this.store.list(tenantId, companyId);
    const now = Date.now();
    const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dubai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    return rows.filter((meeting) => {
      if (!scope || scope === 'all') return true;
      if (scope === 'past') return meeting.status === 'completed' || new Date(meeting.endsAt).getTime() < now;
      if (scope === 'today') return meeting.startsAt.slice(0, 10) === day;
      if (scope === 'action-items') return meeting.actionItems.some((item) => item.status === 'open');
      return meeting.status !== 'cancelled' && new Date(meeting.endsAt).getTime() >= now;
    });
  }

  async get(tenantId: string, id: string, companyId: string | null = null): Promise<Meeting> {
    const row = await this.store.get(tenantId, id);
    if (!row || (companyId !== null && row.companyId !== companyId)) throw new NotFoundException('Meeting not found');
    return row;
  }

  private async requireActor(tenantId: string, id: string, companyId: string | null, actorId: string | null, isAdmin: boolean): Promise<Meeting> {
    const meeting = await this.get(tenantId, id, companyId);
    if (!actorId || isAdmin) return meeting;
    const attendee = meeting.attendees.some((person) => person.userId === actorId);
    if (meeting.organizerId !== actorId && !attendee) throw new NotFoundException('Meeting not found');
    return meeting;
  }

  async create(input: {
    tenantId: string; companyId: string | null; organizerId: string; title: string; meetingType?: MeetingType;
    startsAt: string; endsAt: string; timezone?: string; location?: string | null; onlineUrl?: string | null;
    attendees?: MeetingAttendee[]; relatedType?: string | null; relatedId?: string | null; relatedName?: string | null; agenda?: string | null;
  }): Promise<Meeting> {
    if (!input.title?.trim()) throw new BadRequestException('Meeting title is required');
    const startsAt = new Date(input.startsAt); const endsAt = new Date(input.endsAt);
    if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime()) || endsAt <= startsAt) throw new BadRequestException('Meeting times are invalid');
    const relatedType = input.relatedType && RELATED_TYPES.has(input.relatedType) ? input.relatedType as ActivityRelatedType : null;
    await this.references?.validate(input.tenantId, relatedType, input.relatedId);
    const meeting = await this.store.create({ ...input, title: input.title.trim(), meetingType: input.meetingType ?? 'internal_coordination', timezone: input.timezone ?? 'Asia/Dubai', createdBy: input.organizerId, relatedType });
    await this.activities.create({ tenantId: meeting.tenantId, companyId: meeting.companyId, type: 'meeting', subject: meeting.title, notes: meeting.agenda, dueDate: meeting.startsAt.slice(0, 10), relatedType, relatedId: meeting.relatedId, relatedName: meeting.relatedName, assigneeId: meeting.organizerId, createdBy: meeting.createdBy });
    await this.comms.publishTimeline(meeting.tenantId, { id: newId(), companyId: meeting.companyId, occurredAt: meeting.startsAt, channel: 'meeting', direction: 'internal', actor: meeting.organizerId, subjectType: 'meeting', subjectId: meeting.id, title: meeting.title, preview: `${meeting.meetingType} · scheduled`, visibility: 'participants', visibilityKey: meeting.id });
    const recipients = [...new Set([meeting.organizerId, ...meeting.attendees.map((attendee) => attendee.userId).filter((id): id is string => Boolean(id))])];
    await Promise.all(recipients.map((userId) => this.notifications.record({ tenantId: meeting.tenantId, userId, title: `Meeting scheduled: ${meeting.title}`, body: new Date(meeting.startsAt).toLocaleString('en-GB', { timeZone: meeting.timezone }), category: 'communication', refType: 'meeting', refId: meeting.id })));
    return meeting;
  }

  async update(tenantId: string, id: string, patch: MeetingPatch, actorId: string | null = null, isAdmin = false, companyId: string | null = null): Promise<Meeting> {
    await this.requireActor(tenantId, id, companyId, actorId, isAdmin);
    if (patch.startsAt && Number.isNaN(Date.parse(patch.startsAt))) throw new BadRequestException('Meeting start is invalid');
    if (patch.endsAt && Number.isNaN(Date.parse(patch.endsAt))) throw new BadRequestException('Meeting end is invalid');
    const updated = await this.store.update(tenantId, id, patch); if (!updated) throw new NotFoundException('Meeting not found'); return updated;
  }

  async addItem(tenantId: string, actorId: string, meetingId: string, input: { kind?: string; title?: string; detail?: string | null; ownerId?: string | null; dueAt?: string | null }, isAdmin = false, companyId: string | null = null): Promise<Meeting> {
    const meeting = await this.requireActor(tenantId, meetingId, companyId, actorId, isAdmin);
    const kind = input.kind === 'decision' ? 'decision' : input.kind === 'action' ? 'action' : null;
    if (!kind || !input.title?.trim()) throw new BadRequestException('An item kind and title are required');
    let taskId: string | null = null;
    if (kind === 'action') {
      const relatedType = meeting.relatedType && RELATED_TYPES.has(meeting.relatedType) ? meeting.relatedType as ActivityRelatedType : null;
      await this.references?.validate(tenantId, relatedType, meeting.relatedId);
      const task = await this.activities.create({ tenantId, companyId: meeting.companyId, type: 'task', subject: input.title.trim(), notes: input.detail ?? `Action from meeting: ${meeting.title}`, dueDate: input.dueAt ?? null, relatedType: meeting.relatedType && RELATED_TYPES.has(meeting.relatedType) ? meeting.relatedType as ActivityRelatedType : null, relatedId: meeting.relatedId, relatedName: meeting.relatedName, assigneeId: input.ownerId ?? actorId, createdBy: actorId });
      taskId = task.id;
      if (input.ownerId) await this.notifications.record({ tenantId, userId: input.ownerId, title: `Meeting action assigned: ${input.title.trim()}`, body: meeting.title, category: 'my-work', refType: 'crm.activity', refId: task.id });
    }
    const item: MeetingItem = { id: newId(), kind, title: input.title.trim(), detail: input.detail?.trim() || null, ownerId: input.ownerId ?? null, dueAt: input.dueAt ?? null, status: 'open', taskId, createdAt: new Date().toISOString() };
    const updated = await this.store.addItem(tenantId, meetingId, item); if (!updated) throw new NotFoundException('Meeting not found'); return updated;
  }

  async updateItem(tenantId: string, meetingId: string, itemId: string, patch: { status?: 'open' | 'done' | 'cancelled' }, actorId: string | null = null, isAdmin = false, companyId: string | null = null): Promise<Meeting> {
    const meeting = await this.requireActor(tenantId, meetingId, companyId, actorId, isAdmin);
    const item = [...meeting.decisions, ...meeting.actionItems].find((candidate) => candidate.id === itemId);
    if (!item) throw new NotFoundException('Meeting item not found');
    if (patch.status === 'done' && item.taskId) await this.activities.complete(item.taskId, undefined, `Completed from meeting: ${meeting.title}`, actorId);
    const updated = await this.store.updateItem(tenantId, meetingId, itemId, patch); if (!updated) throw new NotFoundException('Meeting not found'); return updated;
  }

  async close(tenantId: string, id: string, minutes: string | null, actorId: string | null = null, isAdmin = false, companyId: string | null = null): Promise<Meeting> {
    const meeting = await this.requireActor(tenantId, id, companyId, actorId, isAdmin);
    if (!minutes?.trim() && !meeting.minutes?.trim()) throw new BadRequestException('Minutes are required before closing a meeting');
    const updated = await this.store.update(tenantId, id, { status: 'completed', minutes: minutes?.trim() || meeting.minutes }); if (!updated) throw new NotFoundException('Meeting not found');
    await this.comms.publishTimeline(tenantId, { id: newId(), companyId: updated.companyId, occurredAt: updated.closedAt ?? new Date().toISOString(), channel: 'meeting', direction: 'internal', actor: updated.organizerId, subjectType: 'meeting', subjectId: updated.id, title: updated.title, preview: `${updated.decisions.length} decisions · ${updated.actionItems.length} action items`, visibility: 'participants', visibilityKey: updated.id });
    return updated;
  }
}

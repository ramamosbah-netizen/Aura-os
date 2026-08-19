import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ActivityService, type Activity, type TaskRecurrence } from '@aura/crm';
import { NotificationService } from '@aura/core';
import { EngineeringService, type Drawing, type Rfi, type TechnicalQuery } from '@aura/engineering';
import { HseService, type CapaAction } from '@aura/hse';
import { PurchaseOrderService, PurchaseRequestService, RfqService, type PurchaseOrder, type PurchaseRequest, type Rfq } from '@aura/procurement';
import { QualityService, type Ncr, type Snag } from '@aura/quality';

export type WorkItemStatus = 'todo' | 'in_progress' | 'waiting' | 'blocked' | 'done' | 'cancelled';
export type WorkItemPriority = 'critical' | 'high' | 'medium' | 'low' | 'normal';
export type WorkItemScope = 'assigned' | 'created';
export type WorkItemAction = 'start' | 'complete' | 'reopen';
export type WorkItemOrigin = 'self' | 'system' | 'other';

export interface WorkItem {
  id: string;
  source: string;
  sourceId: string;
  module: string;
  kind: string;
  title: string;
  detail: string | null;
  href: string;
  projectId: string | null;
  projectName: string | null;
  status: WorkItemStatus;
  sourceStatus: string;
  priority: WorkItemPriority;
  dueAt: string | null;
  createdAt: string;
  updatedAt: string;
  scopes: WorkItemScope[];
  isFollowUp: boolean;
  actions: WorkItemAction[];
  origin: WorkItemOrigin;
  memo?: string | null;
  editable?: boolean;
  deletable?: boolean;
  reschedulable?: boolean;
  reminderAt?: string | null;
  recurrence?: TaskRecurrence;
  recurrenceEndsOn?: string | null;
}

export interface CreatePersonalTask {
  title: string;
  memo?: string | null;
  dueAt?: string | null;
  reminderAt?: string | null;
  recurrence?: TaskRecurrence;
  recurrenceEndsOn?: string | null;
}

export interface UpdatePersonalTask {
  title?: string;
  memo?: string | null;
  reminderAt?: string | null;
  recurrence?: TaskRecurrence;
  recurrenceEndsOn?: string | null;
}

export interface WorkItemsPayload {
  generatedAt: string;
  items: WorkItem[];
  coverage: {
    connected: string[];
    notConnected: Array<{ module: string; reason: string }>;
  };
}

const dateOnly = (value: string | null): string | null => value?.slice(0, 10) ?? null;

function derivedPriority(dueAt: string | null, source?: 'high' | 'major' | 'medium' | 'minor' | 'low'): WorkItemPriority {
  if (source === 'major' || source === 'high') return 'high';
  if (source === 'medium') return 'medium';
  if (source === 'minor' || source === 'low') return 'low';
  const due = dateOnly(dueAt);
  if (!due) return 'normal';
  const today = new Date().toISOString().slice(0, 10);
  if (due < today) return 'high';
  if (due === today) return 'medium';
  return 'normal';
}

function crmHref(activity: Activity): string {
  if (!activity.relatedId || !activity.relatedType) return '/crm/activities';
  const roots: Record<string, string> = {
    account: '/crm/accounts', contact: '/crm/contacts', lead: '/crm/leads', opportunity: '/crm/opportunities',
    quotation: '/crm/quotations', tender: '/tendering/tenders', contract: '/contracts/contracts', project: '/project',
  };
  const root = roots[activity.relatedType];
  return root ? `${root}/${activity.relatedId}` : '/crm/activities';
}

function scopes(assigned: boolean, created: boolean): WorkItemScope[] {
  return [...(assigned ? ['assigned' as const] : []), ...(created ? ['created' as const] : [])];
}

function origin(createdBy: string | null | undefined, actorId: string): WorkItemOrigin {
  return !createdBy ? 'system' : createdBy === actorId ? 'self' : 'other';
}

@Injectable()
export class WorkItemsService {
  constructor(
    private readonly activities: ActivityService,
    private readonly engineering: EngineeringService,
    private readonly quality: QualityService,
    private readonly hse: HseService,
    private readonly prs: PurchaseRequestService,
    private readonly rfqs: RfqService,
    private readonly pos: PurchaseOrderService,
    private readonly notifications: NotificationService,
  ) {}

  async list(tenantId: string, actorId: string): Promise<WorkItemsPayload> {
    const [assignedActivities, createdActivities, drawings, rfis, tqs, ncrs, snags, capas, prs, rfqs, pos] = await Promise.all([
      this.activities.list({ tenantId, assigneeId: actorId, limit: 1000 }),
      this.activities.list({ tenantId, createdBy: actorId, limit: 1000 }),
      this.engineering.listDrawings({ tenantId, limit: 1000 }),
      this.engineering.listRfis({ tenantId, limit: 1000 }),
      this.engineering.listTechnicalQueries({ tenantId, limit: 1000 }),
      this.quality.listNcrs(tenantId),
      this.quality.listSnags(tenantId),
      this.hse.listCapas(tenantId),
      this.prs.list({ tenantId, limit: 1000 }),
      this.rfqs.list({ tenantId, limit: 1000 }),
      this.pos.list({ tenantId, limit: 1000 }),
    ]);

    const items = new Map<string, WorkItem>();
    const put = (item: WorkItem): void => {
      const current = items.get(item.id);
      items.set(item.id, current ? { ...current, scopes: [...new Set([...current.scopes, ...item.scopes])] } : item);
    };

    for (const activity of [...assignedActivities, ...createdActivities]) {
      const assigned = activity.assigneeId === actorId;
      const created = activity.createdBy === actorId;
      if (!assigned && !created) continue;
      const status: WorkItemStatus = activity.status === 'open' ? 'todo'
        : activity.status === 'in_progress' ? 'in_progress'
          : activity.status === 'completed' ? 'done' : 'cancelled';
      put(this.activityItem(activity, actorId, status, assigned, created));
    }

    for (const drawing of drawings) this.addDrawing(put, drawing, actorId);
    for (const rfi of rfis) this.addRfi(put, rfi, actorId);
    for (const tq of tqs) this.addTq(put, tq, actorId);
    for (const ncr of ncrs) this.addNcr(put, ncr, actorId);
    for (const snag of snags) this.addSnag(put, snag, actorId);
    for (const capa of capas) this.addCapa(put, capa, actorId);
    for (const pr of prs) this.addPr(put, pr, actorId);
    for (const rfq of rfqs) this.addRfq(put, rfq, actorId);
    for (const po of pos) this.addPo(put, po, actorId);

    return {
      generatedAt: new Date().toISOString(),
      items: [...items.values()]
        .filter((item) => item.status !== 'cancelled')
        .sort((a, b) => (a.dueAt ?? '9999').localeCompare(b.dueAt ?? '9999') || b.updatedAt.localeCompare(a.updatedAt)),
      coverage: {
        connected: ['Activities', 'Engineering', 'Quality', 'HSE', 'Procurement'],
        notConnected: [
          { module: 'Site Execution', reason: 'No user-assignment contract is exposed yet.' },
          { module: 'Commissioning', reason: 'No user-assignment contract is exposed yet.' },
          { module: 'Finance', reason: 'Personal approvals remain in My Approvals until assignee data is available.' },
        ],
      },
    };
  }

  async create(tenantId: string, actorId: string, input: CreatePersonalTask): Promise<WorkItem> {
    const activity = await this.activities.create({
      tenantId,
      type: 'task',
      subject: input.title,
      notes: input.memo ?? null,
      dueDate: input.dueAt ?? null,
      reminderAt: input.reminderAt ?? null,
      recurrence: input.recurrence ?? 'none',
      recurrenceEndsOn: input.recurrenceEndsOn ?? null,
      assigneeId: actorId,
      createdBy: actorId,
    });
    return this.activityItem(activity, actorId, 'todo', true, true);
  }

  async update(
    tenantId: string,
    actorId: string,
    source: string,
    id: string,
    patch: UpdatePersonalTask,
  ): Promise<WorkItem> {
    await this.personalActivity(tenantId, actorId, source, id, 'edit');
    const updated = await this.activities.updateDetails(id, {
      ...(patch.title !== undefined ? { subject: patch.title } : {}),
      ...(patch.memo !== undefined ? { notes: patch.memo } : {}),
      ...(patch.reminderAt !== undefined ? { reminderAt: patch.reminderAt, reminderSentAt: null } : {}),
      ...(patch.recurrence !== undefined ? { recurrence: patch.recurrence } : {}),
      ...(patch.recurrenceEndsOn !== undefined ? { recurrenceEndsOn: patch.recurrenceEndsOn } : {}),
    }, actorId);
    return this.activityItem(updated, actorId, this.activityStatus(updated.status), updated.assigneeId === actorId, updated.createdBy === actorId);
  }

  async reschedule(
    tenantId: string,
    actorId: string,
    source: string,
    id: string,
    dueAt: string,
    reason: string,
  ): Promise<WorkItem> {
    const activity = await this.personalActivity(tenantId, actorId, source, id, 'reschedule', true);
    const stamp = new Date().toISOString();
    const entry = `[Rescheduled ${stamp}] ${activity.dueDate ?? 'No date'} → ${dueAt}\nReason: ${reason.trim()}`;
    const notes = activity.notes ? `${activity.notes.trim()}\n\n${entry}` : entry;
    let reminderAt = activity.reminderAt ?? null;
    if (reminderAt && activity.dueDate) {
      const previousDue = new Date(`${activity.dueDate}T00:00:00.000Z`).getTime();
      const nextDue = new Date(`${dueAt}T00:00:00.000Z`).getTime();
      reminderAt = new Date(new Date(reminderAt).getTime() + nextDue - previousDue).toISOString();
    }
    const updated = await this.activities.updateDetails(id, { dueDate: dueAt, notes, reminderAt, reminderSentAt: null }, actorId);
    return this.activityItem(updated, actorId, this.activityStatus(updated.status), updated.assigneeId === actorId, updated.createdBy === actorId);
  }

  async remove(tenantId: string, actorId: string, source: string, id: string): Promise<{ deleted: true }> {
    await this.personalActivity(tenantId, actorId, source, id, 'delete');
    await this.activities.archive(id, actorId);
    return { deleted: true };
  }

  async act(tenantId: string, actorId: string, source: string, id: string, action: WorkItemAction): Promise<WorkItem> {
    if (source !== 'crm-activity') throw new ForbiddenException('This source does not expose a safe quick action. Open the source record instead.');
    const activity = await this.activities.get(id);
    if (!activity || activity.tenantId !== tenantId) throw new NotFoundException('Work item not found');
    if (activity.assigneeId !== actorId) throw new ForbiddenException('Only the assigned user can update this work item here.');
    const updated = action === 'start' ? await this.activities.start(id)
      : action === 'complete' ? await this.activities.complete(id)
        : await this.activities.reopen(id);
    if (action === 'complete') await this.createNextOccurrence(activity);
    const payload = await this.list(tenantId, actorId);
    const item = payload.items.find((candidate) => candidate.source === source && candidate.sourceId === updated.id);
    if (!item) throw new NotFoundException('Updated work item not found');
    return item;
  }

  private activityStatus(status: Activity['status']): WorkItemStatus {
    return status === 'open' ? 'todo' : status === 'in_progress' ? 'in_progress' : status === 'completed' ? 'done' : 'cancelled';
  }

  private activityItem(
    activity: Activity,
    actorId: string,
    status = this.activityStatus(activity.status),
    assigned = activity.assigneeId === actorId,
    created = activity.createdBy === actorId,
  ): WorkItem {
    const personal = ['task', 'follow_up', 'reminder'].includes(activity.type);
    return {
      id: `crm-activity:${activity.id}`,
      source: 'crm-activity',
      sourceId: activity.id,
      module: 'Activities',
      kind: activity.type.replaceAll('_', ' '),
      title: activity.subject,
      detail: activity.relatedName ?? activity.notes,
      href: activity.relatedId ? crmHref(activity) : `/my-work/tasks?task=${activity.id}`,
      projectId: activity.relatedType === 'project' ? activity.relatedId : null,
      projectName: activity.relatedType === 'project' ? activity.relatedName : null,
      status,
      sourceStatus: activity.status,
      priority: derivedPriority(activity.dueDate),
      dueAt: activity.dueDate,
      createdAt: activity.createdAt,
      updatedAt: activity.completedAt ?? activity.startedAt ?? activity.createdAt,
      scopes: scopes(assigned, created),
      isFollowUp: activity.type === 'follow_up',
      actions: assigned ? (status === 'todo' ? ['start', 'complete'] : status === 'in_progress' ? ['complete'] : ['done', 'cancelled'].includes(status) ? ['reopen'] : []) : [],
      origin: origin(activity.createdBy, actorId),
      memo: activity.notes,
      editable: personal && created,
      deletable: personal && created,
      reschedulable: personal && (assigned || created) && status !== 'cancelled',
      reminderAt: activity.reminderAt ?? null,
      recurrence: activity.recurrence ?? 'none',
      recurrenceEndsOn: activity.recurrenceEndsOn ?? null,
    };
  }

  async dispatchDueReminders(tenantId: string, actorId: string): Promise<{ dispatched: number }> {
    const activities = await this.activities.list({ tenantId, assigneeId: actorId, limit: 1000 });
    const now = new Date().toISOString();
    const due = activities.filter((activity) =>
      ['task', 'follow_up', 'reminder'].includes(activity.type)
      && ['open', 'in_progress'].includes(activity.status)
      && !!activity.reminderAt
      && activity.reminderAt <= now
      && !activity.reminderSentAt,
    );
    for (const activity of due) {
      await this.notifications.record({
        tenantId,
        userId: actorId,
        title: `Task reminder: ${activity.subject}`,
        body: activity.dueDate ? `This task is due ${activity.dueDate}.` : 'This task needs your attention.',
        category: 'my-work',
        refType: 'crm.activity',
        refId: activity.id,
      });
      await this.activities.updateDetails(activity.id, { reminderSentAt: now }, actorId);
    }
    return { dispatched: due.length };
  }

  private async createNextOccurrence(activity: Activity): Promise<void> {
    const recurrence = activity.recurrence ?? 'none';
    if (recurrence === 'none' || !activity.dueDate) return;
    const next = this.nextDate(activity.dueDate, recurrence);
    if (activity.recurrenceEndsOn && next > activity.recurrenceEndsOn) return;
    let reminderAt: string | null = null;
    if (activity.reminderAt) {
      const currentDue = new Date(`${activity.dueDate}T00:00:00.000Z`).getTime();
      const nextDue = new Date(`${next}T00:00:00.000Z`).getTime();
      reminderAt = new Date(new Date(activity.reminderAt).getTime() + nextDue - currentDue).toISOString();
    }
    await this.activities.create({
      tenantId: activity.tenantId,
      companyId: activity.companyId,
      type: activity.type,
      subject: activity.subject,
      notes: activity.notes,
      relatedType: activity.relatedType,
      relatedId: activity.relatedId,
      relatedName: activity.relatedName,
      dueDate: next,
      reminderAt,
      recurrence,
      recurrenceEndsOn: activity.recurrenceEndsOn ?? null,
      recurrenceSeriesId: activity.recurrenceSeriesId ?? activity.id,
      assigneeId: activity.assigneeId,
      createdBy: activity.createdBy,
    });
  }

  private nextDate(value: string, recurrence: Exclude<TaskRecurrence, 'none'>): string {
    const date = new Date(`${value}T00:00:00.000Z`);
    if (recurrence === 'daily') date.setUTCDate(date.getUTCDate() + 1);
    if (recurrence === 'weekly') date.setUTCDate(date.getUTCDate() + 7);
    if (recurrence === 'monthly') {
      const requestedDay = date.getUTCDate();
      date.setUTCDate(1);
      date.setUTCMonth(date.getUTCMonth() + 1);
      const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
      date.setUTCDate(Math.min(requestedDay, lastDay));
    }
    return date.toISOString().slice(0, 10);
  }

  private async personalActivity(
    tenantId: string,
    actorId: string,
    source: string,
    id: string,
    operation: string,
    allowAssignee = false,
  ): Promise<Activity> {
    if (source !== 'crm-activity') {
      throw new ForbiddenException(`This source owns the record. Open it there to ${operation}.`);
    }
    const activity = await this.activities.get(id);
    if (!activity || activity.tenantId !== tenantId) throw new NotFoundException('Work item not found');
    if (!['task', 'follow_up', 'reminder'].includes(activity.type)) {
      throw new ForbiddenException('Only personal tasks can be managed from My Work.');
    }
    const allowed = activity.createdBy === actorId || (allowAssignee && activity.assigneeId === actorId);
    if (!allowed) throw new ForbiddenException(`Only the task creator can ${operation} this item.`);
    return activity;
  }

  private addDrawing(put: (item: WorkItem) => void, d: Drawing, actor: string): void {
    const assigned = d.ownerId === actor, created = d.createdBy === actor;
    if (!assigned && !created) return;
    const status: WorkItemStatus = ['closed', 'superseded'].includes(d.status) ? 'done'
      : ['rejected', 'revision_required'].includes(d.status) ? 'blocked'
        : ['submitted', 'under_review'].includes(d.status) ? 'waiting' : 'todo';
    put({ id: `engineering-drawing:${d.id}`, source: 'engineering-drawing', sourceId: d.id, module: 'Engineering', kind: 'Drawing', title: `${d.code} — ${d.title}`, detail: `Revision ${d.revision}`, href: `/engineering/drawings?projectId=${d.projectId}&record=${d.id}`, projectId: d.projectId, projectName: d.projectName, status, sourceStatus: d.status, priority: status === 'blocked' ? 'high' : 'normal', dueAt: null, createdAt: d.createdAt, updatedAt: d.updatedAt, scopes: scopes(assigned, created), isFollowUp: false, actions: [], origin: origin(d.createdBy, actor) });
  }

  private addRfi(put: (item: WorkItem) => void, r: Rfi, actor: string): void {
    const assigned = r.assignedTo === actor || r.ownerId === actor, created = r.createdBy === actor;
    if (!assigned && !created) return;
    const status: WorkItemStatus = r.status === 'closed' ? 'done' : r.status === 'answered' ? 'waiting' : 'todo';
    put({ id: `engineering-rfi:${r.id}`, source: 'engineering-rfi', sourceId: r.id, module: 'Engineering', kind: 'RFI', title: `${r.code} — ${r.title}`, detail: r.question, href: `/engineering/rfis?projectId=${r.projectId}&record=${r.id}`, projectId: r.projectId, projectName: r.projectName, status, sourceStatus: r.status, priority: 'normal', dueAt: null, createdAt: r.createdAt, updatedAt: r.updatedAt, scopes: scopes(assigned, created), isFollowUp: false, actions: [], origin: origin(r.createdBy, actor) });
  }

  private addTq(put: (item: WorkItem) => void, t: TechnicalQuery, actor: string): void {
    const assigned = t.assignedTo === actor, created = t.createdBy === actor;
    if (!assigned && !created) return;
    const status: WorkItemStatus = t.status === 'closed' ? 'done' : t.status === 'responded' ? 'waiting' : 'todo';
    put({ id: `engineering-tq:${t.id}`, source: 'engineering-tq', sourceId: t.id, module: 'Engineering', kind: 'Technical query', title: `${t.code} — ${t.title}`, detail: t.query, href: `/engineering/technical-queries?projectId=${t.projectId}&record=${t.id}`, projectId: t.projectId, projectName: t.projectName, status, sourceStatus: t.status, priority: t.priority, dueAt: null, createdAt: t.createdAt, updatedAt: t.updatedAt, scopes: scopes(assigned, created), isFollowUp: false, actions: [], origin: origin(t.createdBy, actor) });
  }

  private addNcr(put: (item: WorkItem) => void, n: Ncr, actor: string): void {
    const assigned = n.assignedTo === actor, created = n.raisedBy === actor;
    if (!assigned && !created) return;
    const status: WorkItemStatus = n.status === 'closed' ? 'done' : n.status === 'corrected' ? 'waiting' : n.status === 'action_planned' ? 'in_progress' : 'todo';
    put({ id: `quality-ncr:${n.id}`, source: 'quality-ncr', sourceId: n.id, module: 'Quality', kind: 'NCR', title: `${n.ncrNumber} — ${n.description}`, detail: n.correctiveAction, href: `/quality/control?focus=ncr&record=${n.id}`, projectId: n.projectId, projectName: n.projectName, status, sourceStatus: n.status, priority: derivedPriority(null, n.severity), dueAt: null, createdAt: n.createdAt, updatedAt: n.updatedAt, scopes: scopes(assigned, created), isFollowUp: false, actions: [], origin: origin(n.raisedBy, actor) });
  }

  private addSnag(put: (item: WorkItem) => void, s: Snag, actor: string): void {
    const assigned = s.assignedTo === actor, created = s.createdBy === actor;
    if (!assigned && !created) return;
    const status: WorkItemStatus = s.status === 'closed' ? 'done' : s.status === 'resolved' ? 'waiting' : 'todo';
    put({ id: `quality-snag:${s.id}`, source: 'quality-snag', sourceId: s.id, module: 'Quality', kind: 'Snag', title: s.description, detail: s.locationDetail, href: `/quality/control?focus=snag&record=${s.id}`, projectId: s.projectId, projectName: s.projectName, status, sourceStatus: s.status, priority: derivedPriority(null, s.severity), dueAt: null, createdAt: s.createdAt, updatedAt: s.updatedAt, scopes: scopes(assigned, created), isFollowUp: false, actions: [], origin: origin(s.createdBy, actor) });
  }

  private addCapa(put: (item: WorkItem) => void, c: CapaAction, actor: string): void {
    const assigned = c.assignedTo === actor, created = c.createdBy === actor;
    if (!assigned && !created) return;
    const status: WorkItemStatus = c.status === 'completed' ? 'done' : c.status === 'in_progress' ? 'in_progress' : 'todo';
    put({ id: `hse-capa:${c.id}`, source: 'hse-capa', sourceId: c.id, module: 'HSE', kind: 'Corrective action', title: c.actionRequired, detail: `${c.sourceType} corrective action`, href: `/hse/control?focus=capa&record=${c.id}`, projectId: c.projectId, projectName: c.projectName, status, sourceStatus: c.status, priority: derivedPriority(c.dueDate), dueAt: c.dueDate, createdAt: c.createdAt, updatedAt: c.updatedAt, scopes: scopes(assigned, created), isFollowUp: false, actions: [], origin: origin(c.createdBy, actor) });
  }

  private addPr(put: (item: WorkItem) => void, p: PurchaseRequest, actor: string): void {
    const assigned = p.ownerId === actor, created = p.createdBy === actor;
    if (!assigned && !created) return;
    const status: WorkItemStatus = p.status === 'approved' ? 'done' : p.status === 'rejected' ? 'cancelled' : p.status === 'submitted' ? 'waiting' : 'todo';
    put({ id: `procurement-pr:${p.id}`, source: 'procurement-pr', sourceId: p.id, module: 'Procurement', kind: 'Purchase request', title: p.title, detail: p.reference, href: `/procurement/purchase-requests?record=${p.id}`, projectId: p.projectId, projectName: p.projectName, status, sourceStatus: p.status, priority: 'normal', dueAt: null, createdAt: p.createdAt, updatedAt: p.createdAt, scopes: scopes(assigned, created), isFollowUp: false, actions: [], origin: origin(p.createdBy, actor) });
  }

  private addRfq(put: (item: WorkItem) => void, r: Rfq, actor: string): void {
    const assigned = r.ownerId === actor, created = r.createdBy === actor;
    if (!assigned && !created) return;
    const status: WorkItemStatus = ['awarded', 'closed'].includes(r.status) ? 'done' : r.status === 'sent' ? 'waiting' : 'todo';
    put({ id: `procurement-rfq:${r.id}`, source: 'procurement-rfq', sourceId: r.id, module: 'Procurement', kind: 'RFQ', title: r.title, detail: r.reference, href: `/procurement/rfqs?record=${r.id}`, projectId: null, projectName: null, status, sourceStatus: r.status, priority: derivedPriority(r.dueDate), dueAt: r.dueDate, createdAt: r.createdAt, updatedAt: r.createdAt, scopes: scopes(assigned, created), isFollowUp: false, actions: [], origin: origin(r.createdBy, actor) });
  }

  private addPo(put: (item: WorkItem) => void, p: PurchaseOrder, actor: string): void {
    const assigned = p.ownerId === actor, created = p.createdBy === actor;
    if (!assigned && !created) return;
    const status: WorkItemStatus = p.status === 'closed' ? 'done' : ['pending_approval', 'received'].includes(p.status) ? 'waiting' : ['approved', 'issued'].includes(p.status) ? 'in_progress' : 'todo';
    put({ id: `procurement-po:${p.id}`, source: 'procurement-po', sourceId: p.id, module: 'Procurement', kind: 'Purchase order', title: p.title, detail: p.supplierName ?? p.reference, href: `/procurement/purchase-orders/${p.id}`, projectId: p.projectId, projectName: p.projectName, status, sourceStatus: p.status, priority: 'normal', dueAt: null, createdAt: p.createdAt, updatedAt: p.createdAt, scopes: scopes(assigned, created), isFollowUp: false, actions: [], origin: origin(p.createdBy, actor) });
  }
}

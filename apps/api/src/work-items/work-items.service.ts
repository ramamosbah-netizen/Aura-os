import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ActivityService, type Activity, type TaskRecurrence } from '@aura/crm';
import { AccessService, AuthService, NotificationService } from '@aura/core';
import { EngineeringService, type Drawing, type Rfi, type TechnicalQuery } from '@aura/engineering';
import { HrService, type Employee } from '@aura/hr';
import { HseService, type CapaAction } from '@aura/hse';
import { PurchaseOrderService, PurchaseRequestService, RfqService, type PurchaseOrder, type PurchaseRequest, type Rfq } from '@aura/procurement';
import { QualityService, type Ncr, type Snag } from '@aura/quality';
import {
  ProjectRiskService,
  ProjectIssueService,
  ProjectResponsibilityService,
  ProjectService,
  ResourceBookingService,
  type ProjectRisk,
  type ProjectIssue,
  type ProjectResponsibility,
  type ResourceAssignmentView,
} from '@aura/projects';

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

/**
 * How far ahead a personal work list looks at resource allocations.
 *
 * A held booking can sit two years out; a to-do list that showed it would bury this week's work
 * under a plan nobody can act on yet. Six weeks is the look-ahead horizon planning already works
 * in, and the full commitment record stays where it is made — the project's planning desk — so
 * nothing is hidden, only deferred. Allocations past the horizon are REPORTED in coverage rather
 * than silently dropped.
 */
const ALLOCATION_LOOK_AHEAD_DAYS = 42;

const addDays = (day: string, days: number): string =>
  new Date(new Date(`${day}T00:00:00.000Z`).getTime() + days * 86_400_000).toISOString().slice(0, 10);

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
    private readonly projectRisks: ProjectRiskService,
    private readonly projectIssues: ProjectIssueService,
    private readonly projectResponsibilities: ProjectResponsibilityService,
    private readonly resourceBookings: ResourceBookingService,
    private readonly hr: HrService,
    private readonly projects: ProjectService,
    private readonly access: AccessService,
    private readonly auth: AuthService,
    private readonly notifications: NotificationService,
  ) {}

  async list(tenantId: string, actorId: string, companyId: string | null = null): Promise<WorkItemsPayload> {
    const [assignedActivities, createdActivities, drawings, rfis, tqs, ncrs, snags, capas, prs, rfqs, pos, projectRisks, projectIssues, projectResponsibilities] = await Promise.all([
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
      // §21. Read openOnly: a closed register is history, not work, and My Work is a to-do
      // list. The limit matters here in a way it does not on a project page — this is every
      // register in the tenant.
      this.projectRisks.list({ openOnly: true, limit: 1000 }),
      this.projectIssues.list({ openOnly: true, limit: 1000 }),
      this.projectResponsibilities.list({ tenantId, assigneeId: actorId, openOnly: true, limit: 1000 }),
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
    for (const risk of projectRisks) this.addProjectRisk(put, risk, actorId);
    for (const issue of projectIssues) this.addProjectIssue(put, issue, actorId);
    const responsibilityProjects = new Map<string, string>();
    await Promise.all([...new Set(projectResponsibilities.map((value) => value.projectId))].map(async (projectId) => {
      const project = await this.projects.get(projectId);
      if (project) responsibilityProjects.set(projectId, project.title);
    }));
    for (const responsibility of projectResponsibilities) this.addProjectResponsibility(put, responsibility, actorId, responsibilityProjects.get(responsibility.projectId) ?? null);

    const allocations = await this.resourceAllocations(tenantId, actorId);
    for (const allocation of allocations.items) put(allocation);

    // Counted BEFORE the shared access filter below, because an allocation dropped there is not
    // absent — it is a commitment on this person that they cannot see, and saying nothing would
    // leave them with a work list that quietly disagrees with the plan.
    const unreachableAllocations = allocations.items
      .filter((item) => !this.canUse(tenantId, companyId, actorId, item.projectId)).length;

    return {
      generatedAt: new Date().toISOString(),
      items: [...items.values()]
        .filter((item) => this.canUse(tenantId, companyId, actorId, item.projectId))
        .filter((item) => item.status !== 'cancelled')
        .sort((a, b) => (a.dueAt ?? '9999').localeCompare(b.dueAt ?? '9999') || b.updatedAt.localeCompare(a.updatedAt)),
      coverage: {
        connected: ['Activities', 'Engineering', 'Quality', 'HSE', 'Procurement', 'Projects', ...(allocations.employee ? ['Planning'] : [])],
        notConnected: [
          ...(allocations.employee ? [] : [{
            module: 'Planning',
            reason: 'Your account is not linked to an employee record, so resource allocations made against a person cannot be attributed to you. An administrator makes that link in HR.',
          }]),
          ...(unreachableAllocations > 0 ? [{
            module: 'Planning',
            reason: `${unreachableAllocations} resource allocation(s) are held against projects your account cannot open. Ask the project manager for access.`,
          }] : []),
          ...(allocations.beyondHorizon > 0 ? [{
            module: 'Planning',
            reason: `${allocations.beyondHorizon} resource allocation(s) start more than ${ALLOCATION_LOOK_AHEAD_DAYS} days out and are shown on the project planning desk, not here.`,
          }] : []),
          { module: 'Site Execution', reason: 'No user-assignment contract is exposed yet.' },
          { module: 'Commissioning', reason: 'No user-assignment contract is exposed yet.' },
          { module: 'Finance', reason: 'Personal approvals remain in My Approvals until assignee data is available.' },
        ],
      },
    };
  }

  /**
   * The resource commitments held against the PERSON this account is, if it is anybody.
   *
   * The account to employee link (HR, migration 0317) is the whole hinge. Without it a planner's
   * commitment names an employee id that no login claims, and the work reaches nobody; with it,
   * "4 electricians on Tuesday" becomes an item on the right person's list. The link is
   * administered, never inferred from a name or an email — see modules/hr/src/domain/
   * employee-account-link.ts for why a probable match is worse here than no match.
   *
   * An allocation is NOT converted into a responsibility or a task. It stays a booking, read
   * through at display time, so releasing it on the planning desk removes it from this list and
   * no second copy can disagree with the first.
   */
  private async resourceAllocations(
    tenantId: string,
    actorId: string,
  ): Promise<{ employee: Employee | null; items: WorkItem[]; beyondHorizon: number }> {
    // Not wrapped in a catch: every other source here is free to fail loudly, and a swallowed
    // error would report "your account is not linked" — a statement about administration — when
    // the truth was that the read did not happen.
    const employee = await this.hr.findEmployeeByAccount(tenantId, actorId);
    if (!employee) return { employee: null, items: [], beyondHorizon: 0 };

    const today = new Date().toISOString().slice(0, 10);
    const horizon = addDays(today, ALLOCATION_LOOK_AHEAD_DAYS);
    // Read wide, list narrow: what lies past the horizon is counted and reported in coverage,
    // never silently absent.
    const everything = await this.resourceBookings.listAssignments(
      tenantId,
      { resourceType: 'employee', canonicalResourceId: employee.id },
      { from: today, to: addDays(today, 3650) },
    );
    const within = everything.filter((view) => view.booking.from <= horizon);

    const projectNames = new Map<string, string>();
    await Promise.all([...new Set(within.map((view) => view.booking.projectId))].map(async (projectId) => {
      const project = await this.projects.get(projectId);
      if (project) projectNames.set(projectId, project.title);
    }));

    return {
      employee,
      items: within.map((view) => this.allocationItem(view, actorId, projectNames.get(view.booking.projectId) ?? null, today)),
      beyondHorizon: everything.length - within.length,
    };
  }

  private allocationItem(view: ResourceAssignmentView, actorId: string, projectName: string | null, today: string): WorkItem {
    const { booking, activityName } = view;
    const running = booking.from <= today && booking.to >= today;
    return {
      id: `resource-allocation:${booking.id}`,
      source: 'resource-allocation',
      sourceId: booking.id,
      module: 'Planning',
      kind: 'resource allocation',
      // Null rather than a remembered name: the activity is read through, so a booking whose task
      // has been removed says so instead of showing what it used to be called.
      title: activityName ? `Allocated to ${activityName}` : 'Allocated to project work',
      detail: `${booking.quantity} ${booking.unit} held · ${booking.from} → ${booking.to}`,
      href: `/projects/schedule?projectId=${booking.projectId}`,
      projectId: booking.projectId,
      projectName,
      status: running ? 'in_progress' : 'todo',
      sourceStatus: booking.status,
      priority: derivedPriority(booking.from),
      // The date the person is needed, which is what a personal list sorts and warns on.
      dueAt: booking.from,
      createdAt: booking.committedAt,
      updatedAt: booking.committedAt,
      scopes: ['assigned'],
      isFollowUp: false,
      // No quick actions, deliberately. A booking is the PROJECT's commitment to capacity, not a
      // task the allocated person owns: completing or reopening it here would let one person's
      // click move a number the planner is accountable for. Releasing it stays on the planning
      // desk, where it costs a reason.
      actions: [],
      origin: origin(booking.committedBy, actorId),
      editable: false,
      deletable: false,
      reschedulable: false,
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

  async act(tenantId: string, actorId: string, source: string, id: string, action: WorkItemAction, companyId: string | null = null): Promise<WorkItem> {
    if (source === 'project-responsibility') {
      const existing = await this.projectResponsibilities.get(id);
      if (!existing || existing.tenantId !== tenantId) throw new NotFoundException('Work item not found');
      this.assertCanUse(tenantId, companyId, actorId, existing.projectId);
      if (action === 'reopen') throw new ForbiddenException('Completed responsibilities are reopened by the project manager at the source.');
      const updated = action === 'start'
        ? await this.projectResponsibilities.start(id, existing.projectId, actorId)
        : await this.projectResponsibilities.complete(id, existing.projectId, actorId);
      const project = await this.projects.get(updated.projectId);
      return this.responsibilityItem(updated, actorId, project?.title ?? null);
    }
    if (source !== 'crm-activity') throw new ForbiddenException('This source does not expose a safe quick action. Open the source record instead.');
    const activity = await this.activities.get(id);
    if (!activity || activity.tenantId !== tenantId) throw new NotFoundException('Work item not found');
    if (activity.assigneeId !== actorId) throw new ForbiddenException('Only the assigned user can update this work item here.');
    this.assertCanUse(tenantId, companyId, actorId, activity.relatedType === 'project' ? activity.relatedId : null);
    const updated = action === 'start' ? await this.activities.start(id, actorId)
      : action === 'complete' ? await this.activities.complete(id, undefined, undefined, actorId)
        : await this.activities.reopen(id, actorId);
    if (action === 'complete') await this.createNextOccurrence(activity);
    const payload = await this.list(tenantId, actorId, companyId);
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

  /**
   * §21 risks and issues — the fourteenth and fifteenth sources.
   *
   * BOTH SCOPES ARE NOW COMPUTABLE (AURA-PM-001). A risk carries `ownerId` — the accountable user's
   * stable id — beside the free-text `owner` name, so "risks assigned to me" is answerable the same
   * way every other source answers it: id equality, never a name match. `owner` (the name) is still
   * matched against nothing; a typed name resembling an actor id must not conjure an assignment.
   */
  private addProjectRisk(put: (item: WorkItem) => void, r: ProjectRisk, actor: string): void {
    const assigned = r.ownerId === actor;
    const created = r.createdBy === actor;
    if (!assigned && !created) return;
    // ACCEPTED carries no outstanding action — the decision was to carry the exposure — so it
    // reads as done on a to-do list even though the risk is still live on the register. The two
    // surfaces answer different questions and are allowed to differ.
    const status: WorkItemStatus = r.status === 'MITIGATING' ? 'in_progress'
      : r.status === 'OPEN' ? 'todo' : 'done';
    const priority: WorkItemPriority = r.severity === 'CRITICAL' ? 'critical'
      : r.severity === 'HIGH' ? 'high' : derivedPriority(r.targetDate);
    put({
      id: `project-risk:${r.id}`, source: 'project-risk', sourceId: r.id, module: 'Projects',
      kind: 'Risk', title: r.title, detail: r.mitigation,
      href: `/project/${r.projectId}/controls?tab=risks`,
      projectId: r.projectId, projectName: null, status, sourceStatus: r.status, priority,
      // The date the mitigation was promised for — the only date a risk has.
      dueAt: r.targetDate, createdAt: r.createdAt, updatedAt: r.updatedAt,
      scopes: scopes(assigned, created), isFollowUp: false, actions: [],
      origin: origin(r.createdBy, actor),
    });
  }

  private addProjectIssue(put: (item: WorkItem) => void, i: ProjectIssue, actor: string): void {
    const assigned = i.ownerId === actor;
    const created = i.createdBy === actor || i.raisedBy === actor;
    if (!assigned && !created) return;
    const status: WorkItemStatus = i.status === 'in_progress' ? 'in_progress'
      : i.status === 'open' ? 'todo' : 'done';
    const priority: WorkItemPriority = i.severity === 'critical' ? 'critical'
      : derivedPriority(i.dueDate, i.severity === 'major' ? 'major' : 'minor');
    put({
      id: `project-issue:${i.id}`, source: 'project-issue', sourceId: i.id, module: 'Projects',
      kind: 'Issue', title: i.title, detail: i.description,
      href: `/project/${i.projectId}/controls?tab=risks`,
      projectId: i.projectId, projectName: null, status, sourceStatus: i.status, priority,
      dueAt: i.dueDate, createdAt: i.createdAt, updatedAt: i.updatedAt,
      scopes: scopes(assigned, created), isFollowUp: false, actions: [],
      origin: origin(i.createdBy, actor),
    });
  }

  private canUse(tenantId: string, companyId: string | null, actorId: string, projectId: string | null): boolean {
    if (!this.auth.enabled) return true;
    return this.access.can(actorId, {
      permission: 'work-items.work-item.read',
      orgPath: [
        { level: 'tenant', id: tenantId },
        ...(companyId ? [{ level: 'company' as const, id: companyId }] : []),
      ],
      ...(projectId ? { resource: { type: 'project', id: projectId } } : {}),
    }).allowed;
  }

  private assertCanUse(tenantId: string, companyId: string | null, actorId: string, projectId: string | null): void {
    if (!this.canUse(tenantId, companyId, actorId, projectId)) {
      throw new ForbiddenException('Your functional role does not allow work-item actions in this scope.');
    }
  }

  private addProjectResponsibility(put: (item: WorkItem) => void, value: ProjectResponsibility, actor: string, projectName: string | null): void {
    put(this.responsibilityItem(value, actor, projectName));
  }

  private responsibilityItem(value: ProjectResponsibility, actor: string, projectName: string | null): WorkItem {
    const status: WorkItemStatus = value.status === 'completed' ? 'done'
      : value.status === 'in_progress' ? 'in_progress' : 'todo';
    return {
      id: `project-responsibility:${value.id}`,
      source: 'project-responsibility',
      sourceId: value.id,
      module: 'Projects',
      kind: value.workstream.replaceAll('_', ' '),
      title: value.title,
      detail: value.sourceReference
        ? `${value.sourceReference} Rev ${value.sourceRevision ?? '—'}${value.transmittalRef ? ` · ${value.transmittalRef}` : ''}`
        : value.description,
      href: value.sourceType === 'engineering.drawing' && value.sourceId
        ? `/project/${value.projectId}/drawings/${value.sourceId}`
        : `/project/${value.projectId}/team?responsibility=${value.id}`,
      projectId: value.projectId,
      projectName,
      status,
      sourceStatus: value.status,
      priority: derivedPriority(value.dueDate),
      dueAt: value.dueDate,
      createdAt: value.createdAt,
      updatedAt: value.updatedAt,
      scopes: scopes(value.assigneeId === actor, value.assignedBy === actor),
      isFollowUp: false,
      actions: value.assigneeId !== actor ? []
        : ['assigned', 'accepted'].includes(value.status) ? ['start']
          : value.status === 'in_progress' ? ['complete'] : [],
      origin: origin(value.assignedBy, actor),
    };
  }

  private addPo(put: (item: WorkItem) => void, p: PurchaseOrder, actor: string): void {
    const assigned = p.ownerId === actor, created = p.createdBy === actor;
    if (!assigned && !created) return;
    const status: WorkItemStatus = p.status === 'closed' ? 'done' : ['pending_approval', 'partially_received', 'received'].includes(p.status) ? 'waiting' : ['approved', 'issued'].includes(p.status) ? 'in_progress' : 'todo';
    put({ id: `procurement-po:${p.id}`, source: 'procurement-po', sourceId: p.id, module: 'Procurement', kind: 'Purchase order', title: p.title, detail: p.supplierName ?? p.reference, href: `/procurement/purchase-orders/${p.id}`, projectId: p.projectId, projectName: p.projectName, status, sourceStatus: p.status, priority: 'normal', dueAt: null, createdAt: p.createdAt, updatedAt: p.createdAt, scopes: scopes(assigned, created), isFollowUp: false, actions: [], origin: origin(p.createdBy, actor) });
  }
}

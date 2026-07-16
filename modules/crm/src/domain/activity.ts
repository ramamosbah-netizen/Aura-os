import { type Id, newId } from '@aura/shared';

// CRM domain — framework-free. An Activity is a logged interaction or a to-do (call, email,
// meeting, note, task) attached to something in the deal chain by type + id reference. Tasks
// carry a due date and completion state.

/**
 * G10 — the full §17 vocabulary. WhatsApp and site visits are how ELV deals actually move in
 * this market; recording them as generic "note" made the two most common touches invisible to
 * every engine that reads the stream (attention, health, source performance).
 */
export type ActivityType =
  | 'call' | 'email' | 'meeting' | 'note' | 'task'
  | 'follow_up' | 'whatsapp' | 'site_visit' | 'technical_discovery' | 'demo' | 'presentation' | 'reminder';

/** Every legal type, for validation at the API edge and for UI pickers. */
export const ACTIVITY_TYPES: readonly ActivityType[] = [
  'call', 'email', 'meeting', 'note', 'task',
  'follow_up', 'whatsapp', 'site_visit', 'technical_discovery', 'demo', 'presentation', 'reminder',
];

/**
 * G11 — `open` means PLANNED (the UI labels it so); `in_progress` is the §18 addition: a site
 * visit that has STARTED is a different fact from one on the calendar, and field work spans
 * hours. OVERDUE / TODAY / THIS_WEEK stay derived from `dueDate`, never persisted.
 */
export type ActivityStatus = 'open' | 'in_progress' | 'completed' | 'cancelled';

/** Statuses where the work is still LIVE — every "open work" read must use this, not `=== 'open'`,
 * or in-progress work silently vanishes from next-action projections and attention. */
export const ACTIVITY_OPEN_STATUSES: readonly ActivityStatus[] = ['open', 'in_progress'];
export const isLiveActivity = (status: string): boolean =>
  (ACTIVITY_OPEN_STATUSES as readonly string[]).includes(status);

/**
 * What an activity can be about (G1 — Universal Activity).
 *
 * Activity is ONE work system for the whole deal chain, not a CRM-only feature: work on a tender
 * clarification, a contract obligation or a project task is the same kind of work as a sales call,
 * and must land in the same inbox. Narrowing this back to the CRM entities would re-fragment the
 * one work system and make "My Work across the deal chain" unbuildable.
 *
 * The reference stays polymorphic (type + id + name snapshot, no join), so widening the chain
 * costs nothing downstream — `related_type` is unconstrained `text` in Postgres (0098), which is
 * why this widening needs no migration and is backward compatible by construction: every existing
 * row already carries one of the original five values.
 */
export type ActivityRelatedType =
  | 'account'
  | 'contact'
  | 'lead'
  | 'opportunity'
  | 'quotation'
  | 'tender'
  | 'contract'
  | 'project';

/** Every legal related-type, for validation at the API edge and for UI pickers. */
export const ACTIVITY_RELATED_TYPES: readonly ActivityRelatedType[] = [
  'account',
  'contact',
  'lead',
  'opportunity',
  'quotation',
  'tender',
  'contract',
  'project',
];

export interface Activity {
  id: Id;
  tenantId: Id;
  companyId: Id | null;
  type: ActivityType;
  subject: string;
  notes: string | null;
  /** What this activity is about — polymorphic reference (type + id), no join. */
  relatedType: ActivityRelatedType | null;
  relatedId: Id | null;
  /** Name snapshot of the related record (deal-chain convention: reference + snapshot). */
  relatedName: string | null;
  /** Tasks: when it is due and who owns it. */
  dueDate: string | null;
  status: ActivityStatus;
  /** G11 — when work actually began (set by startActivity; null while still planned). */
  startedAt: string | null;
  completedAt: string | null;
  /** What happened — captured when the activity is logged/completed (the outcome). */
  outcome: string | null;
  assigneeId: Id | null;
  createdAt: string;
  createdBy: Id | null;
}

export interface NewActivity {
  tenantId: Id;
  companyId?: Id | null;
  type: ActivityType;
  subject: string;
  notes?: string | null;
  relatedType?: ActivityRelatedType | null;
  relatedId?: Id | null;
  relatedName?: string | null;
  dueDate?: string | null;
  status?: ActivityStatus;
  outcome?: string | null;
  assigneeId?: Id | null;
  createdBy?: Id | null;
}

export function makeActivity(input: NewActivity): Activity {
  return {
    id: newId(),
    tenantId: input.tenantId,
    companyId: input.companyId ?? null,
    type: input.type,
    subject: input.subject.trim(),
    notes: input.notes?.trim() || null,
    relatedType: input.relatedType ?? null,
    relatedId: input.relatedId ?? null,
    relatedName: input.relatedName?.trim() || null,
    dueDate: input.dueDate ?? null,
    status: input.status ?? 'open',
    startedAt: null,
    completedAt: null,
    outcome: input.outcome?.trim() || null,
    assigneeId: input.assigneeId ?? null,
    createdAt: new Date().toISOString(),
    createdBy: input.createdBy ?? null,
  };
}

/** G11 — begin work on a planned activity (idempotent while already in progress). */
export function startActivity(a: Activity, at?: string): Activity {
  if (a.status === 'in_progress') return a;
  if (a.status !== 'open') throw new Error(`cannot start from status ${a.status}`);
  return { ...a, status: 'in_progress', startedAt: at ?? new Date().toISOString() };
}

/** Mark a task/activity complete (idempotent), optionally recording the outcome. */
export function completeActivity(a: Activity, at?: string, outcome?: string | null): Activity {
  const outcomePatch = outcome !== undefined && outcome !== null && outcome.trim() ? { outcome: outcome.trim() } : {};
  if (a.status === 'completed') return { ...a, ...outcomePatch };
  if (a.status === 'cancelled') throw new Error('cannot complete a cancelled activity');
  return { ...a, status: 'completed', completedAt: at ?? new Date().toISOString(), ...outcomePatch };
}

export function cancelActivity(a: Activity): Activity {
  if (a.status !== 'open' && a.status !== 'in_progress') throw new Error(`cannot cancel from status ${a.status}`);
  return { ...a, status: 'cancelled' };
}

/** Completed/cancelled back to open — plans change. Started time is history; it stays. */
export function reopenActivity(a: Activity): Activity {
  if (a.status === 'open') throw new Error('activity is already open');
  return { ...a, status: 'open', completedAt: null };
}

/** CRM activity events on the spine. */
export const CRM_ACTIVITY_EVENT = {
  created: 'crm.activity.created',
  completed: 'crm.activity.completed',
} as const;

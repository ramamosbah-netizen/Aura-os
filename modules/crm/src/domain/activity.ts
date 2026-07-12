import { type Id, newId } from '@aura/shared';

// CRM domain — framework-free. An Activity is a logged interaction or a to-do (call, email,
// meeting, note, task) attached to something in the deal chain (account / contact /
// opportunity) by type + id reference. Tasks carry a due date and completion state.

export type ActivityType = 'call' | 'email' | 'meeting' | 'note' | 'task';
export type ActivityStatus = 'open' | 'completed' | 'cancelled';
export type ActivityRelatedType = 'account' | 'contact' | 'opportunity' | 'lead' | 'quotation';

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
    completedAt: null,
    outcome: input.outcome?.trim() || null,
    assigneeId: input.assigneeId ?? null,
    createdAt: new Date().toISOString(),
    createdBy: input.createdBy ?? null,
  };
}

/** Mark a task/activity complete (idempotent), optionally recording the outcome. */
export function completeActivity(a: Activity, at?: string, outcome?: string | null): Activity {
  const outcomePatch = outcome !== undefined && outcome !== null && outcome.trim() ? { outcome: outcome.trim() } : {};
  if (a.status === 'completed') return { ...a, ...outcomePatch };
  return { ...a, status: 'completed', completedAt: at ?? new Date().toISOString(), ...outcomePatch };
}

export function cancelActivity(a: Activity): Activity {
  if (a.status !== 'open') throw new Error(`cannot cancel from status ${a.status}`);
  return { ...a, status: 'cancelled' };
}

/** Completed/cancelled back to open — plans change. */
export function reopenActivity(a: Activity): Activity {
  if (a.status === 'open') throw new Error('activity is already open');
  return { ...a, status: 'open', completedAt: null };
}

/** CRM activity events on the spine. */
export const CRM_ACTIVITY_EVENT = {
  created: 'crm.activity.created',
  completed: 'crm.activity.completed',
} as const;

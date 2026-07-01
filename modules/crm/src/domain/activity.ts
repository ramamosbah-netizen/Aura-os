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
  /** Tasks: when it is due and who owns it. */
  dueDate: string | null;
  status: ActivityStatus;
  completedAt: string | null;
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
  dueDate?: string | null;
  status?: ActivityStatus;
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
    dueDate: input.dueDate ?? null,
    status: input.status ?? 'open',
    completedAt: null,
    assigneeId: input.assigneeId ?? null,
    createdAt: new Date().toISOString(),
    createdBy: input.createdBy ?? null,
  };
}

/** Mark a task/activity complete (idempotent). */
export function completeActivity(a: Activity, at?: string): Activity {
  if (a.status === 'completed') return a;
  return { ...a, status: 'completed', completedAt: at ?? new Date().toISOString() };
}

/** CRM activity events on the spine. */
export const CRM_ACTIVITY_EVENT = {
  created: 'crm.activity.created',
  completed: 'crm.activity.completed',
} as const;

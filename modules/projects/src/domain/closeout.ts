import { type Id, newId } from '@aura/shared';

/**
 * Project Closeout — the end-of-lifecycle workflow (audit stage 19). One record per project:
 * a standard handover checklist that must be fully cleared before the project is finalized,
 * capturing the handover date and the resulting Defects-Liability-Period (DLP) end date.
 * Lifecycle: in_progress → completed (only once every checklist item is done).
 */
export type CloseoutStatus = 'in_progress' | 'completed';

export interface CloseoutItem {
  label: string;
  done: boolean;
}

export interface ProjectCloseout {
  id: Id;
  tenantId: Id;
  companyId: Id | null;
  projectId: Id;
  projectName: string | null;
  status: CloseoutStatus;
  items: CloseoutItem[];
  handoverDate: string | null; // YYYY-MM-DD
  dlpEndDate: string | null;   // YYYY-MM-DD (handover + DLP months)
  notes: string;
  createdBy: Id | null;
  createdAt: string;
  updatedAt: string;
}

export interface NewProjectCloseout {
  tenantId: Id;
  companyId?: Id | null;
  projectId: Id;
  projectName?: string | null;
  items?: string[]; // override the default checklist labels
  notes?: string;
  createdBy?: Id | null;
}

/** Standard UAE construction handover checklist. */
export const DEFAULT_CLOSEOUT_ITEMS = [
  'As-built drawings submitted',
  'O&M manuals handed over',
  'Testing & commissioning certificates issued',
  'All snags cleared',
  'Authority NOCs / approvals obtained',
  'Final account agreed',
  'Retention release processed',
  'Handover certificate signed',
];

export function makeProjectCloseout(input: NewProjectCloseout): ProjectCloseout {
  if (!input.projectId) throw new Error('projectId is required');
  const labels = input.items && input.items.length ? input.items : DEFAULT_CLOSEOUT_ITEMS;
  const now = new Date().toISOString();
  return {
    id: newId(),
    tenantId: input.tenantId,
    companyId: input.companyId ?? null,
    projectId: input.projectId,
    projectName: input.projectName ?? null,
    status: 'in_progress',
    items: labels.map((label) => ({ label: label.trim(), done: false })),
    handoverDate: null,
    dlpEndDate: null,
    notes: input.notes?.trim() || '',
    createdBy: input.createdBy ?? null,
    createdAt: now,
    updatedAt: now,
  };
}

/** Toggle a checklist item (by index) done/undone. Not allowed once completed. */
export function setCloseoutItem(c: ProjectCloseout, index: number, done: boolean): ProjectCloseout {
  if (c.status === 'completed') throw new Error('closeout is already completed');
  if (!Number.isInteger(index) || index < 0 || index >= c.items.length) throw new Error(`item index ${index} out of range`);
  const items = c.items.map((it, i) => (i === index ? { ...it, done } : it));
  return { ...c, items, updatedAt: new Date().toISOString() };
}

export function allCloseoutItemsDone(c: ProjectCloseout): boolean {
  return c.items.length > 0 && c.items.every((it) => it.done);
}

function addMonths(ymd: string, months: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const base = new Date(Date.UTC(y, m - 1 + months, d));
  return base.toISOString().slice(0, 10);
}

/** Finalize: requires every item done. Records handover date + computes the DLP end date. */
export function finalizeCloseout(c: ProjectCloseout, handoverDate: string, dlpMonths = 12): ProjectCloseout {
  if (c.status === 'completed') throw new Error('closeout is already completed');
  if (!allCloseoutItemsDone(c)) throw new Error('cannot finalize — some checklist items are not done');
  if (!handoverDate || !/^\d{4}-\d{2}-\d{2}$/.test(handoverDate)) throw new Error('handoverDate must be YYYY-MM-DD');
  if (!(dlpMonths >= 0)) throw new Error('dlpMonths must be zero or positive');
  return {
    ...c,
    status: 'completed',
    handoverDate,
    dlpEndDate: addMonths(handoverDate, dlpMonths),
    updatedAt: new Date().toISOString(),
  };
}

export const CLOSEOUT_EVENT = {
  started: 'projects.closeout.started',
  itemUpdated: 'projects.closeout.item_updated',
  completed: 'projects.closeout.completed',
} as const;

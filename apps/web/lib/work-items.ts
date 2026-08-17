export type WorkItemStatus = 'todo' | 'in_progress' | 'waiting' | 'blocked' | 'done' | 'cancelled';
export type WorkItemPriority = 'critical' | 'high' | 'medium' | 'low' | 'normal';
export type WorkItemScope = 'assigned' | 'created';
export type WorkItemAction = 'start' | 'complete' | 'reopen';
export type TaskRecurrence = 'none' | 'daily' | 'weekly' | 'monthly';
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

export interface WorkItemsPayload {
  generatedAt: string;
  items: WorkItem[];
  coverage: {
    connected: string[];
    notConnected: Array<{ module: string; reason: string }>;
  };
}

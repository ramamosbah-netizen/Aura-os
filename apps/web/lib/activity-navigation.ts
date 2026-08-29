/** Canonical links between contextual CRM timelines and the shared activity register. */
const RELATED_TYPES = new Set(['opportunity', 'account', 'contact', 'lead', 'quotation', 'tender', 'contract', 'project']);
export const PERSONAL_ACTIVITY_TYPES = ['task', 'follow_up', 'reminder'] as const;

export function activityRegisterHref(relatedType: string, relatedId: string): string {
  return `/crm/activities?relatedType=${encodeURIComponent(relatedType)}&record=${encodeURIComponent(relatedId)}`;
}

/** Personal CRM work is executed from My Work, while the activity remains the source record. */
export function myWorkActivityHref(activityId: string): string {
  return `/my-work/tasks?task=${encodeURIComponent(activityId)}`;
}

export function isPersonalExecutableActivity(type: string): boolean {
  return (PERSONAL_ACTIVITY_TYPES as readonly string[]).includes(type);
}

/** Preserve the legacy `record=<activityId>` deep link while supporting 360 record context. */
export function parseActivityContext(relatedType?: string, record?: string): {
  relatedType: string;
  relatedId: string;
  activityId: string;
} {
  const scope = relatedType && RELATED_TYPES.has(relatedType) ? relatedType : '';
  return {
    relatedType: scope,
    relatedId: scope ? record ?? '' : '',
    activityId: scope ? '' : record ?? '',
  };
}

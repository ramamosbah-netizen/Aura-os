import type { CSSProperties } from 'react';
import { fetchJson } from '@/lib/api';
import { parseActivityContext } from '@/lib/activity-navigation';
import { parsePageParams } from '@aura/shared';
import DataStateNotice, { DataDegradedNotice } from '../../../components/ui/data-state';
import ActivitiesClient from '../../../components/activities-client';

export const dynamic = 'force-dynamic';

interface Activity {
  id: string;
  type: string;
  subject: string;
  notes: string | null;
  relatedType: string | null;
  relatedId: string | null;
  relatedName: string | null;
  dueDate: string | null;
  status: string;
  completedAt: string | null;
  outcome: string | null;
  direction: 'inbound' | 'outbound' | null;
  counterparty: string | null;
  assigneeId: string | null;
  createdAt: string;
}
interface Account { id: string; name: string; }
interface Contact { id: string; name: string; accountName: string | null; }
interface Opportunity { id: string; title: string; }
interface ActivityPage { items: Activity[]; total: number; limit: number; offset: number; hasMore: boolean; }
interface ActivitySummary { total: number; open: number; overdue: number; dueToday: number; dueThisWeek: number; completed30: number; unassigned: number; }

const RELATED_LABEL: Record<string, string> = {
  opportunity: 'Opportunity', account: 'Account', contact: 'Contact', lead: 'Lead', quotation: 'Quotation',
  tender: 'Tender', contract: 'Contract', project: 'Project',
};

export default async function CrmActivitiesPage({ searchParams }: { searchParams: Promise<{ relatedType?: string; record?: string; search?: string; type?: string; status?: string; limit?: string; offset?: string }> }) {
  const params = await searchParams;
  const { relatedType, record } = params;
  const scope = relatedType && RELATED_LABEL[relatedType] ? relatedType : '';
  // `record` is a related CRM record when a type scope is present. Without a scope it
  // remains the legacy activity-focus parameter used by My Day notifications.
  const context = parseActivityContext(scope, record);
  const relatedId = context.relatedId;
  const activityId = context.activityId;
  const query = new URLSearchParams();
  if (scope && relatedId) { query.set('relatedType', scope); query.set('relatedId', relatedId); }
  for (const key of ['search', 'type', 'status'] as const) {
    const value = params[key];
    if (value) query.set(key, value);
  }
  const pageParams = parsePageParams(params.limit, params.offset);
  const limit = String(pageParams.limit);
  const offset = String(pageParams.offset);
  query.set('limit', limit);
  query.set('offset', offset);
  const activityQuery = `?${query.toString()}`;
  const summaryQuery = new URLSearchParams(query);
  summaryQuery.delete('limit');
  summaryQuery.delete('offset');
  const navigationQuery = new URLSearchParams();
  if (scope && relatedId) { navigationQuery.set('relatedType', scope); navigationQuery.set('record', relatedId); }
  for (const key of ['search', 'type', 'status'] as const) {
    const value = params[key];
    if (value) navigationQuery.set(key, value);
  }
  navigationQuery.set('limit', limit);
  const pageHref = (nextOffset: number): string => {
    const params = new URLSearchParams(navigationQuery);
    params.set('offset', String(Math.max(0, nextOffset)));
    return `/crm/activities?${params.toString()}`;
  };
  const [activitiesResult, summaryResult, accountsResult, contactsResult, opportunitiesResult] = await Promise.all([
    fetchJson<ActivityPage>(`/api/crm/activities/paged${activityQuery}`),
    fetchJson<ActivitySummary>(`/api/crm/activities/summary?${summaryQuery.toString()}`),
    fetchJson<Account[]>('/api/crm/accounts'),
    fetchJson<Contact[]>('/api/crm/contacts'),
    fetchJson<Opportunity[]>('/api/crm/opportunities'),
  ]);

  if (!activitiesResult.ok) {
    return (
      <div style={st.page}>
        <h1 style={st.h1}>{scope ? `${RELATED_LABEL[scope]} Activity Timeline` : 'Sales · All Activity Register'}</h1>
        <DataStateNotice error={activitiesResult.error} subject={scope ? `${RELATED_LABEL[scope].toLowerCase()} activity` : 'activities'} />
      </div>
    );
  }

  const failedLookups = [
    !summaryResult.ok ? 'activity summary' : null,
    !accountsResult.ok ? 'account selector' : null,
    !contactsResult.ok ? 'contact selector' : null,
    !opportunitiesResult.ok ? 'opportunity selector' : null,
  ].filter((value): value is string => Boolean(value));

  return (
    <div style={st.page}>
      <h1 style={st.h1}>{scope ? `${RELATED_LABEL[scope]} Activity Timeline` : 'Sales · All Activity Register'}</h1>
      <p style={st.sub}>
        {scope
          ? `A contextual view of the shared CRM timeline — ${RELATED_LABEL[scope].toLowerCase()} history and open touchpoints. Personal execution stays in My Work.`
          : "The complete commercial history register — calls, meetings, notes and relationship touchpoints. Customer and deal pages show the same history in context; tasks, follow-ups and reminders are worked in My Work."}
      </p>
      {failedLookups.length > 0 ? (
        <DataDegradedNotice message={`${failedLookups.join(', ')} ${failedLookups.length === 1 ? 'is' : 'are'} temporarily unavailable. Existing activity records remain visible.`} />
      ) : null}
      <ActivitiesClient
        initialActivities={activitiesResult.data.items}
        initialPage={{ total: activitiesResult.data.total, limit: activitiesResult.data.limit, offset: activitiesResult.data.offset, hasMore: activitiesResult.data.hasMore }}
        initialSummary={summaryResult.ok ? summaryResult.data : null}
        exportUrl={`/api/crm/activities/export?${summaryQuery.toString()}`}
        previousHref={pageParams.offset > 0 ? pageHref(pageParams.offset - pageParams.limit) : null}
        nextHref={activitiesResult.data.hasMore ? pageHref(pageParams.offset + pageParams.limit) : null}
        initialSearch={params.search ?? ''}
        initialType={params.type ?? ''}
        initialStatus={params.status ?? ''}
        accounts={accountsResult.ok ? accountsResult.data : []}
        contacts={contactsResult.ok ? contactsResult.data : []}
        opportunities={opportunitiesResult.ok ? opportunitiesResult.data : []}
        initialRelatedType={scope}
        initialRelatedId={relatedId}
        initialFocusedId={activityId}
      />
    </div>
  );
}

const st = {
  page: { maxWidth: 1200, margin: '0 auto', padding: '28px 28px 64px' } as CSSProperties,
  h1: { fontSize: 28, margin: '0 0 6px', letterSpacing: -0.5 } as CSSProperties,
  sub: { color: 'var(--muted)', margin: '0 0 22px', maxWidth: 740, lineHeight: 1.5 } as CSSProperties,
};

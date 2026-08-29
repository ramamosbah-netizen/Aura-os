import type { CSSProperties } from 'react';
import { fetchJson } from '@/lib/api';
import { parseActivityContext } from '@/lib/activity-navigation';
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

const RELATED_LABEL: Record<string, string> = {
  opportunity: 'Opportunity', account: 'Account', contact: 'Contact', lead: 'Lead', quotation: 'Quotation',
  tender: 'Tender', contract: 'Contract', project: 'Project',
};

export default async function CrmActivitiesPage({ searchParams }: { searchParams: Promise<{ relatedType?: string; record?: string }> }) {
  const { relatedType, record } = await searchParams;
  const scope = relatedType && RELATED_LABEL[relatedType] ? relatedType : '';
  // `record` is a related CRM record when a type scope is present. Without a scope it
  // remains the legacy activity-focus parameter used by My Day notifications.
  const context = parseActivityContext(scope, record);
  const relatedId = context.relatedId;
  const activityId = context.activityId;
  const activityQuery = scope && relatedId
    ? `?relatedType=${encodeURIComponent(scope)}&relatedId=${encodeURIComponent(relatedId)}`
    : '';
  const [activitiesResult, accountsResult, contactsResult, opportunitiesResult] = await Promise.all([
    fetchJson<Activity[]>(`/api/crm/activities${activityQuery}`),
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
        initialActivities={activitiesResult.data}
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

import type { CSSProperties } from 'react';
import { getJson } from '@/lib/api';
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
  assigneeId: string | null;
  createdAt: string;
}
interface Account { id: string; name: string; }
interface Contact { id: string; name: string; accountName: string | null; }
interface Opportunity { id: string; title: string; }

const RELATED_LABEL: Record<string, string> = {
  opportunity: 'Opportunity', account: 'Account', contact: 'Contact', lead: 'Lead', quotation: 'Quotation',
};

export default async function CrmActivitiesPage({ searchParams }: { searchParams: Promise<{ relatedType?: string }> }) {
  const { relatedType } = await searchParams;
  const scope = relatedType && RELATED_LABEL[relatedType] ? relatedType : '';
  const [activities, accounts, contacts, opportunities] = await Promise.all([
    getJson<Activity[]>('/api/crm/activities'),
    getJson<Account[]>('/api/crm/accounts'),
    getJson<Contact[]>('/api/crm/contacts'),
    getJson<Opportunity[]>('/api/crm/opportunities'),
  ]);

  return (
    <div style={st.page}>
      <h1 style={st.h1}>{scope ? `${RELATED_LABEL[scope]} Activities` : 'CRM · Activities'}</h1>
      <p style={st.sub}>
        {scope
          ? `A saved view of the Activities work center — every open ${RELATED_LABEL[scope].toLowerCase()} touchpoint, worked here. Clear the view to see all activities.`
          : "Every interaction and to-do on the deal chain — calls, emails, meetings, notes and tasks — agenda-grouped by urgency and linked to the account, contact or deal they're about."}
      </p>
      <ActivitiesClient
        initialActivities={activities ?? []}
        accounts={accounts ?? []}
        contacts={contacts ?? []}
        opportunities={opportunities ?? []}
        initialRelatedType={scope}
      />
    </div>
  );
}

const st = {
  page: { maxWidth: 1200, margin: '0 auto', padding: '28px 28px 64px' } as CSSProperties,
  h1: { fontSize: 28, margin: '0 0 6px', letterSpacing: -0.5 } as CSSProperties,
  sub: { color: 'var(--muted)', margin: '0 0 22px', maxWidth: 740, lineHeight: 1.5 } as CSSProperties,
};

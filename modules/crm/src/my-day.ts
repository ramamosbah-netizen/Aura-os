// C4 — "My Day": the salesperson's one page.
//
// This is a VIEW, not a system. It stores nothing, decides nothing and creates nothing: every
// row it shows already exists as a fact somewhere else (an Activity, a Lead, an Opportunity),
// and the only thing this file adds is the answer to "which of those are MINE, and which come
// first today". Change a fact in its own module and this page changes with it — there is no
// second copy to drift.
//
// "Mine" is deliberately three different columns, because ownership means three different things
// in the three systems: an Activity is mine when I am the ASSIGNEE (the work is on my desk), a
// Lead is mine when it is ASSIGNED to me (qualification is my job), an Opportunity is mine when I
// OWN it (the deal is my number). Nothing here re-derives attention: leadAttention /
// opportunityAttention stay the single source of truth, so a lead can never be "at risk" on the
// Lead Center and healthy on My Day.
import {
  leadAttention,
  opportunityAttention,
  resolveNextAction,
  type Lead,
  type LeadAttentionSeverity,
  type Opportunity,
} from '@aura/shared';
import { isLiveActivity, type Activity } from './domain/activity';
import { lastActivityByRecord, nextOpenActivityByRecord } from './attention';

/** Activity types that are an appointment with a human — the day has a shape, not just a list. */
const MEETING_TYPES: readonly string[] = ['meeting', 'site_visit', 'demo', 'presentation'];

/** When work is due, relative to today. Derived from `dueDate` every read — never stored.
 * `LATER` (dated beyond the week) is a real bucket precisely so it never gets mistaken for
 * `UNDATED`: scheduled-for-next-month is not the same fact as never-scheduled, and only one of
 * the two belongs on a page about today. */
export type MyDayWhen = 'OVERDUE' | 'TODAY' | 'THIS_WEEK' | 'LATER' | 'UNDATED';

export interface MyDayTask {
  id: string;
  type: string;
  subject: string;
  when: MyDayWhen;
  dueDate: string | null;
  /** In-progress work is already on my desk — the UI shows it as started, not planned. */
  started: boolean;
  relatedType: string | null;
  relatedId: string | null;
  relatedName: string | null;
  href: string | null;
}

export interface MyDayLead {
  id: string;
  name: string;
  companyName: string | null;
  status: string;
  /** Straight from leadAttention — this file never re-decides what a gap is. */
  gaps: string[];
  severity: LeadAttentionSeverity | null;
  nextAction: string | null;
  nextActionDue: string | null;
  href: string;
}

export interface MyDayOpportunity {
  id: string;
  title: string;
  value: number;
  stage: string;
  closeDate: string | null;
  /** Straight from opportunityAttention. */
  gaps: string[];
  nextAction: string | null;
  nextActionDue: string | null;
  href: string;
}

export interface MyDay {
  /** Whose day this is. Every list below is filtered to this id — an empty page means an empty
   * desk, not an empty tenant. */
  userId: string;
  /** The day being answered for (YYYY-MM-DD), so the read is reproducible. */
  date: string;
  counts: {
    overdue: number;
    today: number;
    thisWeek: number;
    meetingsToday: number;
    leadsNeedingAttention: number;
    opportunitiesNeedingAttention: number;
  };
  /** Today's appointments, earliest first — the fixed points the rest of the day bends around. */
  meetings: MyDayTask[];
  /** Everything on my desk that is late or due today. */
  now: MyDayTask[];
  /** Dated within the next 7 days, plus my undated work (real work, just not scheduled). */
  next: MyDayTask[];
  /** My leads with an open discipline gap, worst first. */
  leads: MyDayLead[];
  /** My open deals with an open gap, biggest value first. */
  opportunities: MyDayOpportunity[];
}

export interface MyDayInput {
  userId: string;
  /** Tenant-wide lists; this function does the "mine" filtering so no caller can forget to. */
  activities: Activity[];
  leads: Lead[];
  opportunities: Opportunity[];
}

const SEVERITY_RANK: Record<LeadAttentionSeverity, number> = { LOW: 1, MEDIUM: 2, HIGH: 3 };

const RELATED_HREF: Record<string, string> = {
  lead: '/crm/leads',
  account: '/crm/accounts',
  contact: '/crm/contacts',
  opportunity: '/crm/opportunities',
  quotation: '/crm/quotations',
};

function hrefFor(relatedType: string | null, relatedId: string | null): string | null {
  if (!relatedType || !relatedId) return null;
  const base = RELATED_HREF[relatedType];
  return base ? `${base}/${relatedId}` : null;
}

function whenFor(dueDate: string | null, today: string, weekEnd: string): MyDayWhen {
  if (!dueDate) return 'UNDATED';
  const day = dueDate.slice(0, 10);
  if (day < today) return 'OVERDUE';
  if (day === today) return 'TODAY';
  return day <= weekEnd ? 'THIS_WEEK' : 'LATER';
}

function toTask(a: Activity, today: string, weekEnd: string): MyDayTask {
  return {
    id: a.id,
    type: a.type,
    subject: a.subject,
    when: whenFor(a.dueDate, today, weekEnd),
    dueDate: a.dueDate,
    started: a.status === 'in_progress',
    relatedType: a.relatedType,
    relatedId: a.relatedId,
    relatedName: a.relatedName,
    href: hrefFor(a.relatedType, a.relatedId),
  };
}

/** Late first, then today, then the week; undated last. Within a bucket, earliest due wins. */
const WHEN_RANK: Record<MyDayWhen, number> = { OVERDUE: 0, TODAY: 1, THIS_WEEK: 2, LATER: 3, UNDATED: 4 };
function byUrgency(a: MyDayTask, b: MyDayTask): number {
  const r = WHEN_RANK[a.when] - WHEN_RANK[b.when];
  return r !== 0 ? r : (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999');
}

/**
 * Compose one person's day out of facts that already exist. Pure: same inputs + same `now` ⇒ same
 * output, which is why the whole page is testable without a database.
 */
export function buildMyDay(input: MyDayInput, now: Date = new Date()): MyDay {
  const { userId } = input;
  const today = now.toISOString().slice(0, 10);
  const weekEnd = new Date(now.getTime() + 7 * 86400000).toISOString().slice(0, 10);

  // Attention facts come from the WHOLE activity stream, not just my slice: a colleague's call on
  // my lead still means the lead was touched. Only the work lists are filtered to me.
  const lastTouch = lastActivityByRecord(input.activities);
  const nextOpen = nextOpenActivityByRecord(input.activities);

  const mine = input.activities.filter((a) => a.assigneeId === userId && isLiveActivity(a.status));
  const tasks = mine.map((a) => toTask(a, today, weekEnd));

  const meetings = tasks
    .filter((t) => t.when === 'TODAY' && MEETING_TYPES.includes(t.type))
    .sort(byUrgency);
  const nowList = tasks.filter((t) => t.when === 'OVERDUE' || t.when === 'TODAY').sort(byUrgency);
  const nextList = tasks.filter((t) => t.when === 'THIS_WEEK' || t.when === 'UNDATED').sort(byUrgency);

  const leads: MyDayLead[] = [];
  for (const lead of input.leads) {
    if (lead.assignedTo !== userId) continue;
    const next = nextOpen.get(lead.id) ?? null;
    const attention = leadAttention(
      lead,
      {
        lastTouchIso: lastTouch.get(lead.id) ?? null,
        nextActivityDueIso: next?.dueIso ?? null,
        firstRespondedIso: lead.firstRespondedAt,
      },
      now,
    );
    if (!attention.needsAttention) continue;
    leads.push({
      id: lead.id,
      name: lead.name,
      companyName: lead.companyName,
      status: lead.status,
      gaps: attention.gaps,
      severity: attention.severity,
      nextAction: next?.subject ?? null,
      nextActionDue: next?.dueIso ?? null,
      href: `/crm/leads/${lead.id}`,
    });
  }
  leads.sort(
    (a, b) =>
      SEVERITY_RANK[b.severity ?? 'LOW'] - SEVERITY_RANK[a.severity ?? 'LOW'] ||
      a.name.localeCompare(b.name),
  );

  const opportunities: MyDayOpportunity[] = [];
  for (const opp of input.opportunities) {
    if (opp.ownerId !== userId) continue;
    const next = nextOpen.get(opp.id) ?? null;
    const facts = {
      nextActionSubject: next?.subject ?? null,
      nextActionDueIso: next?.dueIso ?? null,
      nextActionOwnerId: next?.assigneeId ?? null,
    };
    const attention = opportunityAttention(opp, facts, now);
    if (!attention.needsAttention) continue;
    const resolved = resolveNextAction(opp, facts);
    opportunities.push({
      id: opp.id,
      title: opp.title,
      value: opp.value,
      stage: opp.stage,
      closeDate: opp.closeDate,
      gaps: attention.gaps,
      nextAction: resolved.subject,
      nextActionDue: resolved.dueDate,
      href: `/crm/opportunities/${opp.id}`,
    });
  }
  opportunities.sort((a, b) => b.value - a.value);

  return {
    userId,
    date: today,
    counts: {
      overdue: tasks.filter((t) => t.when === 'OVERDUE').length,
      today: tasks.filter((t) => t.when === 'TODAY').length,
      thisWeek: tasks.filter((t) => t.when === 'THIS_WEEK').length,
      meetingsToday: meetings.length,
      leadsNeedingAttention: leads.length,
      opportunitiesNeedingAttention: opportunities.length,
    },
    meetings,
    now: nowList,
    next: nextList,
    leads,
    opportunities,
  };
}

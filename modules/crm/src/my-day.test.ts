import { describe, expect, it } from 'vitest';
import type { Lead, Opportunity } from '@aura/shared';
import { buildMyDay } from './my-day';
import type { Activity } from './domain/activity';

const NOW = new Date('2026-07-16T09:00:00Z');
const TODAY = '2026-07-16';
const day = (n: number): string => new Date(NOW.getTime() + n * 86400000).toISOString().slice(0, 10);
const ME = 'user-me';
const OTHER = 'user-other';

const activity = (over: Partial<Activity> = {}): Activity => ({
  id: 'act-1', tenantId: 't1', companyId: null, type: 'task', subject: 'Call back', notes: null,
  relatedType: 'opportunity', relatedId: 'opp-1', relatedName: 'Deal', dueDate: TODAY,
  status: 'open', startedAt: null, completedAt: null, outcome: null, assigneeId: ME,
  createdAt: '2026-07-15T00:00:00Z', createdBy: ME, ...over,
});

const lead = (over: Partial<Lead> = {}): Lead => ({
  id: 'lead-1', tenantId: 't1', companyId: null, name: 'Ali', companyName: 'Acme', email: null,
  phone: null, status: 'new', source: null, assignedTo: ME, assignedAt: '2026-07-15T08:00:00Z',
  acceptedAt: '2026-07-15T08:30:00Z', firstRespondedAt: '2026-07-15T09:00:00Z',
  slaFirstResponseHours: null, nextActivityDue: null, convertedOpportunityId: null,
  createdAt: '2026-07-15T08:00:00Z', ...(over as object),
} as Lead);

const opp = (over: Partial<Opportunity> = {}): Opportunity => ({
  id: 'opp-1', tenantId: 't1', companyId: null, accountId: 'acc-1', title: 'CCTV retrofit',
  value: 100_000, stage: 'proposal', closeDate: day(30), ownerId: ME, nextAction: null,
  nextActionDueDate: null, createdAt: '2026-07-01T00:00:00Z', ...(over as object),
} as Opportunity);

const empty = { activities: [], leads: [], opportunities: [] };

describe('buildMyDay — "mine" is three different columns', () => {
  it('takes activities by assignee, leads by assignedTo, opportunities by ownerId', () => {
    const d = buildMyDay(
      {
        userId: ME,
        activities: [activity({ id: 'a-mine' }), activity({ id: 'a-theirs', assigneeId: OTHER })],
        leads: [lead({ id: 'l-mine', status: 'new' }), lead({ id: 'l-theirs', assignedTo: OTHER })],
        opportunities: [opp({ id: 'o-mine' }), opp({ id: 'o-theirs', ownerId: OTHER })],
      },
      NOW,
    );
    expect(d.now.map((t) => t.id)).toEqual(['a-mine']);
    expect(d.leads.map((l) => l.id)).toEqual(['l-mine']);
    expect(d.opportunities.map((o) => o.id)).toEqual(['o-mine']);
  });

  it('an empty desk is an empty day — never the tenant\'s unassigned work', () => {
    const d = buildMyDay(
      {
        userId: ME,
        activities: [activity({ assigneeId: null })],
        leads: [lead({ assignedTo: null })],
        opportunities: [opp({ ownerId: null })],
      },
      NOW,
    );
    expect(d.now).toEqual([]);
    expect(d.leads).toEqual([]);
    expect(d.opportunities).toEqual([]);
    expect(d.counts).toMatchObject({ overdue: 0, today: 0, leadsNeedingAttention: 0 });
  });
});

describe('buildMyDay — the shape of the day', () => {
  it('buckets work by due date and sorts late-first, earliest-first', () => {
    const d = buildMyDay(
      {
        ...empty,
        userId: ME,
        activities: [
          activity({ id: 'undated', dueDate: null }),
          activity({ id: 'week', dueDate: day(3) }),
          activity({ id: 'today', dueDate: TODAY }),
          activity({ id: 'late-1', dueDate: day(-1) }),
          activity({ id: 'late-9', dueDate: day(-9) }),
          activity({ id: 'far', dueDate: day(40) }),
        ],
      },
      NOW,
    );
    expect(d.now.map((t) => t.id)).toEqual(['late-9', 'late-1', 'today']);
    expect(d.next.map((t) => t.id)).toEqual(['week', 'undated']);
    expect(d.counts).toMatchObject({ overdue: 2, today: 1, thisWeek: 1 });
    // Beyond the week is not "no day" — it is simply not today's problem.
    expect(d.next.find((t) => t.id === 'far')).toBeUndefined();
  });

  it('only today\'s appointments are meetings; a task due today is not one', () => {
    const d = buildMyDay(
      {
        ...empty,
        userId: ME,
        activities: [
          activity({ id: 'site', type: 'site_visit', dueDate: TODAY }),
          activity({ id: 'call', type: 'call', dueDate: TODAY }),
          activity({ id: 'demo-tomorrow', type: 'demo', dueDate: day(1) }),
        ],
      },
      NOW,
    );
    expect(d.meetings.map((t) => t.id)).toEqual(['site']);
    expect(d.counts.meetingsToday).toBe(1);
  });

  it('completed and cancelled work leaves the day; in_progress stays and reads as started', () => {
    const d = buildMyDay(
      {
        ...empty,
        userId: ME,
        activities: [
          activity({ id: 'done', status: 'completed', completedAt: '2026-07-16T08:00:00Z' }),
          activity({ id: 'dropped', status: 'cancelled' }),
          activity({ id: 'running', status: 'in_progress', startedAt: '2026-07-16T08:00:00Z' }),
        ],
      },
      NOW,
    );
    expect(d.now.map((t) => t.id)).toEqual(['running']);
    expect(d.now[0].started).toBe(true);
  });
});

describe('buildMyDay — attention is never re-decided here', () => {
  it('shows only leads with a gap, worst severity first', () => {
    const d = buildMyDay(
      {
        ...empty,
        userId: ME,
        // A healthy lead needs a scheduled follow-up; the gap-free one must not appear.
        activities: [
          activity({ id: 'f1', relatedType: 'lead', relatedId: 'healthy', dueDate: day(2) }),
          activity({ id: 'f2', relatedType: 'lead', relatedId: 'late', dueDate: day(-2) }),
        ],
        leads: [
          lead({ id: 'healthy' }),
          lead({ id: 'late' }),                      // FOLLOW_UP_OVERDUE ⇒ HIGH
          lead({ id: 'nonext', name: 'Zed' }),       // never touched, nothing scheduled ⇒ MEDIUM
        ],
      },
      NOW,
    );
    expect(d.leads.map((l) => l.id)).toEqual(['late', 'nonext']);
    expect(d.leads[0].severity).toBe('HIGH');
    expect(d.leads[0].gaps).toContain('FOLLOW_UP_OVERDUE');
    // Never touched + nothing scheduled: STALE (MEDIUM) outranks NO_NEXT_ACTIVITY (LOW), and the
    // severity is leadAttention's verdict — this page reports it, it does not vote on it.
    expect(d.leads[1].gaps).toEqual(expect.arrayContaining(['NO_NEXT_ACTIVITY', 'STALE']));
    expect(d.leads[1].severity).toBe('MEDIUM');
  });

  it('a colleague\'s touch on my lead still counts as a touch', () => {
    const d = buildMyDay(
      {
        ...empty,
        userId: ME,
        activities: [
          activity({ id: 'theirs', assigneeId: OTHER, relatedType: 'lead', relatedId: 'lead-1', dueDate: day(2) }),
        ],
        leads: [lead({ id: 'lead-1' })],
      },
      NOW,
    );
    // Their scheduled follow-up closes my lead's NO_NEXT_ACTIVITY gap — one work system, not two.
    expect(d.leads).toEqual([]);
    // ...but their work never lands on my desk.
    expect(d.now).toEqual([]);
  });

  it('shows open deals with a next-action gap, biggest first, and terminal deals never', () => {
    const d = buildMyDay(
      {
        ...empty,
        userId: ME,
        activities: [],
        opportunities: [
          opp({ id: 'small', value: 20_000 }),
          opp({ id: 'big', value: 900_000 }),
          opp({ id: 'won', stage: 'won', value: 5_000_000 }),
        ],
      },
      NOW,
    );
    expect(d.opportunities.map((o) => o.id)).toEqual(['big', 'small']);
    expect(d.opportunities[0].gaps).toContain('no-next-action');
    expect(d.counts.opportunitiesNeedingAttention).toBe(2);
  });

  it('the next open activity becomes the deal\'s next action', () => {
    const d = buildMyDay(
      {
        ...empty,
        userId: ME,
        activities: [
          activity({ id: 'later', subject: 'Site survey', relatedId: 'opp-1', dueDate: day(9) }),
          activity({ id: 'sooner', subject: 'Send revised BOQ', relatedId: 'opp-1', dueDate: day(2) }),
        ],
        opportunities: [opp({ id: 'opp-1' })],
      },
      NOW,
    );
    // Dated + open + earliest wins — and with a next action scheduled, the deal has no gap left.
    expect(d.opportunities).toEqual([]);
    // 'later' is due in 9 days: real work, correctly absent from a page about this week.
    expect(d.next.map((t) => t.id)).toEqual(['sooner']);
  });
});

describe('buildMyDay — determinism', () => {
  it('is pure: same facts + same now ⇒ same day', () => {
    const input = { userId: ME, activities: [activity()], leads: [lead()], opportunities: [opp()] };
    expect(buildMyDay(input, NOW)).toEqual(buildMyDay(input, NOW));
    expect(buildMyDay(input, NOW).date).toBe(TODAY);
  });
});

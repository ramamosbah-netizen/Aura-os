import { describe, expect, it } from 'vitest';
import { detectAutomation, type AutomationAccount, type AutomationActivity, type AutomationLead } from './automation';

const NOW = new Date('2026-07-16T12:00:00Z');
const hoursAgo = (h: number): string => new Date(NOW.getTime() - h * 3600_000).toISOString();
const daysAgo = (d: number): string => new Date(NOW.getTime() - d * 86400000).toISOString().slice(0, 10);

const lead = (over: Partial<AutomationLead> = {}): AutomationLead => ({
  id: 'l1', name: 'Ali Hassan', companyName: 'Emaar FM', email: null, phone: null,
  status: 'new', assignedTo: 'rep-a', assignedAt: hoursAgo(30), acceptedAt: hoursAgo(29),
  firstRespondedAt: null, slaFirstResponseHours: null, createdAt: hoursAgo(31), ...over,
});

const activity = (over: Partial<AutomationActivity> = {}): AutomationActivity => ({
  id: 'a1', subject: 'Call back', status: 'open', dueDate: daysAgo(1), assigneeId: 'rep-a',
  relatedId: 'l1', relatedType: 'lead', relatedName: 'Ali Hassan', completedAt: null,
  createdAt: hoursAgo(48), ...over,
});

const account = (over: Partial<AutomationAccount> = {}): AutomationAccount => ({
  id: 'acc-1', name: 'Emaar FM', email: null, phone: null, ownerId: 'rep-owner', ...over,
});

const base = { leads: [], activities: [], accounts: [] };
const kinds = (r: ReturnType<typeof detectAutomation>) => r.escalations.map((e) => e.kind);

describe('escalation is edge-triggered — it fires once, not forever', () => {
  it('escalates an SLA that breached inside the window', () => {
    // Default SLA is 24h; assigned 30h ago ⇒ breached 6h ago, inside a 24h window.
    const r = detectAutomation({ ...base, leads: [lead()] }, NOW);
    expect(kinds(r)).toContain('SLA_BREACHED');
  });

  it('does NOT re-escalate a breach older than the window — yesterday\'s alert was already sent', () => {
    // Assigned 100h ago: still breached (leadAttention agrees), but it broke 76h ago.
    const r = detectAutomation({ ...base, leads: [lead({ assignedAt: hoursAgo(100), createdAt: hoursAgo(101) })] }, NOW);
    expect(kinds(r)).not.toContain('SLA_BREACHED');
  });

  it('does not escalate before the SLA is actually breached', () => {
    const r = detectAutomation({ ...base, leads: [lead({ assignedAt: hoursAgo(10), acceptedAt: hoursAgo(9) })] }, NOW);
    expect(kinds(r)).toEqual([]);
  });

  it('honours a per-lead SLA over the default', () => {
    // 10h old with a 4h SLA ⇒ breached 6h ago; the 24h default would not have fired at all.
    const r = detectAutomation(
      { ...base, leads: [lead({ assignedAt: hoursAgo(10), acceptedAt: hoursAgo(9), slaFirstResponseHours: 4 })] },
      NOW,
    );
    expect(kinds(r)).toContain('SLA_BREACHED');
  });

  it('a wider window catches an older breach — the caller declares its own cadence', () => {
    const l = lead({ assignedAt: hoursAgo(100), createdAt: hoursAgo(101) });
    expect(kinds(detectAutomation({ ...base, leads: [l], windowHours: 24 }, NOW))).not.toContain('SLA_BREACHED');
    expect(kinds(detectAutomation({ ...base, leads: [l], windowHours: 168 }, NOW))).toContain('SLA_BREACHED');
  });

  it('a responded lead never escalates, however late the response was', () => {
    const r = detectAutomation({ ...base, leads: [lead({ firstRespondedAt: hoursAgo(1) })] }, NOW);
    expect(kinds(r)).not.toContain('SLA_BREACHED');
  });
});

describe('unaccepted assignment — routing is not ownership', () => {
  it('escalates when nobody picked it up within the acceptance window', () => {
    // acceptanceHours is 8; assigned 10h ago, never accepted ⇒ crossed 2h ago.
    const r = detectAutomation(
      { ...base, leads: [lead({ assignedAt: hoursAgo(10), acceptedAt: null })] },
      NOW,
    );
    expect(kinds(r)).toContain('ASSIGNMENT_NOT_ACCEPTED');
  });

  it('names the assignee who is on the hook', () => {
    const r = detectAutomation(
      { ...base, leads: [lead({ assignedAt: hoursAgo(10), acceptedAt: null, assignedTo: 'rep-b' })] },
      NOW,
    );
    expect(r.escalations.find((e) => e.kind === 'ASSIGNMENT_NOT_ACCEPTED')?.ownerId).toBe('rep-b');
  });
});

describe('overdue follow-ups — the work, not the record', () => {
  it('escalates a task the day it goes overdue', () => {
    const r = detectAutomation({ ...base, activities: [activity({ dueDate: daysAgo(1) })] }, NOW);
    expect(kinds(r)).toContain('FOLLOW_UP_OVERDUE');
  });

  it('a task open for a month escalates once, not thirty times', () => {
    const r = detectAutomation({ ...base, activities: [activity({ dueDate: daysAgo(30) })] }, NOW);
    expect(kinds(r)).not.toContain('FOLLOW_UP_OVERDUE');
  });

  it('completed, cancelled and undated work is not overdue', () => {
    const r = detectAutomation(
      {
        ...base,
        activities: [
          activity({ id: 'done', status: 'completed', completedAt: hoursAgo(2) }),
          activity({ id: 'dropped', status: 'cancelled' }),
          activity({ id: 'undated', dueDate: null }),
          activity({ id: 'future', dueDate: '2026-08-01' }),
        ],
      },
      NOW,
    );
    expect(r.escalations).toEqual([]);
  });

  it('in-progress work is still live work — being started is not being done', () => {
    const r = detectAutomation({ ...base, activities: [activity({ status: 'in_progress' })] }, NOW);
    expect(kinds(r)).toContain('FOLLOW_UP_OVERDUE');
  });
});

describe('routing — a fact, never an invented policy', () => {
  it('routes an unassigned lead to the owner of the account it exactly matches', () => {
    const r = detectAutomation(
      { ...base, leads: [lead({ assignedTo: null, assignedAt: null, acceptedAt: null })], accounts: [account()] },
      NOW,
    );
    expect(r.assignments).toEqual([
      {
        leadId: 'l1',
        leadName: 'Ali Hassan',
        assigneeId: 'rep-owner',
        accountId: 'acc-1',
        accountName: 'Emaar FM',
        reason: 'matches existing account "Emaar FM" — routed to its owner',
      },
    ]);
  });

  it('never touches a lead that already has an owner', () => {
    const r = detectAutomation({ ...base, leads: [lead({ assignedTo: 'rep-a' })], accounts: [account()] }, NOW);
    expect(r.assignments).toEqual([]);
  });

  it('leaves a lead unassigned when no account matches — an empty seat beats a wrong owner', () => {
    const r = detectAutomation(
      {
        ...base,
        leads: [lead({ assignedTo: null, assignedAt: null, companyName: 'Nobody We Know LLC' })],
        accounts: [account()],
      },
      NOW,
    );
    expect(r.assignments).toEqual([]);
  });

  it('will not route to an account nobody owns', () => {
    const r = detectAutomation(
      { ...base, leads: [lead({ assignedTo: null, assignedAt: null })], accounts: [account({ ownerId: null })] },
      NOW,
    );
    expect(r.assignments).toEqual([]);
  });

  it('never routes terminal leads', () => {
    for (const status of ['converted', 'disqualified']) {
      const r = detectAutomation(
        { ...base, leads: [lead({ assignedTo: null, assignedAt: null, status })], accounts: [account()] },
        NOW,
      );
      expect(r.assignments).toEqual([]);
    }
  });
});

describe('determinism and emptiness', () => {
  it('nothing to do ⇒ an empty run, not a wall of noise', () => {
    const r = detectAutomation(base, NOW);
    expect(r).toEqual({ windowHours: 24, escalations: [], assignments: [] });
  });

  it('is pure: same facts + same now ⇒ same run', () => {
    const input = { leads: [lead()], activities: [activity()], accounts: [account()] };
    expect(detectAutomation(input, NOW)).toEqual(detectAutomation(input, NOW));
  });

  it('every escalation carries a stable key', () => {
    const r = detectAutomation({ ...base, leads: [lead()], activities: [activity()] }, NOW);
    expect(r.escalations.every((e) => e.key.length > 0)).toBe(true);
    expect(new Set(r.escalations.map((e) => e.key)).size).toBe(r.escalations.length);
  });
});

import { describe, it, expect } from 'vitest';
import { makeLead, leadAttention, LEAD_ATTENTION, type Lead, type LeadStatus } from './crm';

const NOW = new Date('2026-07-13T12:00:00.000Z');
const iso = (d: string): string => new Date(d).toISOString();

/** A healthy, freshly-worked active lead — assigned, responded, next step scheduled, just touched. */
function healthyLead(over: Partial<Lead> = {}): Lead {
  return {
    ...makeLead({ tenantId: 't1', name: 'Acme Corp', status: 'new' }),
    assignedTo: 'u1',
    assignedAt: iso('2026-07-13T09:00:00Z'),
    firstRespondedAt: iso('2026-07-13T10:00:00Z'),
    createdAt: iso('2026-07-12T09:00:00Z'), // 1 day old
    ...over,
  };
}
const freshFacts = { lastTouchIso: iso('2026-07-13T10:00:00Z'), nextActivityDueIso: iso('2026-07-15') };

describe('leadAttention — terminal exemption', () => {
  it.each(['nurturing', 'disqualified'] as LeadStatus[])('exempts %s (never needs attention)', (status) => {
    const a = leadAttention(healthyLead({ status, assignedTo: null }), {}, NOW);
    expect(a.active).toBe(false);
    expect(a.needsAttention).toBe(false);
    expect(a.gaps).toEqual([]);
    expect(a.severity).toBeNull();
  });

  it.each(['new', 'verified', 'assigned', 'contacted', 'qualifying', 'qualified'] as LeadStatus[])('treats %s as active', (status) => {
    expect(leadAttention(healthyLead({ status }), freshFacts, NOW).active).toBe(true);
  });
});

describe('leadAttention — G9 assignment acceptance', () => {
  it('ASSIGNMENT_NOT_ACCEPTED once the acceptance window passes with no acknowledgement', () => {
    // Assigned 9h ago (> the 8h window), never accepted.
    const a = leadAttention(healthyLead({ assignedAt: iso('2026-07-13T03:00:00Z'), acceptedAt: null }), freshFacts, NOW);
    expect(a.gaps).toContain('ASSIGNMENT_NOT_ACCEPTED');
    expect(LEAD_ATTENTION.acceptanceHours).toBe(8);
  });

  it('acceptance retires the gap; inside the window there is no gap yet', () => {
    const accepted = leadAttention(
      healthyLead({ assignedAt: iso('2026-07-13T03:00:00Z'), acceptedAt: iso('2026-07-13T04:00:00Z') }), freshFacts, NOW);
    expect(accepted.gaps).not.toContain('ASSIGNMENT_NOT_ACCEPTED');
    // healthyLead is assigned 3h ago and unaccepted — still inside the window.
    expect(leadAttention(healthyLead(), freshFacts, NOW).gaps).not.toContain('ASSIGNMENT_NOT_ACCEPTED');
  });
});

describe('leadAttention — healthy path', () => {
  it('a fully-worked active lead has no gaps', () => {
    const a = leadAttention(healthyLead(), freshFacts, NOW);
    expect(a.needsAttention).toBe(false);
    expect(a.gaps).toEqual([]);
    expect(a.severity).toBeNull();
  });
});

describe('leadAttention — each gap in isolation', () => {
  it('UNASSIGNED when no owner', () => {
    const a = leadAttention(healthyLead({ assignedTo: null, assignedAt: null }), freshFacts, NOW);
    expect(a.gaps).toContain('UNASSIGNED');
    expect(a.severity).toBe('MEDIUM');
  });

  it('NO_NEXT_ACTIVITY when nothing is scheduled', () => {
    const a = leadAttention(healthyLead(), { lastTouchIso: freshFacts.lastTouchIso }, NOW);
    expect(a.gaps).toContain('NO_NEXT_ACTIVITY');
  });

  it('FOLLOW_UP_OVERDUE when next activity due date has passed', () => {
    const a = leadAttention(healthyLead(), { ...freshFacts, nextActivityDueIso: iso('2026-07-10') }, NOW);
    expect(a.gaps).toContain('FOLLOW_UP_OVERDUE');
    expect(a.gaps).not.toContain('NO_NEXT_ACTIVITY');
    expect(a.severity).toBe('HIGH');
  });

  it('STALE when no touch within the stale window', () => {
    const stale = iso('2026-07-01T10:00:00Z'); // 12 days > 7
    const a = leadAttention(healthyLead(), { ...freshFacts, lastTouchIso: stale }, NOW);
    expect(a.gaps).toContain('STALE');
  });

  it('STALE when never touched', () => {
    const a = leadAttention(healthyLead(), { nextActivityDueIso: freshFacts.nextActivityDueIso }, NOW);
    expect(a.gaps).toContain('STALE');
  });

  it('QUALIFICATION_STALLED when new/contacted and older than the window', () => {
    const old = iso('2026-06-10T09:00:00Z'); // 33 days > 21
    const a = leadAttention(healthyLead({ status: 'contacted', createdAt: old }), freshFacts, NOW);
    expect(a.gaps).toContain('QUALIFICATION_STALLED');
  });

  it('does NOT flag QUALIFICATION_STALLED once qualified', () => {
    const old = iso('2026-06-10T09:00:00Z');
    const a = leadAttention(healthyLead({ status: 'qualified', createdAt: old }), freshFacts, NOW);
    expect(a.gaps).not.toContain('QUALIFICATION_STALLED');
  });
});

describe('leadAttention — SLA first-response boundary', () => {
  const base = (over: Partial<Lead>) => healthyLead({ firstRespondedAt: null, ...over });

  it('breaches at exactly the SLA window with no response', () => {
    // assigned 24h ago, default 24h SLA, not responded ⇒ breach
    const a = leadAttention(base({ assignedAt: iso('2026-07-12T12:00:00Z') }), { nextActivityDueIso: freshFacts.nextActivityDueIso, lastTouchIso: freshFacts.lastTouchIso }, NOW);
    expect(a.gaps).toContain('SLA_BREACHED');
    expect(a.severity).toBe('HIGH');
  });

  it('does not breach just inside the window', () => {
    // assigned 23h ago ⇒ still inside 24h
    const a = leadAttention(base({ assignedAt: iso('2026-07-12T13:00:00Z') }), { nextActivityDueIso: freshFacts.nextActivityDueIso, lastTouchIso: freshFacts.lastTouchIso }, NOW);
    expect(a.gaps).not.toContain('SLA_BREACHED');
  });

  it('respects a per-lead SLA override', () => {
    // assigned 2h ago, 1h SLA ⇒ breach
    const a = leadAttention(
      base({ assignedAt: iso('2026-07-13T10:00:00Z'), slaFirstResponseHours: 1 }),
      { nextActivityDueIso: freshFacts.nextActivityDueIso, lastTouchIso: freshFacts.lastTouchIso },
      NOW,
    );
    expect(a.gaps).toContain('SLA_BREACHED');
  });

  it('clears once a first response is recorded', () => {
    const a = leadAttention(
      base({ assignedAt: iso('2026-07-10T12:00:00Z') }),
      { ...freshFacts, firstRespondedIso: iso('2026-07-13T10:00:00Z') },
      NOW,
    );
    expect(a.gaps).not.toContain('SLA_BREACHED');
  });
});

describe('leadAttention — combined severity', () => {
  it('reports the HIGHEST severity across all open gaps', () => {
    // unassigned (MEDIUM) + overdue follow-up (HIGH) + stale (MEDIUM)
    const a = leadAttention(
      healthyLead({ assignedTo: null, assignedAt: null }),
      { lastTouchIso: iso('2026-06-01T10:00:00Z'), nextActivityDueIso: iso('2026-07-01') },
      NOW,
    );
    expect(a.needsAttention).toBe(true);
    expect(a.gaps).toEqual(expect.arrayContaining(['UNASSIGNED', 'FOLLOW_UP_OVERDUE', 'STALE']));
    expect(a.severity).toBe('HIGH');
  });

  it('sanity: thresholds are the documented defaults', () => {
    expect(LEAD_ATTENTION.slaFirstResponseHours).toBe(24);
    expect(LEAD_ATTENTION.staleDays).toBe(7);
    expect(LEAD_ATTENTION.qualificationStalledDays).toBe(21);
  });
});

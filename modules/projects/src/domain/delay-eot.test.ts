import { describe, expect, it } from 'vitest';
import { makeDelayEvent, makeEotClaim, calculateDelayAnalysis, type DelayEvent, type EotClaim } from './delay-eot';

describe('Delay & EOT domain model & calculations', () => {
  it('should initialize a delay event with correct defaults', () => {
    const delay = makeDelayEvent({
      tenantId: 't1',
      projectId: 'p1',
      title: 'Excavation Rain Delay',
      causeCategory: 'neutral',
      startDate: '2026-06-01',
      endDate: '2026-06-05',
      delayDays: 4,
      isConcurrent: false,
    });

    expect(delay.title).toBe('Excavation Rain Delay');
    expect(delay.causeCategory).toBe('neutral');
    expect(delay.delayDays).toBe(4);
    expect(delay.isConcurrent).toBe(false);
    expect(delay.status).toBe('identified');
  });

  it('should initialize an EOT claim draft', () => {
    const claim = makeEotClaim({
      tenantId: 't1',
      projectId: 'p1',
      claimNumber: 1,
      title: 'EOT Claim #1',
      submittedDays: 14,
      justification: 'Severe force majeure weather impact',
      delayEventIds: ['d1', 'd2'],
    });

    expect(claim.claimNumber).toBe(1);
    expect(claim.status).toBe('draft');
    expect(claim.submittedDays).toBe(14);
    expect(claim.approvedDays).toBe(0);
    expect(claim.delayEventIds).toEqual(['d1', 'd2']);
  });

  it('should calculate delay analysis and concurrency roll-up metrics correctly', () => {
    const delays: DelayEvent[] = [
      makeDelayEvent({
        tenantId: 't1',
        projectId: 'p1',
        title: 'Design Approval Delay',
        causeCategory: 'employer',
        startDate: '2026-06-01',
        delayDays: 10,
        isConcurrent: false,
      }),
      makeDelayEvent({
        tenantId: 't1',
        projectId: 'p1',
        title: 'Weather Outage',
        causeCategory: 'neutral',
        startDate: '2026-06-05',
        delayDays: 5,
        isConcurrent: true, // overlaps design approval
      }),
      makeDelayEvent({
        tenantId: 't1',
        projectId: 'p1',
        title: 'Subcontractor Labor Strike',
        causeCategory: 'contractor',
        startDate: '2026-06-15',
        delayDays: 4,
        isConcurrent: false,
      }),
    ];

    const claims: EotClaim[] = [
      makeEotClaim({
        tenantId: 't1',
        projectId: 'p1',
        claimNumber: 1,
        title: 'Claim #1',
        submittedDays: 10,
      }),
    ];
    claims[0].status = 'approved';
    claims[0].approvedDays = 8;

    const analysis = calculateDelayAnalysis(delays, claims);

    expect(analysis.totalDelayEvents).toBe(3);
    expect(analysis.totalDelayDays).toBe(19);       // 10 + 5 + 4
    expect(analysis.netDelayDays).toBe(14);         // 10 + 4 (ignores concurrent 5 days weather)
    expect(analysis.employerDays).toBe(10);
    expect(analysis.contractorDays).toBe(4);
    expect(analysis.neutralDays).toBe(5);
    expect(analysis.totalEotClaimed).toBe(10);
    expect(analysis.totalEotApproved).toBe(8);
    expect(analysis.pendingEotDays).toBe(2);
  });
});

import { describe, it, expect } from 'vitest';
import {
  makeSignal, advanceSignal, promoteSignal, dismissSignal,
  SIGNAL_OPEN_STATUSES, SIGNAL_TERMINAL_STATUSES,
  SIGNAL_DISMISS_REASON_CODES,
} from './signal';

const base = () => makeSignal({ tenantId: 't1', title: 'New hospital CCTV', source: 'MARKET', type: 'NEW_PROJECT' });

describe('makeSignal', () => {
  it('defaults to NEW / open, clamps confidence, stamps detectedAt', () => {
    const s = makeSignal({ tenantId: 't1', title: 'X', source: 'MANUAL', type: 'OTHER', confidence: 130 });
    expect(s.status).toBe('NEW');
    expect(s.confidence).toBe(100);
    expect(s.promotedLeadId).toBeNull();
    expect(s.detectedAt).toBeTruthy();
    expect(SIGNAL_OPEN_STATUSES).toContain(s.status);
  });
  it('defaults confidence to 50 when absent', () => {
    expect(base().confidence).toBe(50);
  });
});

describe('advanceSignal', () => {
  it('rejects skipping review and repeating/backtracking a triage step', () => {
    expect(() => advanceSignal(base(), 'RESEARCHING')).toThrow(/invalid signal transition/);
    expect(() => advanceSignal(advanceSignal(base(), 'REVIEWING'), 'REVIEWING')).toThrow(/invalid signal transition/);
  });
  it('moves NEW → REVIEWING → RESEARCHING', () => {
    const r = advanceSignal(advanceSignal(base(), 'REVIEWING', 'u1'), 'RESEARCHING', 'u1');
    expect(r.status).toBe('RESEARCHING');
    expect(r.reviewedBy).toBe('u1');
    expect(r.reviewedAt).toBeTruthy();
  });
  it('refuses to advance a terminal signal', () => {
    const promoted = promoteSignal(base(), 'lead-1');
    expect(() => advanceSignal(promoted, 'REVIEWING')).toThrow(/no longer change/);
  });
});

describe('promoteSignal', () => {
  it('links the lead + marks PROMOTED (terminal)', () => {
    const p = promoteSignal(base(), 'lead-9');
    expect(p.status).toBe('PROMOTED');
    expect(p.promotedLeadId).toBe('lead-9');
    expect(SIGNAL_TERMINAL_STATUSES).toContain(p.status);
  });
  it('cannot promote twice', () => {
    const p = promoteSignal(base(), 'lead-9');
    expect(() => promoteSignal(p, 'lead-10')).toThrow(/already promoted/);
  });
  it('cannot promote a dismissed signal', () => {
    const d = dismissSignal(base(), 'not a fit');
    expect(() => promoteSignal(d, 'lead-1')).toThrow(/cannot be promoted/);
  });
});

describe('dismissSignal', () => {
  it('records the reason + DISMISSED', () => {
    const d = dismissSignal(base(), 'LOW_POTENTIAL', false, 'Budget frozen');
    expect(d.status).toBe('DISMISSED');
    expect(d.dismissalReasonCode).toBe('LOW_POTENTIAL');
    expect(d.dismissalNote).toBe('Budget frozen');
    expect(SIGNAL_DISMISS_REASON_CODES).toContain(d.dismissalReasonCode);
  });
  it('supports marking as DUPLICATE', () => {
    const d = dismissSignal(base(), 'DUPLICATE', true, 'Existing lead #12');
    expect(d.status).toBe('DUPLICATE');
    expect(d.dismissalReasonCode).toBe('DUPLICATE');
    expect(d.dismissalNote).toBe('Existing lead #12');
  });
  it('cannot dismiss a promoted signal', () => {
    const p = promoteSignal(base(), 'lead-1');
    expect(() => dismissSignal(p, 'oops')).toThrow(/can no longer change/);
  });
});

import { describe, expect, it } from 'vitest';
import { checkTenderTransition, tenderGateMessage, type TenderGateEvidence } from './tender-gate';
import type { TenderStatus } from './tender';

const tender = (status: TenderStatus, value = 500_000) => ({ status, value });
const codes = (from: TenderStatus, to: TenderStatus, ev: TenderGateEvidence = {}, value = 500_000) =>
  checkTenderTransition(tender(from, value), to, ev).gaps.map((g) => g.code);
const allowed = (from: TenderStatus, to: TenderStatus, ev: TenderGateEvidence = {}, value = 500_000) =>
  checkTenderTransition(tender(from, value), to, ev).allowed;

describe('no-ops and retreats are always allowed', () => {
  it('a transition to the current status is a no-op', () => {
    expect(allowed('estimating', 'estimating')).toBe(true);
  });

  it('stepping back down the ladder needs no evidence', () => {
    expect(allowed('submitted', 'estimating')).toBe(true);
    expect(allowed('priced', 'qualifying')).toBe(true);
    expect(allowed('estimating', 'draft')).toBe(true);
  });

  it('reopening a terminal outcome back onto the ladder is a correction, not a re-advance', () => {
    // won → draft: from is off-ladder, so it is neither a guarded advance nor a retreat — allowed,
    // and re-advancing from draft will face every forward gate again.
    expect(allowed('won', 'draft')).toBe(true);
  });
});

describe('→ estimating requires a Go/Conditional bid decision', () => {
  it('blocks when no bid decision has been made', () => {
    expect(codes('qualifying', 'estimating', {})).toEqual(['NO_BID_DECISION']);
  });

  it('blocks when the decision was No-Go — decline it, do not estimate it', () => {
    expect(codes('qualifying', 'estimating', { bidRecommendation: 'no_go' })).toEqual(['BID_IS_NO_GO']);
  });

  it('allows on Go and on Conditional', () => {
    expect(allowed('qualifying', 'estimating', { bidRecommendation: 'go' })).toBe(true);
    expect(allowed('qualifying', 'estimating', { bidRecommendation: 'conditional' })).toBe(true);
  });
});

describe('→ priced requires something actually priced', () => {
  it('blocks with no priced estimate', () => {
    expect(codes('estimating', 'priced', { bidRecommendation: 'go' })).toEqual(['NO_PRICED_ESTIMATE']);
  });

  it('allows once a rate is priced', () => {
    expect(allowed('estimating', 'priced', { bidRecommendation: 'go', hasPricedEstimate: true })).toBe(true);
  });
});

describe('→ submitted is the strict gate — decision AND price AND value', () => {
  it('a bare draft cannot jump to submitted', () => {
    expect(codes('draft', 'submitted', {}).sort()).toEqual(['NO_BID_DECISION', 'NO_PRICED_ESTIMATE'].sort());
  });

  it('names every missing thing at once, not one at a time', () => {
    expect(codes('qualifying', 'submitted', {}, 0).sort()).toEqual(
      ['NO_BID_DECISION', 'NO_BID_VALUE', 'NO_PRICED_ESTIMATE'].sort(),
    );
  });

  it('a priced go-decision with a value submits — even jumping states, because the WORK is proven', () => {
    // The gate reads evidence, not visited states: the bid was scored and priced, so a direct
    // draft → submitted is legitimate. States are a convenience; the facts are the gate.
    expect(allowed('draft', 'submitted', { bidRecommendation: 'go', hasPricedEstimate: true })).toBe(true);
  });

  it('a zero-value bid is not a bid', () => {
    expect(codes('priced', 'submitted', { bidRecommendation: 'go', hasPricedEstimate: true }, 0)).toEqual(['NO_BID_VALUE']);
  });
});

describe('won / lost can only follow a submission', () => {
  it('blocks winning a bid that was never submitted', () => {
    expect(codes('priced', 'won', { bidRecommendation: 'go', hasPricedEstimate: true })).toEqual(['NOT_SUBMITTED']);
    expect(codes('draft', 'lost')).toEqual(['NOT_SUBMITTED']);
  });

  it('allows won and lost straight from submitted', () => {
    expect(allowed('submitted', 'won')).toBe(true);
    expect(allowed('submitted', 'lost')).toBe(true);
  });
});

describe('declining requires a recorded No-Go', () => {
  it('blocks a decline with no bid decision, or a Go decision', () => {
    expect(codes('qualifying', 'declined', {})).toEqual(['DECLINE_WITHOUT_NO_GO']);
    expect(codes('qualifying', 'declined', { bidRecommendation: 'go' })).toEqual(['DECLINE_WITHOUT_NO_GO']);
  });

  it('allows a decline once No-Go is on record — even straight from draft', () => {
    expect(allowed('draft', 'declined', { bidRecommendation: 'no_go' })).toBe(true);
  });
});

describe('the whole happy path walks cleanly', () => {
  it('draft → qualifying → estimating → priced → submitted → won', () => {
    const go: TenderGateEvidence = { bidRecommendation: 'go', hasPricedEstimate: true };
    expect(allowed('draft', 'qualifying')).toBe(true);
    expect(allowed('qualifying', 'estimating', { bidRecommendation: 'go' })).toBe(true);
    expect(allowed('estimating', 'priced', go)).toBe(true);
    expect(allowed('priced', 'submitted', go)).toBe(true);
    expect(allowed('submitted', 'won', go)).toBe(true);
  });
});

describe('tenderGateMessage', () => {
  it('joins the gap messages into one throwable sentence', () => {
    const check = checkTenderTransition(tender('draft'), 'won');
    const msg = tenderGateMessage('won', check.gaps);
    // "only … can move there" — the phrasing the API taxonomy reads as a 409 state conflict.
    expect(msg).toContain('only a tender that meets the won gate can move there');
    expect(msg).toContain('Only a submitted bid can be won or lost');
  });
});

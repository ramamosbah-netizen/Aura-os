import { describe, expect, it } from 'vitest';
import {
  closeQuery,
  makeTechnicalQuery,
  respondToQuery,
  type TechnicalQuery,
} from './technical-query';

/**
 * ENG-03 — the RESPONSE is the capability.
 *
 * A TQ answer is a formal design decision that site then builds to, which makes the three things
 * tested here the whole point: it must be attributable, it must not change silently underneath the
 * people who built to it, and somebody other than its author has to say it was adequate.
 */

const raise = (over: Partial<TechnicalQuery> = {}): TechnicalQuery => ({
  ...makeTechnicalQuery({
    tenantId: 't1', projectId: 'p1', code: 'TQ-001',
    title: 'Riser route clashes with duct', query: 'Which service takes precedence at level 3?',
  }),
  ...over,
});

describe('raising one', () => {
  it('requires a code and an actual question', () => {
    expect(() => makeTechnicalQuery({ tenantId: 't', projectId: 'p', code: '  ', title: 'x', query: 'q' }))
      .toThrow(/must carry a code/);
    expect(() => makeTechnicalQuery({ tenantId: 't', projectId: 'p', code: 'TQ-1', title: 'x', query: '  ' }))
      .toThrow(/must state what is being asked/);
  });

  it('cannot be born answered', () => {
    // A query created as `responded` would carry a status its own empty response field contradicts
    // — a record that lies about itself from the moment it exists.
    expect(() => makeTechnicalQuery({ tenantId: 't', projectId: 'p', code: 'TQ-1', title: 'x', query: 'q', status: 'responded' }))
      .toThrow(/raised open/);
    expect(() => makeTechnicalQuery({ tenantId: 't', projectId: 'p', code: 'TQ-1', title: 'x', query: 'q', status: 'closed' }))
      .toThrow(/raised open/);
  });

  it('starts open, unanswered and unattributed — absence, not a false zero', () => {
    const tq = raise();
    expect(tq).toMatchObject({
      status: 'open', response: null, respondedAt: null, respondedBy: null,
      responseRevision: 0, closedAt: null, closedBy: null,
    });
  });
});

describe('answering one', () => {
  it('records the decision, who made it, and when', () => {
    const { query, superseded } = respondToQuery(raise(), { response: 'Duct takes precedence. Reroute riser east.', by: 'u-tm' });
    expect(query).toMatchObject({
      status: 'responded', response: 'Duct takes precedence. Reroute riser east.',
      respondedBy: 'u-tm', responseRevision: 0,
    });
    expect(query.respondedAt).not.toBeNull();
    // Nothing was displaced by the first answer.
    expect(superseded).toBeNull();
  });

  it('refuses an empty response', () => {
    // A blank answer that set the status to `responded` would close a question with nothing in it.
    expect(() => respondToQuery(raise(), { response: '   ', by: 'u-tm' })).toThrow(/cannot be empty/);
  });
});

describe('replacing an answer that already stands', () => {
  const answered = () => respondToQuery(raise(), { response: 'Reroute riser east.', by: 'u-tm' }).query;

  it('costs a reason, because site builds to it', () => {
    expect(() => respondToQuery(answered(), { response: 'Reroute west instead.', by: 'u-tm' }))
      .toThrow(/replacing a design response requires a reason/);
  });

  it('keeps what it displaced, by value', () => {
    // "What were we told in March" has to stay answerable after June's answer exists — that is what
    // site actually built to.
    const { query, superseded } = respondToQuery(answered(), {
      response: 'Reroute west instead.', by: 'u-tm2', supersededReason: 'consultant revised after coordination review',
    });
    expect(superseded).toMatchObject({
      revision: 0, response: 'Reroute riser east.', respondedBy: 'u-tm',
      supersededReason: 'consultant revised after coordination review',
    });
    expect(query).toMatchObject({ response: 'Reroute west instead.', respondedBy: 'u-tm2', responseRevision: 1 });
  });

  it('counts revisions up, so the number of times a decision moved is itself visible', () => {
    const first = answered();
    const second = respondToQuery(first, { response: 'B', by: 'u-tm', supersededReason: 'r1' }).query;
    const third = respondToQuery(second, { response: 'C', by: 'u-tm', supersededReason: 'r2' }).query;
    expect(third.responseRevision).toBe(2);
  });
});

describe('closing the loop', () => {
  const answered = (by = 'u-tm') => respondToQuery(raise(), { response: 'Reroute riser east.', by }).query;

  it('is the raising side accepting the answer as adequate to build to', () => {
    const closed = closeQuery(answered(), { by: 'u-engineer' });
    expect(closed).toMatchObject({ status: 'closed', closedBy: 'u-engineer' });
    expect(closed.closedAt).not.toBeNull();
  });

  it('refuses the person who answered — nobody declares their own answer adequate', () => {
    // Collapsing both into one person turns the whole exchange into a note somebody wrote to
    // themselves.
    expect(() => closeQuery(answered('u-tm'), { by: 'u-tm' }))
      .toThrow(/only somebody other than the person who answered/);
  });

  it('refuses a query nobody has answered', () => {
    // A TQ closed with no response was abandoned, not resolved — a different fact, and one worth
    // not disguising as a resolution.
    expect(() => closeQuery(raise(), { by: 'u-engineer' })).toThrow(/nothing to accept/);
  });

  it('refuses to close one that is already closed', () => {
    const closed = closeQuery(answered(), { by: 'u-engineer' });
    expect(() => closeQuery(closed, { by: 'u-engineer2' })).toThrow(/is closed/);
  });
});

describe('what a closed query refuses', () => {
  it('will not have its answer changed underneath the people who acted on it', () => {
    const closed = closeQuery(respondToQuery(raise(), { response: 'Reroute east.', by: 'u-tm' }).query, { by: 'u-engineer' });
    expect(() => respondToQuery(closed, { response: 'Actually west.', by: 'u-tm', supersededReason: 'changed my mind' }))
      .toThrow(/closed; its answer can only be changed by reopening it first/);
  });
});

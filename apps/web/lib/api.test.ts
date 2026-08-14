import { describe, it, expect } from 'vitest';
import { classifyStatus, describeDataError, type DataError } from './api';

// G-05. The defect was never that reads could fail — it was that every failure became `null`, so
// "you have no unpaid invoices" and "we could not load your unpaid invoices" rendered identically.
// These pin the classification and, more importantly, the WORDING: the message a user reads is the
// entire remedy here, so it is the thing worth asserting.

describe('classifyStatus', () => {
  it('separates the cases a user can act on differently', () => {
    expect(classifyStatus(401)).toBe('unauthorized'); // sign in again
    expect(classifyStatus(403)).toBe('forbidden');    // ask for access
    expect(classifyStatus(404)).toBe('not-found');    // the link is wrong
  });

  it('treats every other non-OK status as a server fault', () => {
    for (const status of [400, 409, 422, 500, 502, 503]) {
      expect(classifyStatus(status), `status ${status}`).toBe('server');
    }
  });
});

describe('describeDataError', () => {
  const describe_ = (kind: DataError['kind'], status = 500) => describeDataError({ kind, status });

  it('never tells a user their data is empty when it could not be read', () => {
    // The failure mode this gap is about: silence that reads as "there is nothing here".
    for (const kind of ['unauthorized', 'forbidden', 'not-found', 'server', 'unreachable'] as const) {
      const { title, description } = describe_(kind);
      const text = `${title} ${description}`.toLowerCase();
      expect(text.length, `${kind} must say something`).toBeGreaterThan(0);
      expect(text, `${kind} must not claim emptiness`).not.toMatch(/\bno records\b|\bnothing here\b|\bis empty\b/);
    }
  });

  it('says a refusal is about permission, not about failure', () => {
    const { title, description } = describe_('forbidden', 403);
    expect(`${title} ${description}`).toMatch(/access|permission/i);
    // A 403 means the records may well exist — saying otherwise misleads.
    expect(description).toMatch(/may exist/i);
  });

  it('tells an expired session what to do, and reassures', () => {
    const { title, description } = describe_('unauthorized', 401);
    expect(title).toMatch(/session/i);
    expect(description).toMatch(/sign in/i);
    expect(description).toMatch(/nothing has been lost/i);
  });

  it('distinguishes a connection problem from an empty list, explicitly', () => {
    const { description } = describe_('unreachable', 0);
    expect(description).toMatch(/not an empty list/i);
  });

  it('surfaces the status on a server fault so it can be reported', () => {
    expect(describe_('server', 502).description).toContain('502');
  });
});

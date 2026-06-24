import { describe, expect, it } from 'vitest';
import { type WebhookSubscription, eventTypeMatches, makeWebhookSubscription, signPayload, subscriptionMatches } from './webhook';

describe('eventTypeMatches', () => {
  it('matches exact', () => expect(eventTypeMatches('dms.document.created', 'dms.document.created')).toBe(true));
  it('matches a trailing wildcard on the module', () => expect(eventTypeMatches('workflow.*', 'workflow.instance.started')).toBe(true));
  it('matches a mid wildcard', () => expect(eventTypeMatches('workflow.*.started', 'workflow.instance.started')).toBe(true));
  it('global wildcard matches anything', () => expect(eventTypeMatches('*', 'finance.invoice.created')).toBe(true));
  it('denies a different module', () => expect(eventTypeMatches('finance.*', 'procurement.po.approved')).toBe(false));
});

describe('subscriptionMatches', () => {
  const sub = makeWebhookSubscription({ tenantId: 't1', url: 'https://x/hook', eventTypes: ['workflow.*', 'dms.document.created'] });
  it('matches a subscribed pattern', () => expect(subscriptionMatches(sub, 'workflow.instance.completed')).toBe(true));
  it('does not match an unsubscribed type', () => expect(subscriptionMatches(sub, 'finance.invoice.created')).toBe(false));
  it('never matches when inactive', () => {
    const off: WebhookSubscription = { ...sub, active: false };
    expect(subscriptionMatches(off, 'workflow.instance.completed')).toBe(false);
  });
});

describe('signPayload', () => {
  it('is deterministic for the same secret + payload', () => {
    expect(signPayload('s3cret', '{"a":1}')).toBe(signPayload('s3cret', '{"a":1}'));
  });
  it('changes with the secret', () => {
    expect(signPayload('a', '{"a":1}')).not.toBe(signPayload('b', '{"a":1}'));
  });
  it('is formatted sha256=<hex>', () => {
    expect(signPayload('s', 'x')).toMatch(/^sha256=[0-9a-f]{64}$/);
  });
});

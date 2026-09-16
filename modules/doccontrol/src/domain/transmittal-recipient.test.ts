import { describe, expect, it } from 'vitest';
import {
  acknowledgeAsRecipient,
  makeTransmittalRecipient,
  receiptOf,
  recipientFor,
  toTransmittalParty,
  type TransmittalRecipient,
} from './transmittal-recipient';

/**
 * A transmittal goes to PEOPLE, and only they can say it arrived.
 *
 * These tests are mostly about the two claims a distribution must never make: that somebody
 * received a document when a different person signed for it, and that three people have it when
 * one of them has answered.
 */

const to = (userId: string, party = 'other'): TransmittalRecipient =>
  makeTransmittalRecipient({ tenantId: 't1', projectId: 'p1', transmittalId: 'tr1', userId, party });

describe('addressing one', () => {
  it('requires a platform user, not a description of one', () => {
    // "Site team" is who a free-text field holds, and it resolves to nobody the system can check.
    expect(() => makeTransmittalRecipient({ tenantId: 't', projectId: 'p', transmittalId: 'tr', userId: '  ' }))
      .toThrow(/must name a platform user/);
  });

  it('records the capacity somebody receives in', () => {
    expect(to('u-site', 'site_engineer').party).toBe('site_engineer');
    expect(to('u-buyer', 'procurement').party).toBe('procurement');
  });

  it('falls back to `other` for a capacity it does not know, rather than inventing one', () => {
    expect(toTransmittalParty('quantity surveyor')).toBe('other');
    expect(toTransmittalParty(null)).toBe('other');
    // …and is forgiving about how a known one was typed.
    expect(toTransmittalParty('Site-Engineer')).toBe('site_engineer');
    expect(toTransmittalParty(' PROJECT ENGINEER ')).toBe('project_engineer');
  });

  it('starts unacknowledged — nobody has said anything yet', () => {
    expect(to('u-site')).toMatchObject({ acknowledgedAt: null, acknowledgedNote: null });
  });
});

describe('who may say it arrived', () => {
  const distribution = [to('u-site', 'site_engineer'), to('u-pe', 'project_engineer'), to('u-buyer', 'procurement')];

  it('finds the actor on the distribution', () => {
    expect(recipientFor(distribution, 'u-pe')?.party).toBe('project_engineer');
  });

  it('finds nobody for an actor who was never sent it', () => {
    // The gap this closes: holding the acknowledge permission made anyone able to sign for anyone.
    // A receipt from somebody who was never sent the document is a second person's opinion that it
    // probably arrived.
    expect(recipientFor(distribution, 'u-stranger')).toBeNull();
  });

  it('finds nobody for an unauthenticated caller', () => {
    expect(recipientFor(distribution, null)).toBeNull();
  });
});

describe('acknowledging for yourself', () => {
  it('records when, and the note if there is one', () => {
    const acked = acknowledgeAsRecipient(to('u-site'), { note: '  received on site  ' });
    expect(acked.acknowledgedAt).not.toBeNull();
    expect(acked.acknowledgedNote).toBe('received on site');
  });

  it('refuses a second acknowledgement rather than moving the date', () => {
    // A receipt is a thing that happened at a time, and somebody downstream is relying on that time.
    const acked = acknowledgeAsRecipient(to('u-site'), { at: '2026-03-10T08:00:00.000Z' });
    expect(() => acknowledgeAsRecipient(acked)).toThrow(/has already acknowledged/);
  });
});

describe('the state of receipt across a distribution', () => {
  const site = () => to('u-site', 'site_engineer');
  const pe = () => to('u-pe', 'project_engineer');
  const buyer = () => to('u-buyer', 'procurement');

  it('is not receipt while anybody is outstanding', () => {
    // ONE PERSON CONFIRMING IS NOT THREE. Reporting this as acknowledged would tell a document
    // controller that Site and the Buyer have a drawing neither of them has seen.
    const receipt = receiptOf([acknowledgeAsRecipient(site()), pe(), buyer()]);
    expect(receipt).toMatchObject({ acknowledgedCount: 1, fullyAcknowledged: false });
    expect(receipt.outstanding.map((r) => r.userId)).toEqual(['u-pe', 'u-buyer']);
  });

  it('names WHO is outstanding, so a chase reaches the right person', () => {
    const receipt = receiptOf([acknowledgeAsRecipient(site()), acknowledgeAsRecipient(pe()), buyer()]);
    expect(receipt.outstanding.map((r) => r.party)).toEqual(['procurement']);
  });

  it('is receipt only when every named recipient has answered', () => {
    const receipt = receiptOf([site(), pe(), buyer()].map((r) => acknowledgeAsRecipient(r)));
    expect(receipt).toMatchObject({ acknowledgedCount: 3, fullyAcknowledged: true });
    expect(receipt.outstanding).toEqual([]);
  });

  it('is NOT receipt when nobody was addressed at all', () => {
    // "Every recipient has acknowledged" over an empty distribution is the emptiest kind of true
    // statement — and it reads as delivered.
    expect(receiptOf([])).toMatchObject({ acknowledgedCount: 0, fullyAcknowledged: false, outstanding: [] });
  });
});

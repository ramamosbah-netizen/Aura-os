import { describe, expect, it } from 'vitest';
import { acknowledgeAsRecipient, makeTransmittalRecipient } from './transmittal-recipient';
import { makeTransmittalAcknowledgement } from './transmittal-acknowledgement';

/**
 * A receipt the Document Controller RECORDS — the ENG-04 shape.
 *
 * §22 required the actor to BE the recipient, for a reason that was right: "a receipt signed by
 * somebody who was never sent the document is not a receipt". It also made a client's receipt
 * impossible to record at all — a client holds no AURA account and cannot hold
 * `doccontrol.transmittal.acknowledge`, which is the Document Controller's — and a handover
 * dossier goes to a client.
 *
 * So the two facts are kept apart instead of collapsed: WHOSE receipt it is, and WHO WROTE IT
 * DOWN. These tests are about that separation, because a later change that merged the fields
 * would credit an internal user with a client's word and nothing would look wrong.
 */

const recipient = (userId: string) => makeTransmittalRecipient({
  tenantId: 't1', projectId: 'p1', transmittalId: 'tr1', userId, party: 'client',
});

describe('recording a transmittal receipt', () => {
  it('starts with neither an answer nor a recorder', () => {
    const r = recipient('u-client');
    expect(r.acknowledgedAt).toBeNull();
    expect(r.acknowledgementRecordedBy).toBeNull();
  });

  it('keeps WHOSE receipt separate from WHO ENTERED IT', () => {
    const r = acknowledgeAsRecipient(recipient('u-client'), { note: 'signed copy returned', recordedBy: 'u-doccon' });
    expect(r.userId, 'the receipt belongs to the client').toBe('u-client');
    expect(r.acknowledgementRecordedBy, 'the controller wrote it down').toBe('u-doccon');
    expect(r.acknowledgedAt).not.toBeNull();
  });

  it('leaves the recorder NULL when the recipient answered themselves', () => {
    // Null is a fact, not a gap: it says this person acknowledged here. Defaulting it to the
    // actor would turn every self-acknowledgement into one somebody else wrote down.
    const r = acknowledgeAsRecipient(recipient('u-site'), { note: 'seen' });
    expect(r.acknowledgementRecordedBy).toBeNull();
  });

  it('still refuses a second answer from the same recipient', () => {
    const once = acknowledgeAsRecipient(recipient('u-client'), { recordedBy: 'u-doccon' });
    expect(() => acknowledgeAsRecipient(once, { recordedBy: 'u-doccon' })).toThrow(/already acknowledged/i);
  });

  it('records both names on the immutable acknowledgement too', () => {
    const ack = makeTransmittalAcknowledgement({
      tenantId: 't1', transmittalId: 'tr1', transmittalCode: 'TRA-001',
      acknowledgedBy: 'u-client', recordedBy: 'u-doccon', note: 'by email',
    });
    expect(ack.acknowledgedBy, 'the party whose receipt it is').toBe('u-client');
    expect(ack.recordedBy, 'the user who entered it').toBe('u-doccon');
  });

  it('does not invent a recorder on an acknowledgement that had none', () => {
    const ack = makeTransmittalAcknowledgement({
      tenantId: 't1', transmittalId: 'tr1', transmittalCode: 'TRA-001', acknowledgedBy: 'u-site',
    });
    expect(ack.recordedBy).toBeNull();
  });
});

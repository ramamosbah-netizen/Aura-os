import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * One authoritative mail write path (C3.1 cutover).
 *
 * Enforced by reading the real source rather than trusting review: a second place that can create
 * or change mail is invisible until the two models have already drifted, and by then the drift is
 * in production data rather than in a diff.
 */
const COMMS = resolve(__dirname, '..');
const commsStore = readFileSync(join(COMMS, 'postgres-comms-store.ts'), 'utf8');

describe('no mail SQL survives in the comms store', () => {
  it.each([
    ['aura_comms_mail ', 'creates or reads mail rows'],
    ['aura_comms_mail_recipients', 'writes the legacy projection'],
    ['aura_comms_mail_reads', 'writes read receipts'],
  ])('PostgresCommsStore no longer touches %s', (table) => {
    expect(
      commsStore.includes(table),
      `PostgresCommsStore references ${table}. Mail has ONE write path — PostgresMailStore.save —\n` +
        `and CommsService.sendMail delegates to it. A second writer here is how the canonical and\n` +
        `legacy models drift apart while every individual test still passes.\n`,
    ).toBe(false);
  });

  it('the comms store exposes no mail operation at all', () => {
    for (const method of ['addMail', 'getMail', 'listMailFor', 'markMailRead']) {
      expect(commsStore.includes(`async ${method}(`), `${method} must live on MailStore`).toBe(false);
    }
  });
});

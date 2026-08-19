import { describe, expect, it, vi } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { MailService } from './mail.service';
import { INTERNAL_ACCOUNT_ID } from './mail-domain';

/**
 * The account-id contract, at the boundary both backends share.
 *
 * `/mailbox/accounts` offers `aura-internal` as the id of the built-in path, but it is a logical
 * key: there is no row, and `aura_comms_mail.account_id` is a uuid whose canonical "no account"
 * value is NULL — which is exactly what the dispatcher already means by falling back to the
 * aura-internal provider. Accepting the key back untranslated meant PostgreSQL answered every draft
 * save and every send with `invalid input syntax for type uuid: "aura-internal"`, while the
 * in-memory store accepted the string and hid the mismatch. Normalising in the STORE would have
 * kept that divergence; this lives in the service so both tiers behave identically.
 */
const REAL_ACCOUNT = '11111111-2222-4333-8444-555555555555';
const OTHER_TENANTS_ACCOUNT = '99999999-8888-4777-8666-555555555555';

function build() {
  const saved: Array<{ accountId: string | null }> = [];
  const store = {
    // Tenant-scoped by construction: another tenant's account is simply not in this list.
    listAccounts: vi.fn(async (tenantId: string) =>
      tenantId === 'dev-tenant'
        ? [{ id: REAL_ACCOUNT, provider: 'microsoft365', label: 'Ops mailbox', status: 'connected', capabilities: ['send'] }]
        : [],
    ),
    save: vi.fn(async (_tenantId: string, mail: { accountId: string | null }) => { saved.push(mail); }),
  };
  const service = new MailService(store as never, { publish: vi.fn() } as never, { log: vi.fn() } as never);
  const caller = { tenantId: 'dev-tenant', companyId: null, userId: 'u-admin', address: 'admin@aura.test' };
  return { service, caller, saved, store };
}

describe('mail account id — client key vs stored id', () => {
  it('stores NULL for the built-in path, never the logical key', async () => {
    const { service, caller, saved } = build();
    await service.createDraft(caller as never, { accountId: INTERNAL_ACCOUNT_ID, to: ['x@y.com'], subject: 's', body: 'b' } as never);
    expect(saved[0]?.accountId).toBeNull();
  });

  it('treats an absent or empty account the same way', async () => {
    const { service, caller, saved } = build();
    await service.createDraft(caller as never, { to: ['x@y.com'], subject: 's', body: 'b' } as never);
    await service.createDraft(caller as never, { accountId: '', to: ['x@y.com'], subject: 's', body: 'b' } as never);
    expect(saved.map((m) => m.accountId)).toEqual([null, null]);
  });

  it('keeps a real account of THIS tenant', async () => {
    const { service, caller, saved } = build();
    await service.createDraft(caller as never, { accountId: REAL_ACCOUNT, to: ['x@y.com'], subject: 's', body: 'b' } as never);
    expect(saved[0]?.accountId).toBe(REAL_ACCOUNT);
  });

  it('refuses a well-formed uuid that is not an account here — a syntactic uuid is not an account', async () => {
    const { service, caller, saved } = build();
    await expect(
      service.createDraft(caller as never, { accountId: OTHER_TENANTS_ACCOUNT, to: ['x@y.com'], subject: 's', body: 'b' } as never),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(saved).toHaveLength(0);
  });

  it('refuses garbage as a DOMAIN error, not by letting Postgres reject it', async () => {
    const { service, caller } = build();
    await expect(
      service.createDraft(caller as never, { accountId: 'garbage', to: ['x@y.com'], subject: 's', body: 'b' } as never),
    ).rejects.toThrow(/Unknown sending account "garbage"/);
  });

  it('looks the account up in the CALLER tenant, so a cross-tenant id cannot be reached', async () => {
    const { service, store } = build();
    const otherCaller = { tenantId: 'other-tenant', companyId: null, userId: 'u-x', address: 'x@aura.test' };
    await expect(
      service.createDraft(otherCaller as never, { accountId: REAL_ACCOUNT, to: ['x@y.com'], subject: 's', body: 'b' } as never),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(store.listAccounts).toHaveBeenCalledWith('other-tenant', 'email');
  });
});

import { describe, expect, it } from 'vitest';
import { AuraInternalMailAdapter } from './aura-internal-adapter';
import {
  CapabilityUnsupportedError,
  MailProviderRegistry,
  effectiveCapabilities,
  requireCapability,
  supports,
  type MailAccountRef,
  type MailCapability,
  type MailProviderAdapter,
} from './mail-delivery';
import { makeDraft, type MailRecord } from './mail-domain';

/**
 * Provider contracts (C3.2). No provider is connected — these prove the SHAPE holds, so that
 * adding Gmail or Microsoft 365 later is an adapter and not a redesign.
 */

const account = (over: Partial<MailAccountRef> = {}): MailAccountRef => ({
  id: 'acc-1',
  tenantId: 'tenant-a',
  companyId: null,
  provider: 'aura-internal',
  externalAccountId: null,
  address: 'alice@aura.example',
  capabilities: ['send', 'reply', 'reply_all', 'forward', 'attachments', 'read_state', 'scheduled_send'],
  status: 'connected',
  ...over,
});

const draft = (): MailRecord => makeDraft({
  tenantId: 'tenant-a', fromUser: 'u-alice', fromAddress: 'alice@aura.example',
  to: ['client@example.com'], subject: 'Hello', body: 'Body',
});

/** A stand-in for a provider that can read a mailbox but is connected read-only. */
class ReadOnlyProbeAdapter implements MailProviderAdapter {
  readonly provider = 'probe';
  readonly capabilities: MailCapability[] = ['send', 'fetch_messages', 'fetch_threads', 'drafts'];
  async health() { return { status: 'connected' as const, detail: null, checkedAt: new Date().toISOString() }; }
  async send() { return { providerMessageId: 'p-1', providerThreadId: 't-1', internetMessageId: null, sentAt: new Date().toISOString() }; }
  async fetchSince() { return { messages: [], cursor: { token: 'next', fetchedAt: new Date().toISOString() }, hasMore: false }; }
}

describe('capability discovery', () => {
  it('is the intersection of what the adapter can do and what the connection grants', () => {
    const adapter = new ReadOnlyProbeAdapter();
    // The mailbox was connected without send rights, even though the provider supports sending.
    const readOnly = account({ provider: 'probe', capabilities: ['fetch_messages', 'fetch_threads'] });

    expect(effectiveCapabilities(adapter, readOnly).sort()).toEqual(['fetch_messages', 'fetch_threads']);
    expect(supports(adapter, readOnly, 'send')).toBe(false);
    // ...and asking the adapter alone would have given the wrong answer.
    expect(adapter.capabilities).toContain('send');
  });

  it('a granted capability the adapter lacks is still unsupported', () => {
    const adapter = new AuraInternalMailAdapter();
    // The account is granted sync; internal mail has no mailbox to sync.
    const overGranted = account({ capabilities: ['send', 'fetch_messages'] });
    expect(supports(adapter, overGranted, 'fetch_messages')).toBe(false);
  });

  it('refuses an unsupported operation loudly instead of doing nothing', () => {
    const adapter = new AuraInternalMailAdapter();
    expect(() => requireCapability(adapter, account(), 'fetch_messages')).toThrow(CapabilityUnsupportedError);
    // A silent no-op here would look exactly like "no new mail", which is far worse to diagnose.
    expect(() => requireCapability(adapter, account(), 'send')).not.toThrow();
  });

  it('names the provider and the capability in the error', () => {
    const adapter = new AuraInternalMailAdapter();
    try {
      requireCapability(adapter, account(), 'drafts');
      expect.unreachable('should have thrown');
    } catch (error) {
      expect((error as CapabilityUnsupportedError).provider).toBe('aura-internal');
      expect((error as CapabilityUnsupportedError).capability).toBe('drafts');
    }
  });
});

describe('aura-internal reference adapter', () => {
  it('reports healthy without any configuration, because it needs none', async () => {
    const health = await new AuraInternalMailAdapter().health(account());
    expect(health.status).toBe('connected');
    expect(health.detail).toBeNull();
  });

  it('reports a disabled account rather than throwing — a probe that throws cannot report', async () => {
    const health = await new AuraInternalMailAdapter().health(account({ status: 'disabled' }));
    expect(health.status).toBe('disabled');
    expect(health.detail).toBeTruthy();
  });

  it('returns the provider identifiers a sync needs to stay idempotent', async () => {
    const mail = draft();
    const result = await new AuraInternalMailAdapter().send(account(), mail);
    expect(result.providerMessageId).toBe(`aura-internal:${mail.id}`);
    expect(result.providerThreadId).toBe(`aura-internal:${mail.threadId}`);
    // A real Message-ID so an internal thread chains by the same rules an external one does.
    expect(result.internetMessageId).toBe(`<${mail.id}@aura.internal>`);
  });

  it('does not claim to sync a mailbox that does not exist', async () => {
    const adapter = new AuraInternalMailAdapter();
    expect(adapter.capabilities).not.toContain('fetch_messages');
    await expect(adapter.fetchSince()).rejects.toBeInstanceOf(CapabilityUnsupportedError);
  });

  it('does not claim server-side drafts, which AURA owns itself', () => {
    expect(new AuraInternalMailAdapter().capabilities).not.toContain('drafts');
  });
});

describe('provider registry', () => {
  it('resolves an adapter by provider key', () => {
    const registry = new MailProviderRegistry();
    registry.register(new AuraInternalMailAdapter());
    expect(registry.get('aura-internal').provider).toBe('aura-internal');
    expect(registry.has('gmail')).toBe(false);
  });

  it('fails with a readable message for an unknown provider', () => {
    const registry = new MailProviderRegistry();
    expect(() => registry.get('gmail')).toThrow(/Unknown mail provider "gmail"/);
  });

  it('lets the engine send through any account without naming a vendor', async () => {
    const registry = new MailProviderRegistry();
    registry.register(new AuraInternalMailAdapter());
    registry.register(new ReadOnlyProbeAdapter());

    for (const provider of ['aura-internal', 'probe']) {
      const adapter = registry.get(provider);
      const result = await adapter.send(account({ provider }), draft());
      expect(result.sentAt).toBeTruthy();
    }
  });
});

describe('no credentials cross this seam', () => {
  it('the account reference carries identity and status, never secrets', () => {
    const keys = Object.keys(account());
    for (const forbidden of ['token', 'accessToken', 'refreshToken', 'clientSecret', 'password', 'webhookSecret']) {
      expect(keys).not.toContain(forbidden);
    }
    // What it does carry is enough to act, and useless if leaked.
    expect(keys).toEqual(expect.arrayContaining(['provider', 'externalAccountId', 'address', 'capabilities', 'status']));
  });
});

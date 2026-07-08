import { describe, it, expect } from 'vitest';
import { WebhookService } from './webhook.service';
import { InMemoryWebhookStore } from './in-memory-webhook-store';

const svc = (): WebhookService => new WebhookService(new InMemoryWebhookStore());

describe('WebhookService', () => {
  it('registers a subscription (active by default) and lists it', async () => {
    const s = svc();
    const sub = await s.register({ tenantId: 't1', url: 'https://x/hook', eventTypes: ['workflow.*'] });
    expect(sub.active).toBe(true);
    expect((await s.listSubscriptions('t1')).map((x) => x.id)).toEqual([sub.id]);
  });

  it('enables/disables a subscription', async () => {
    const s = svc();
    const sub = await s.register({ tenantId: 't1', url: 'https://x/hook', eventTypes: ['workflow.*'] });
    const off = await s.setActive(sub.id, false);
    expect(off?.active).toBe(false);
    expect((await s.listSubscriptions('t1'))[0].active).toBe(false);
    const on = await s.setActive(sub.id, true);
    expect(on?.active).toBe(true);
  });

  it('returns null toggling a missing subscription', async () => {
    expect(await svc().setActive('nope', false)).toBeNull();
  });
});

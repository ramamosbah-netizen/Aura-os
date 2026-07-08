import { describe, it, expect } from 'vitest';
import { FeatureFlagService } from './feature-flag.service';

const svc = (): FeatureFlagService => new FeatureFlagService(null); // in-memory

describe('FeatureFlagService', () => {
  it('honours the default and per-tenant overrides', async () => {
    const s = svc();
    await s.setFlag('new-ui', true, [{ tenantId: 't2', enabled: false }], 'The redesigned shell');
    expect(await s.isEnabled('new-ui', 't1')).toBe(true); // default
    expect(await s.isEnabled('new-ui', 't2')).toBe(false); // override
    expect(await s.isEnabled('unknown-flag', 't1')).toBe(false);
  });

  it('lists flags with description + default for the admin screen', async () => {
    const s = svc();
    await s.setFlag('new-ui', true, [], 'Redesigned shell');
    await s.setFlag('beta-ai', false, [{ tenantId: 't1', enabled: true }]);
    const flags = await s.listFlags();
    expect(flags.map((f) => f.flagKey).sort()).toEqual(['beta-ai', 'new-ui']);
    const ui = flags.find((f) => f.flagKey === 'new-ui')!;
    expect(ui.description).toBe('Redesigned shell');
    expect(ui.enabledDefault).toBe(true);
  });
});

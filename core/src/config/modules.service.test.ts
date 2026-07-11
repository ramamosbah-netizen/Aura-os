import { describe, it, expect } from 'vitest';
import { ModulesService } from './modules.service';
import { SettingsService } from './settings.service';

// Module Manager (Admin Center): the per-tenant module gate the PermissionsGuard
// consults synchronously on every request.

describe('ModulesService (module gates)', () => {
  it('everything is enabled by default; disable flips only that tenant + module', async () => {
    const svc = new ModulesService(null, new SettingsService(null));
    expect(svc.isEnabled('t1', 'fleet')).toBe(true);

    await svc.setEnabled('t1', 'fleet', false);
    expect(svc.isEnabled('t1', 'fleet')).toBe(false);
    expect(svc.isEnabled('t1', 'crm')).toBe(true);
    expect(svc.isEnabled('t2', 'fleet')).toBe(true); // tenant isolation
    expect(svc.disabledIds('t1')).toEqual(['fleet']);

    await svc.setEnabled('t1', 'fleet', true);
    expect(svc.isEnabled('t1', 'fleet')).toBe(true);
  });

  it('kernel surfaces are never gateable', async () => {
    const svc = new ModulesService(null, new SettingsService(null));
    expect(svc.isEnabled('t1', 'admin')).toBe(true);
    expect(svc.isEnabled('t1', 'workspace')).toBe(true);
    await expect(svc.setEnabled('t1', 'admin', false)).rejects.toThrow(/not a gateable module/);
  });

  it('persists the disabled set through the settings key (durable)', async () => {
    const settings = new SettingsService(null);
    const svc = new ModulesService(null, settings);
    await svc.setEnabled('t1', 'hse', false);
    await svc.setEnabled('t1', 'amc', false);
    expect(await settings.get('t1', 'modules.disabled')).toBe('amc,hse');
    await svc.setEnabled('t1', 'hse', true);
    expect(await settings.get('t1', 'modules.disabled')).toBe('amc');
  });
});

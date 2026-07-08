import { describe, it, expect } from 'vitest';
import { SettingsService } from './settings.service';

const svc = (): SettingsService => new SettingsService(null); // in-memory

describe('SettingsService', () => {
  it('sets, gets, and lists tenant settings', async () => {
    const s = svc();
    await s.set('t1', 'company.name', 'Acme Contracting', 'Legal entity name');
    await s.set('t1', 'finance.defaultCurrency', 'AED');
    expect(await s.get('t1', 'company.name')).toBe('Acme Contracting');
    const list = await s.list('t1');
    expect(list.map((x) => x.key).sort()).toEqual(['company.name', 'finance.defaultCurrency']);
    expect(list.find((x) => x.key === 'company.name')?.description).toBe('Legal entity name');
  });

  it('overwrites an existing key', async () => {
    const s = svc();
    await s.set('t1', 'k', 'v1');
    await s.set('t1', 'k', 'v2');
    expect(await s.get('t1', 'k')).toBe('v2');
    expect(await s.list('t1')).toHaveLength(1);
  });

  it('isolates tenants and removes keys', async () => {
    const s = svc();
    await s.set('t1', 'k', 'v');
    expect(await s.get('t2', 'k')).toBeNull();
    expect(await s.remove('t1', 'k')).toBe(true);
    expect(await s.get('t1', 'k')).toBeNull();
    expect(await s.remove('t1', 'missing')).toBe(false);
  });
});

import { describe, it, expect } from 'vitest';
import { assertSameTenant } from './tenant-guard';

const record = { tenantId: 'tenant-a', id: 'rec-1', balance: 5_000 };

describe('assertSameTenant', () => {
  it('returns the record when the tenant matches', () => {
    expect(assertSameTenant(record, 'tenant-a', 'petty cash fund', 'rec-1')).toBe(record);
  });

  it('refuses a record belonging to another tenant', () => {
    expect(() => assertSameTenant(record, 'tenant-b', 'petty cash fund', 'rec-1')).toThrow();
  });

  it('says "not found" rather than admitting the record exists', () => {
    // A caller from the wrong tenant must not be able to distinguish "does not exist" from
    // "exists but is not yours" — the message is the same either way, and maps to 404.
    const wrongTenant = (() => {
      try { assertSameTenant(record, 'tenant-b', 'petty cash fund', 'rec-1'); } catch (e) { return (e as Error).message; }
    })();
    const missing = (() => {
      try { assertSameTenant(null, 'tenant-b', 'petty cash fund', 'rec-1'); } catch (e) { return (e as Error).message; }
    })();
    expect(wrongTenant).toBe(missing);
    expect(wrongTenant).toMatch(/not found/);
  });

  it('throws for a missing record', () => {
    expect(() => assertSameTenant(null, 'tenant-a', 'cheque', 'c-9')).toThrow(/cheque c-9 not found/);
    expect(() => assertSameTenant(undefined, 'tenant-a', 'cheque', 'c-9')).toThrow(/not found/);
  });

  it('passes through when no tenant is bound — system and boot paths', () => {
    // Reactors and seeders run outside a request and have no tenant in context; they must not be
    // blocked by a check that has nothing to compare against.
    expect(assertSameTenant(record, null, 'petty cash fund', 'rec-1')).toBe(record);
    expect(assertSameTenant(record, undefined, 'petty cash fund', 'rec-1')).toBe(record);
  });

  it('still refuses a missing record even with no tenant bound', () => {
    expect(() => assertSameTenant(null, null, 'petty cash fund', 'rec-1')).toThrow(/not found/);
  });
});

import { describe, it, expect } from 'vitest';
import { FormOverridesService } from './form-overrides.service';
import { FormCustomValuesService } from './form-custom-values.service';

// Form Designer P2 — the draft/publish cycle (in-memory path; PG mirrors the same
// semantics in SQL): drafts never leak to the live read; publish promotes + versions.

describe('FormOverridesService draft/publish (P2)', () => {
  it('drafts never leak into the live (published) read', async () => {
    const svc = new FormOverridesService(null);
    await svc.setDraft('t1', 'hr.employee', { fields: {}, added: [{ name: 'cf_badge', label: 'Badge', kind: 'text' }] });

    expect(await svc.get('t1', 'hr.employee')).toBeNull(); // live untouched
    expect((await svc.getDraft('t1', 'hr.employee'))?.added?.[0].name).toBe('cf_badge');
    expect((await svc.status('t1', 'hr.employee')).hasDraft).toBe(true);
  });

  it('publish promotes the draft, bumps the version, and clears the draft flag', async () => {
    const svc = new FormOverridesService(null);
    await svc.setDraft('t1', 'hr.employee', { fields: { firstName: { label: 'Given name' } } });

    const version = await svc.publish('t1', 'hr.employee');
    expect(version).toBe(2);
    expect((await svc.get('t1', 'hr.employee'))?.fields.firstName?.label).toBe('Given name');
    expect((await svc.status('t1', 'hr.employee')).hasDraft).toBe(false);
    // The designer keeps working from the published patch once the draft is gone.
    expect((await svc.getDraft('t1', 'hr.employee'))?.fields.firstName?.label).toBe('Given name');
  });

  it('publishing with no draft is a no-op signal (null)', async () => {
    const svc = new FormOverridesService(null);
    expect(await svc.publish('t1', 'hr.employee')).toBeNull();
  });

  it('remove clears both channels', async () => {
    const svc = new FormOverridesService(null);
    await svc.setDraft('t1', 'x', { fields: { a: { hidden: true } } });
    await svc.publish('t1', 'x');
    await svc.setDraft('t1', 'x', { fields: { b: { hidden: true } } });
    await svc.remove('t1', 'x');
    expect(await svc.get('t1', 'x')).toBeNull();
    expect(await svc.getDraft('t1', 'x')).toBeNull();
  });
});

describe('FormCustomValuesService (P2)', () => {
  it('stores and reads per-record cf_* values, tenant-scoped', async () => {
    const svc = new FormCustomValuesService(null);
    await svc.save('t1', 'hr.employee', 'emp-1', { cf_badge: 'B-77' });
    expect(await svc.get('t1', 'hr.employee', 'emp-1')).toEqual({ cf_badge: 'B-77' });
    expect(await svc.get('t2', 'hr.employee', 'emp-1')).toEqual({});
    expect(await svc.get('t1', 'hr.employee', 'emp-2')).toEqual({});
  });

  it('empty value sets are not stored', async () => {
    const svc = new FormCustomValuesService(null);
    await svc.save('t1', 'x', 'r1', {});
    expect(await svc.get('t1', 'x', 'r1')).toEqual({});
  });
});

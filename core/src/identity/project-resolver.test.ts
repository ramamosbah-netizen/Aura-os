import { describe, expect, it, vi } from 'vitest';
import { ProjectResolverRegistry } from './project-resolver';

/**
 * The seam that lets an entity-addressed route be scoped to a project.
 *
 * What matters here is not that it resolves — it is what happens when it CANNOT. This runs on every
 * guarded request across six modules, so its failure behaviour is the whole risk: a resolver that
 * threw and took the request with it would turn a store hiccup into a 403 for someone an org grant
 * would have authorised anyway. It must fail to "unknown", loudly enough to notice.
 */
describe('ProjectResolverRegistry', () => {
  it('answers with the project a record belongs to', async () => {
    const registry = new ProjectResolverRegistry();
    registry.register('engineering', 'drawing', async (id) => (id === 'd-1' ? 'p-1' : null));

    expect(await registry.projectOf('engineering', 'drawing', 'd-1')).toBe('p-1');
    expect(await registry.projectOf('engineering', 'drawing', 'missing')).toBeNull();
  });

  it('answers null for an aggregate nobody registered, rather than guessing', async () => {
    const registry = new ProjectResolverRegistry();
    expect(registry.handles('quality', 'ncr')).toBe(false);
    expect(await registry.projectOf('quality', 'ncr', 'n-1')).toBeNull();
  });

  it('refuses a second owner for one aggregate', () => {
    const registry = new ProjectResolverRegistry();
    registry.register('site', 'daily-report', async () => 'p-1');
    // Whichever won would be arbitrary, and the losing module's records would resolve wrongly —
    // a composition mistake worth failing at boot rather than serving.
    expect(() => registry.register('site', 'daily-report', async () => 'p-2')).toThrow(/already registered/);
  });

  it('treats a throwing resolver as unknown, and says so', async () => {
    const registry = new ProjectResolverRegistry();
    registry.register('hse', 'incident', async () => {
      throw new Error('connection reset');
    });
    const warn = vi.spyOn((registry as unknown as { logger: { warn: (m: string) => void } }).logger, 'warn');

    // Not a rejection: the caller is the permission guard, and a store hiccup must not become a
    // failed authorisation for a user whose org grant authorises them regardless.
    await expect(registry.projectOf('hse', 'incident', 'i-1')).resolves.toBeNull();
    expect(warn).toHaveBeenCalledOnce();
    expect(warn.mock.calls[0][0]).toMatch(/connection reset/);
    // And it names the fallback, so a permanently broken resolver is not mistaken for a scoping rule.
    expect(warn.mock.calls[0][0]).toMatch(/org-scoped/);
  });

  it('lists what it holds, so coverage can be checked against the routes', () => {
    const registry = new ProjectResolverRegistry();
    registry.register('engineering', 'drawing', async () => null);
    registry.register('quality', 'ncr', async () => null);
    expect(registry.registered()).toEqual(['engineering:drawing', 'quality:ncr']);
  });
});

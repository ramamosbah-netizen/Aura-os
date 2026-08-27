import { describe, it, expect, beforeEach } from 'vitest';
import { SavedViewService, SavedViewAccessError } from './saved-view.service';
import { InMemorySavedViewStore } from './saved-view-store';

/**
 * Saved views — OWNERSHIP and UNIQUENESS.
 *
 * The negative controls are the point of this file. Before it, `GET /views` returned every user's
 * private views and the browser filtered them for display, while `DELETE /views/:id` deleted any of
 * them by id. Both are asserted here as refusals, from the service, with no UI involved.
 */

const TENANT = 't-views';
const ALICE = 'u-alice';
const BOB = 'u-bob';

describe('SavedViewService — ownership', () => {
  let store: InMemorySavedViewStore;
  let svc: SavedViewService;
  beforeEach(() => { store = new InMemorySavedViewStore(); svc = new SavedViewService(store); });

  const mine = (userId: string | null, over: Record<string, unknown> = {}) =>
    svc.create({ tenantId: TENANT, userId, label: 'Overdue', path: '/finance/invoices', query: 'status=overdue', ...over });

  it('NEGATIVE CONTROL: user A cannot LIST user B’s private view', async () => {
    await mine(BOB, { label: "Bob's private view", path: '/finance/invoices', query: 'owner=bob' });

    const asAlice = await svc.list(TENANT, ALICE);
    expect(asAlice).toHaveLength(0);
    // …and Bob still sees his own.
    expect(await svc.list(TENANT, BOB)).toHaveLength(1);
  });

  it('NEGATIVE CONTROL: user A cannot DELETE user B’s view even knowing its id', async () => {
    const bobs = await mine(BOB, { label: "Bob's private view" });

    await expect(svc.remove(TENANT, bobs.id, ALICE)).rejects.toThrow(SavedViewAccessError);
    // Still there, for its owner.
    expect(await svc.list(TENANT, BOB)).toHaveLength(1);
    // And Bob himself can remove it.
    await svc.remove(TENANT, bobs.id, BOB);
    expect(await svc.list(TENANT, BOB)).toHaveLength(0);
  });

  it('a TENANT-WIDE view is visible to everyone but deletable by no one from here', async () => {
    const shared = await mine(null, { label: 'Team: overdue' });

    expect(await svc.list(TENANT, ALICE)).toHaveLength(1);   // shared, so Alice sees it…
    expect(await svc.list(TENANT, BOB)).toHaveLength(1);     // …and so does Bob
    // …but appearing on your screen is not ownership.
    await expect(svc.remove(TENANT, shared.id, ALICE)).rejects.toThrow(/shared view cannot be deleted/i);
    expect(await svc.list(TENANT, ALICE)).toHaveLength(1);
  });

  it('the refusal does not reveal WHOSE view an id is', async () => {
    const bobs = await mine(BOB);
    const shared = await mine(null, { path: '/finance/invoices', query: 'shared=1' });
    const a = await svc.remove(TENANT, bobs.id, ALICE).catch((e: Error) => e.message);
    const b = await svc.remove(TENANT, shared.id, ALICE).catch((e: Error) => e.message);
    // Both say "Access denied"; neither names an owner.
    expect(a).toMatch(/access denied/i);
    expect(b).toMatch(/access denied/i);
    expect(a).not.toMatch(new RegExp(BOB, 'i'));
  });

  it('deleting something that is not in this tenant is a silent no-op, not a 403 oracle', async () => {
    await expect(svc.remove(TENANT, 'no-such-id', ALICE)).resolves.toBeUndefined();
  });

  it('an anonymous viewer sees shared views only', async () => {
    await mine(ALICE);
    await mine(null, { label: 'Team', query: 'shared=1' });
    const anon = await svc.list(TENANT, null);
    expect(anon).toHaveLength(1);
    expect(anon[0].userId).toBeNull();
  });
});

describe('SavedViewService — uniqueness and the favourite toggle', () => {
  let svc: SavedViewService;
  beforeEach(() => { svc = new SavedViewService(new InMemorySavedViewStore()); });

  const fav = (over: Record<string, unknown> = {}) =>
    svc.favorite({ tenantId: TENANT, userId: ALICE, label: 'Invoices', path: '/finance/invoices', query: '', ...over });

  it('favourite is a TOGGLE: on, then off — never two rows', async () => {
    const on = await fav();
    expect(on.favorited).toBe(true);
    expect((await svc.list(TENANT, ALICE))).toHaveLength(1);

    const off = await fav();
    expect(off.favorited).toBe(false);
    expect(await svc.list(TENANT, ALICE)).toHaveLength(0);
  });

  it('re-saving the same route+query RENAMES rather than duplicating', async () => {
    await svc.create({ tenantId: TENANT, userId: ALICE, label: 'First', path: '/x', query: 'a=1' });
    await svc.create({ tenantId: TENANT, userId: ALICE, label: 'Second', path: '/x', query: 'a=1' });

    const views = await svc.list(TENANT, ALICE);
    expect(views).toHaveLength(1);          // the DB's unique index says the same thing
    expect(views[0].label).toBe('Second');  // a label change is a rename, not a new view
  });

  it('the leading "?" is stripped, so a saved view and its favourite are the same row', async () => {
    await svc.create({ tenantId: TENANT, userId: ALICE, label: 'Filtered', path: '/x', query: '?a=1' });
    await svc.create({ tenantId: TENANT, userId: ALICE, label: 'Filtered again', path: '/x', query: 'a=1' });
    expect(await svc.list(TENANT, ALICE)).toHaveLength(1);
  });

  it('EXACT-string, NOT semantic: reordered params are different views, and we do not pretend otherwise', async () => {
    // Documented honestly rather than silently: nothing canonicalises a querystring, so the
    // constraint cannot claim these are the same view. If canonicalisation lands, this test changes.
    await svc.create({ tenantId: TENANT, userId: ALICE, label: 'One', path: '/x', query: 'a=1&b=2' });
    await svc.create({ tenantId: TENANT, userId: ALICE, label: 'Two', path: '/x', query: 'b=2&a=1' });
    expect(await svc.list(TENANT, ALICE)).toHaveLength(2);
  });

  it('two users may each favourite the same page — uniqueness is PER OWNER', async () => {
    await fav();
    await svc.favorite({ tenantId: TENANT, userId: BOB, label: 'Invoices', path: '/finance/invoices', query: '' });
    expect(await svc.list(TENANT, ALICE)).toHaveLength(1);
    expect(await svc.list(TENANT, BOB)).toHaveLength(1);
  });
});

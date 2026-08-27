import { Inject, Injectable } from '@nestjs/common';
import { SAVED_VIEW_STORE, type NewSavedView, type SavedView, type SavedViewStore, makeSavedView } from './saved-view-store';

/** Raised when a viewer tries to reach a saved view that is not theirs to see or delete. */
export class SavedViewAccessError extends Error {
  constructor(message: string) {
    super(message); // "Access denied" classifies to 403 in the API error taxonomy.
    this.name = 'SavedViewAccessError';
  }
}

/**
 * Saved views — named route+query bookmarks, private to a user or shared across the tenant.
 *
 * OWNERSHIP IS ENFORCED HERE, server-side. It used to live in the browser: `GET /views` returned
 * every user's private views and `/my-work/favorites` filtered them for display, while
 * `DELETE /views/:id` deleted any of them by id. Anyone who knew an id — or simply read the list
 * response — could see or delete a colleague's view.
 *
 * A FAVOURITE IS NOT A NEW CONCEPT: it is a SavedView for the current page. `favorite()` is
 * therefore a toggle over the same rows, and it de-duplicates against the database rather than
 * trusting the UI to have hidden the button.
 */
@Injectable()
export class SavedViewService {
  constructor(@Inject(SAVED_VIEW_STORE) private readonly store: SavedViewStore) {}

  async create(input: NewSavedView): Promise<SavedView> {
    // Same identity the unique index enforces: one saved view per viewer per exact route+query.
    // Re-saving is a rename, not a second row — the DB would refuse the duplicate anyway, and
    // failing there would surface as a 500 rather than the intended behaviour.
    const existing = await this.findExact(input.tenantId, input.userId ?? null, input.path, input.query ?? '');
    if (existing) {
      const renamed: SavedView = { ...existing, label: makeSavedView(input).label };
      await this.store.save(renamed);
      return renamed;
    }
    const v = makeSavedView(input);
    await this.store.save(v);
    return v;
  }

  /** Tenant-wide views plus the viewer's own. Never another user's private view. */
  list(tenantId: string, viewerId: string | null, path?: string): Promise<SavedView[]> {
    return this.store.list(tenantId, viewerId, path);
  }

  /**
   * Delete, having PROVEN ownership first.
   *
   * A private view belongs to one user. A tenant-wide view (`userId === null`) is shared state, so
   * removing it is refused here rather than allowed because it happened to appear on someone's
   * screen — that needs an explicit administrative decision, which this service does not grant.
   */
  async remove(tenantId: string, id: string, viewerId: string | null): Promise<void> {
    const existing = await this.store.get(tenantId, id);
    // Absent, or not this tenant's — nothing to delete, and nothing to reveal. The store already
    // scopes by tenant in SQL; this restates it here so the ownership decision below is provably
    // made about a row from the caller's own tenant, rather than trusting a query one layer down.
    if (!existing || existing.tenantId !== tenantId) return;
    if (existing.userId === null) {
      throw new SavedViewAccessError('Access denied: a shared view cannot be deleted from here');
    }
    if (existing.userId !== viewerId) {
      // Deliberately the same message as above: a caller must not learn whose view an id belongs to.
      throw new SavedViewAccessError('Access denied: this saved view belongs to another user');
    }
    await this.store.remove(tenantId, id);
  }

  /**
   * Toggle the current page as a favourite. Returns what the page now is, so the caller renders the
   * opposite action without a second round trip.
   */
  async favorite(input: NewSavedView & { userId: string }): Promise<{ favorited: boolean; view: SavedView | null }> {
    // The store owns the transaction/lock because only it can make the read/decide/write atomic
    // across API instances. Keeping that guarantee below the service prevents a double-click race
    // from becoming a duplicate row or a 500 response.
    return this.store.toggleFavorite(makeSavedView(input));
  }

  /**
   * The exact-match lookup the unique index mirrors.
   *
   * EXACT STRING, not semantic: `?a=1&b=2` and `?b=2&a=1` are different rows here and in the index,
   * because nothing in this system canonicalises a querystring. Claiming semantic uniqueness would
   * be claiming a normalisation that does not exist.
   */
  private async findExact(tenantId: string, userId: string | null, path: string, query: string): Promise<SavedView | null> {
    if (userId === null) return null;
    const normalisedPath = path.trim();
    const normalisedQuery = query.replace(/^\?/, '');
    return this.store.findExact(tenantId, userId, normalisedPath, normalisedQuery);
  }
}

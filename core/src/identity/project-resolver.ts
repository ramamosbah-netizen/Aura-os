import { Injectable, Logger } from '@nestjs/common';
import type { Id } from '@aura/shared';

/**
 * Entity → project, for routes that address a record by its own id.
 *
 * ## The problem this exists to solve
 *
 * `PermissionsGuard` can scope a request to a project only when the project is knowable from the
 * request itself — a `:projectId` param, or `projectId` in the body or query. Most of the delivery
 * surface is not shaped that way: `POST engineering/drawings/:id/submit`,
 * `PUT quality/ncrs/:id/verify`, `POST commissioning/records/:id/commission` and 120 others name
 * the record and nothing else. Those fell through to an org-wide grant, which failed in BOTH
 * directions at once:
 *
 *   • an org-grant holder could act on any project's records, and
 *   • a project MEMBER could act on none, not even their own project's, because a project-scoped
 *     grant has nothing to match when the access target carries no resource.
 *
 * The alternative to this seam was 123 hand-written checks, one per route, each able to be
 * forgotten independently. This is the "later slice resolves entity→project" the guard's own
 * comment promised.
 *
 * ## Why resolving is STRICTLY better than trusting the route
 *
 * A project taken from the URL can lie: a member of A who learns an id belonging to B can ask for
 * it under A, and the guard would find a valid grant. A project resolved from the RECORD cannot —
 * it is the project the row actually has. The URL stops being an input to the decision.
 *
 * ## Purely additive, deliberately
 *
 * Stamping a resource never removes an authorisation: an org grant matches by `orgPath` and ignores
 * the resource entirely (`scopeContains`), so everyone authorised before stays authorised. What
 * changes is that a project-scoped grant now matches on its own project — and only its own.
 *
 * An unresolvable id (unknown entity, deleted row, a record with no project) yields `null` and the
 * request behaves exactly as it did before. That is the right failure direction for a seam added
 * beneath a live surface: it can admit the people it was meant to admit, and it cannot lock out
 * anyone it was not asked to.
 */
export type ProjectOf = (id: Id) => Promise<Id | null>;

@Injectable()
export class ProjectResolverRegistry {
  private readonly logger = new Logger('ProjectResolver');
  /** `module:entity` → the lookup that answers which project a record belongs to. */
  private readonly resolvers = new Map<string, ProjectOf>();

  /**
   * Register the lookup for one aggregate. Called by each module at boot — the module owns its
   * stores, the guard owns the decision, and neither reaches into the other (ADR-0004).
   *
   * `entity` is the SINGULAR form the guard derives from the route (`drawings` → `drawing`), so a
   * registration and the route it serves cannot drift apart by spelling.
   */
  register(moduleId: string, entity: string, resolve: ProjectOf): void {
    const key = `${moduleId}:${entity}`;
    if (this.resolvers.has(key)) {
      // Two owners for one aggregate is a composition mistake, not a runtime condition to tolerate:
      // whichever won would be arbitrary, and the losing module's records would resolve wrongly.
      throw new Error(`ProjectResolverRegistry: '${key}' is already registered`);
    }
    this.resolvers.set(key, resolve);
  }

  /** Is anything registered for this aggregate? Lets the guard skip the await entirely. */
  handles(moduleId: string, entity: string): boolean {
    return this.resolvers.has(`${moduleId}:${entity}`);
  }

  /**
   * The project a record belongs to, or null.
   *
   * A resolver that throws is treated as "unknown" rather than allowed to fail the request: this
   * runs on every guarded call, and a store hiccup must not turn an authorisation check into a 500
   * for a user whose org grant would have authorised them anyway. The throw is logged, because a
   * resolver failing silently and permanently would quietly restore the old behaviour.
   */
  async projectOf(moduleId: string, entity: string, id: Id): Promise<Id | null> {
    const resolve = this.resolvers.get(`${moduleId}:${entity}`);
    if (!resolve) return null;
    try {
      return await resolve(id);
    } catch (err) {
      this.logger.warn(
        `resolving ${moduleId}:${entity} ${id} failed (${err instanceof Error ? err.message : String(err)}) — ` +
          'the request falls back to org-scoped authorisation',
      );
      return null;
    }
  }

  /** Registered aggregates, for the fitness test that checks coverage against the routes. */
  registered(): string[] {
    return [...this.resolvers.keys()].sort();
  }
}

import { Injectable } from '@nestjs/common';
import type { Id, OrgLevel, OrgNode } from '@aura/shared';

/**
 * Holds the org tree (`Tenant → Company → Business Unit → Department → Team`) and
 * resolves the ancestor chain used for access scope-containment. Phase 0b is
 * in-memory; the Postgres-backed impl follows in a later increment.
 */
@Injectable()
export class OrgService {
  private readonly nodes = new Map<Id, OrgNode>();

  upsert(node: OrgNode): void {
    this.nodes.set(node.id, node);
  }

  get(id: Id): OrgNode | undefined {
    return this.nodes.get(id);
  }

  /** Ancestor→self chain (tenant first) — pass this as an AccessTarget's `orgPath`. */
  orgPath(nodeId: Id): Array<{ level: OrgLevel; id: Id }> {
    const chain: Array<{ level: OrgLevel; id: Id }> = [];
    const seen = new Set<Id>();
    let cur = this.nodes.get(nodeId);
    while (cur && !seen.has(cur.id)) {
      seen.add(cur.id);
      chain.unshift({ level: cur.level, id: cur.id });
      cur = cur.parentId ? this.nodes.get(cur.parentId) : undefined;
    }
    return chain;
  }
}

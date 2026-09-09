import type { Id } from '@aura/shared';

/**
 * §22 Step 2B — the authored planning network: what a task needs, and what must come first.
 *
 * Separate from `schedule.ts` because these are AUTHORED PLANNING INPUT, and the gate is explicit
 * that input, computed proposal and current plan must not merge into one shape. A task's dates are
 * where it currently sits; its duration and its predecessors are what a person decided, and they
 * survive every rescheduling.
 */

/**
 * A finish-to-start edge: the predecessor must finish before the successor starts.
 *
 * There is no `type` and no `lag`. The planner supports finish-to-start only, so an enum with one
 * member would be a vocabulary the engine cannot honour and a field every reader must be told to
 * ignore. When the engine gains SS/FF/SF, the column and the enum arrive together.
 */
export interface ScheduleDependency {
  id: Id;
  tenantId: Id;
  projectId: Id;
  scheduleId: Id;
  predecessorTaskId: Id;
  successorTaskId: Id;
}

export interface NewScheduleDependency {
  predecessorTaskId: Id;
  successorTaskId: Id;
}

/** An edge, reduced to what the graph rules care about. */
type Edge = Pick<ScheduleDependency, 'predecessorTaskId' | 'successorTaskId'>;

/**
 * Find a cycle, if there is one, and name it.
 *
 * A GRAPH invariant, which is why it lives here and not in a database trigger: judging it needs the
 * whole edge set, and a recursive trigger firing on every insert would be expensive, hard to reason
 * about, and a second implementation of a rule the domain already owns. What the schema refuses is
 * what a single row can be judged on — an edge from a task to itself, a duplicate edge, and an
 * endpoint in another project.
 *
 * Returns the offending path so the refusal can say WHICH tasks form the loop; a bare "cycle
 * detected" leaves someone reading a hundred-task network with nowhere to start.
 */
export function findDependencyCycle(edges: readonly Edge[]): Id[] | null {
  const successors = new Map<Id, Id[]>();
  for (const e of edges) {
    const list = successors.get(e.predecessorTaskId) ?? [];
    list.push(e.successorTaskId);
    successors.set(e.predecessorTaskId, list);
  }
  // Sorted so the reported path is deterministic for a given edge set.
  for (const [, list] of successors) list.sort();

  const state = new Map<Id, 0 | 1 | 2>();
  const stack: Id[] = [];
  let found: Id[] | null = null;

  const visit = (node: Id): boolean => {
    const s = state.get(node) ?? 0;
    if (s === 2) return false;
    if (s === 1) {
      // Trim the stack to the loop itself, so the path starts where it closes.
      found = [...stack.slice(stack.indexOf(node)), node];
      return true;
    }
    state.set(node, 1);
    stack.push(node);
    for (const next of successors.get(node) ?? []) if (visit(next)) return true;
    stack.pop();
    state.set(node, 2);
    return false;
  };

  for (const node of [...successors.keys()].sort()) if (visit(node)) break;
  return found;
}

export interface DependencyValidation {
  ok: boolean;
  /** Stated in the words the refusal should use. */
  reason?: string;
}

/**
 * Validate a proposed dependency set against the tasks that exist.
 *
 * Everything here is refused rather than repaired. A dependency naming a task that is not in this
 * schedule is not a hint to create one, and a cycle is not something to break by dropping an edge
 * the author did not choose.
 */
export function validateDependencies(
  taskIds: readonly Id[],
  edges: readonly Edge[],
): DependencyValidation {
  const known = new Set(taskIds);
  for (const e of edges) {
    if (e.predecessorTaskId === e.successorTaskId) {
      return { ok: false, reason: `a task cannot depend on itself (${e.predecessorTaskId})` };
    }
    if (!known.has(e.predecessorTaskId)) {
      return { ok: false, reason: `dependency predecessor ${e.predecessorTaskId} is not a task in this schedule` };
    }
    if (!known.has(e.successorTaskId)) {
      return { ok: false, reason: `dependency successor ${e.successorTaskId} is not a task in this schedule` };
    }
  }
  const seen = new Set<string>();
  for (const e of edges) {
    const key = `${e.predecessorTaskId}>${e.successorTaskId}`;
    if (seen.has(key)) {
      return { ok: false, reason: `duplicate dependency ${e.predecessorTaskId} → ${e.successorTaskId}` };
    }
    seen.add(key);
  }
  const cycle = findDependencyCycle(edges);
  if (cycle) {
    return { ok: false, reason: `schedule dependency cycle: ${cycle.join(' → ')}` };
  }
  return { ok: true };
}

import { type Id, newId } from '../domain/id';

// Framework-free workflow model — a generic state machine ANY module drives
// (PO approval, contract sign-off, NCR disposition). The kernel owns the engine;
// modules only supply a definition + drive instances. No module hard-codes a flow.

export type WorkflowStatus = 'open' | 'completed' | 'cancelled';

export interface WorkflowTransition {
  from: string;
  to: string;
  action: string;
  /** If set, the actor must hold this permission — enforced by WorkflowService via AccessService. */
  permission?: string;
}

export interface WorkflowDefinition {
  id: Id;
  /** Stable definition key, e.g. 'po.approval'. */
  key: string;
  name: string;
  /** null = global (all tenants); otherwise tenant-scoped. */
  tenantId: Id | null;
  initialState: string;
  states: string[];
  /** States that complete the instance. Empty → any state with no outgoing transition is terminal. */
  terminalStates: string[];
  transitions: WorkflowTransition[];
  version: number;
}

export interface WorkflowHistoryEntry {
  from: string;
  to: string;
  action: string;
  actorId: Id | null;
  at: string;
  note: string | null;
}

export interface WorkflowInstance {
  id: Id;
  definitionKey: string;
  tenantId: Id;
  companyId: Id | null;
  /** What this instance governs, e.g. 'procurement.po' : 'po-123'. */
  aggregateType: string;
  aggregateId: Id;
  currentState: string;
  status: WorkflowStatus;
  history: WorkflowHistoryEntry[];
  createdBy: Id | null;
  createdAt: string;
  updatedAt: string;
}

export interface NewWorkflowDefinition {
  key: string;
  name: string;
  tenantId?: Id | null;
  initialState: string;
  states: string[];
  terminalStates?: string[];
  transitions: WorkflowTransition[];
  version?: number;
}

export function makeWorkflowDefinition(input: NewWorkflowDefinition): WorkflowDefinition {
  return {
    id: newId(),
    key: input.key,
    name: input.name,
    tenantId: input.tenantId ?? null,
    initialState: input.initialState,
    states: input.states,
    terminalStates: input.terminalStates ?? [],
    transitions: input.transitions,
    version: input.version ?? 1,
  };
}

export interface NewWorkflowInstance {
  tenantId: Id;
  companyId?: Id | null;
  aggregateType: string;
  aggregateId: Id;
  createdBy?: Id | null;
}

export function makeWorkflowInstance(def: WorkflowDefinition, input: NewWorkflowInstance): WorkflowInstance {
  const now = new Date().toISOString();
  return {
    id: newId(),
    definitionKey: def.key,
    tenantId: input.tenantId,
    companyId: input.companyId ?? null,
    aggregateType: input.aggregateType,
    aggregateId: input.aggregateId,
    currentState: def.initialState,
    status: 'open',
    history: [],
    createdBy: input.createdBy ?? null,
    createdAt: now,
    updatedAt: now,
  };
}

/** A state is terminal if it's listed, or (when none are listed) has no outgoing transition. */
export function isTerminal(def: WorkflowDefinition, state: string): boolean {
  if (def.terminalStates.length > 0) return def.terminalStates.includes(state);
  return !def.transitions.some((t) => t.from === state);
}

/** Actions available from the instance's current state (empty once it's closed). */
export function availableActions(def: WorkflowDefinition, instance: WorkflowInstance): WorkflowTransition[] {
  if (instance.status !== 'open') return [];
  return def.transitions.filter((t) => t.from === instance.currentState);
}

export interface TransitionCheck {
  ok: boolean;
  reason: string;
  transition?: WorkflowTransition;
}

/** Pure structural validity of an action against an instance (no access checks). */
export function checkTransition(def: WorkflowDefinition, instance: WorkflowInstance, action: string): TransitionCheck {
  if (instance.status !== 'open') return { ok: false, reason: `instance is ${instance.status}` };
  const t = def.transitions.find((x) => x.from === instance.currentState && x.action === action);
  if (!t) return { ok: false, reason: `no transition "${action}" from "${instance.currentState}"` };
  if (!def.states.includes(t.to)) return { ok: false, reason: `target state "${t.to}" not declared` };
  return { ok: true, reason: 'ok', transition: t };
}

/** Apply a validated transition, returning the next instance (pure — completes on a terminal state). */
export function applyTransition(
  def: WorkflowDefinition,
  instance: WorkflowInstance,
  t: WorkflowTransition,
  actorId: Id | null,
  note?: string | null,
): WorkflowInstance {
  const now = new Date().toISOString();
  const entry: WorkflowHistoryEntry = { from: instance.currentState, to: t.to, action: t.action, actorId, at: now, note: note ?? null };
  return {
    ...instance,
    currentState: t.to,
    status: isTerminal(def, t.to) ? 'completed' : instance.status,
    history: [...instance.history, entry],
    updatedAt: now,
  };
}

/** Workflow event types emitted on the spine. */
export const WORKFLOW_EVENT = {
  started: 'workflow.instance.started',
  transitioned: 'workflow.instance.transitioned',
  completed: 'workflow.instance.completed',
  cancelled: 'workflow.instance.cancelled',
} as const;

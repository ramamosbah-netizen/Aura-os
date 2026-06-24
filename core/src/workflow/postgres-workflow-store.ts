import type { Pool } from 'pg';
import type {
  Id,
  WorkflowDefinition,
  WorkflowHistoryEntry,
  WorkflowInstance,
  WorkflowStatus,
  WorkflowTransition,
} from '@aura/shared';
import type { WorkflowInstanceFilter, WorkflowStore } from './workflow-store';

interface DefRow {
  id: string;
  key: string;
  tenant_id: string;
  name: string;
  initial_state: string;
  states: string[];
  terminal_states: string[];
  transitions: WorkflowTransition[];
  version: number;
}

interface InstRow {
  id: string;
  definition_key: string;
  tenant_id: string;
  company_id: string | null;
  aggregate_type: string;
  aggregate_id: string;
  current_state: string;
  status: string;
  history: WorkflowHistoryEntry[];
  created_by: string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

const iso = (v: Date | string): string => (v instanceof Date ? v.toISOString() : String(v));

function rowToDef(r: DefRow): WorkflowDefinition {
  return {
    id: r.id,
    key: r.key,
    tenantId: r.tenant_id === '' ? null : r.tenant_id,
    name: r.name,
    initialState: r.initial_state,
    states: r.states,
    terminalStates: r.terminal_states,
    transitions: r.transitions,
    version: r.version,
  };
}

function rowToInst(r: InstRow): WorkflowInstance {
  return {
    id: r.id,
    definitionKey: r.definition_key,
    tenantId: r.tenant_id,
    companyId: r.company_id,
    aggregateType: r.aggregate_type,
    aggregateId: r.aggregate_id,
    currentState: r.current_state,
    status: r.status as WorkflowStatus,
    history: r.history ?? [],
    createdBy: r.created_by,
    createdAt: iso(r.created_at),
    updatedAt: iso(r.updated_at),
  };
}

const INST_COLS =
  'id, definition_key, tenant_id, company_id, aggregate_type, aggregate_id, current_state, status, history, created_by, created_at, updated_at';

/** Durable workflow store on Postgres (`aura_workflow_definitions` + `aura_workflow_instances`). */
export class PostgresWorkflowStore implements WorkflowStore {
  constructor(private readonly pool: Pool) {}

  async saveDefinition(def: WorkflowDefinition): Promise<void> {
    await this.pool.query(
      `INSERT INTO public.aura_workflow_definitions
         (id, key, tenant_id, name, initial_state, states, terminal_states, transitions, version)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (key, tenant_id) DO UPDATE SET
         name = EXCLUDED.name, initial_state = EXCLUDED.initial_state, states = EXCLUDED.states,
         terminal_states = EXCLUDED.terminal_states, transitions = EXCLUDED.transitions, version = EXCLUDED.version`,
      [
        def.id,
        def.key,
        def.tenantId ?? '',
        def.name,
        def.initialState,
        JSON.stringify(def.states),
        JSON.stringify(def.terminalStates),
        JSON.stringify(def.transitions),
        def.version,
      ],
    );
  }

  async getDefinition(key: string, tenantId?: Id | null): Promise<WorkflowDefinition | null> {
    // Prefer the tenant-scoped definition; fall back to the global ('') one.
    const res = await this.pool.query<DefRow>(
      `SELECT id, key, tenant_id, name, initial_state, states, terminal_states, transitions, version
         FROM public.aura_workflow_definitions
        WHERE key = $1 AND tenant_id IN ($2, '')
        ORDER BY tenant_id DESC LIMIT 1`,
      [key, tenantId ?? ''],
    );
    return res.rows.length ? rowToDef(res.rows[0]) : null;
  }

  async createInstance(i: WorkflowInstance): Promise<void> {
    await this.pool.query(
      `INSERT INTO public.aura_workflow_instances (${INST_COLS}) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [
        i.id,
        i.definitionKey,
        i.tenantId,
        i.companyId,
        i.aggregateType,
        i.aggregateId,
        i.currentState,
        i.status,
        JSON.stringify(i.history),
        i.createdBy,
        i.createdAt,
        i.updatedAt,
      ],
    );
  }

  async updateInstance(i: WorkflowInstance): Promise<void> {
    await this.pool.query(
      `UPDATE public.aura_workflow_instances
          SET current_state = $2, status = $3, history = $4, updated_at = $5
        WHERE id = $1`,
      [i.id, i.currentState, i.status, JSON.stringify(i.history), i.updatedAt],
    );
  }

  async getInstance(id: Id): Promise<WorkflowInstance | null> {
    const res = await this.pool.query<InstRow>(
      `SELECT ${INST_COLS} FROM public.aura_workflow_instances WHERE id = $1`,
      [id],
    );
    return res.rows.length ? rowToInst(res.rows[0]) : null;
  }

  async listInstances(filter: WorkflowInstanceFilter = {}): Promise<WorkflowInstance[]> {
    const where: string[] = [];
    const params: unknown[] = [];
    const add = (col: string, val?: string): void => {
      if (val) {
        params.push(val);
        where.push(`${col} = $${params.length}`);
      }
    };
    add('tenant_id', filter.tenantId);
    add('definition_key', filter.definitionKey);
    add('aggregate_type', filter.aggregateType);
    add('aggregate_id', filter.aggregateId);
    add('status', filter.status);
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    params.push(filter.limit ?? 100);
    const res = await this.pool.query<InstRow>(
      `SELECT ${INST_COLS} FROM public.aura_workflow_instances ${whereSql} ORDER BY created_at DESC LIMIT $${params.length}`,
      params,
    );
    return res.rows.map(rowToInst);
  }
}

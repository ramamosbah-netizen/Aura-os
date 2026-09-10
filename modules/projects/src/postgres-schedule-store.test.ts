import { describe, it, expect } from 'vitest';
import type { Pool } from 'pg';
import { PostgresScheduleStore } from './postgres-schedule-store';
import {
  makeProjectSchedule,
  setScheduleDependencies,
  type ProjectSchedule,
} from './domain/schedule';

/**
 * AURA-PM-004 — a schedule save must be ONE transaction.
 *
 * `writeTasks` deletes every task row for the schedule before re-inserting them, and that DELETE
 * cascades the schedule's requirements and dependencies with it. The defect these tests pin was
 * running that sequence on the pool, where each statement auto-commits: the DELETE landed alone, so
 * a failure or crash before the re-inserts left the schedule with no tasks — permanently, on an
 * ordinary edit.
 *
 * The fix wraps the row write and `writeTasks` in one transaction on a single checked-out client.
 * These tests exercise the real store against a fake pool that records the exact statement order, so
 * the boundary is asserted deterministically without a database: the DELETE and every re-insert live
 * inside a transaction that COMMITs whole, and a mid-save failure ROLLs the whole thing BACK — the
 * DELETE included — rather than auto-committing it. The live-DB proof
 * (`schedule-store-atomicity.pg-int.test.ts`) then shows the prior rows actually survive; that is
 * Postgres honouring the boundary these tests establish.
 */

interface Recorded {
  sql: string;
  params: unknown[];
}

/** A checked-out client that records every statement and can be told to fail on one of them. */
class FakeClient {
  released = false;
  releaseArg: unknown = undefined;
  constructor(
    private readonly log: Recorded[],
    private readonly failOn: (sql: string) => boolean,
  ) {}

  async query(sql: string, params: unknown[] = []): Promise<{ rows: unknown[] }> {
    this.log.push({ sql, params });
    if (this.failOn(sql)) throw new Error(`simulated failure on: ${sql.trim().split('\n')[0]}`);
    return { rows: [] };
  }

  release(arg?: unknown): void {
    this.released = true;
    this.releaseArg = arg;
  }
}

/**
 * A pool whose `connect()` hands out a recording client. Its own `query()` — the auto-committing
 * path the defect used — records separately, so a test can assert a mutation NEVER went through it.
 */
class FakePool {
  readonly txLog: Recorded[] = [];
  readonly directQueries: Recorded[] = [];
  readonly clients: FakeClient[] = [];
  constructor(private readonly failOn: (sql: string) => boolean = () => false) {}

  async connect(): Promise<FakeClient> {
    const client = new FakeClient(this.txLog, this.failOn);
    this.clients.push(client);
    return client;
  }

  async query(sql: string, params: unknown[] = []): Promise<{ rows: unknown[] }> {
    this.directQueries.push({ sql, params });
    return { rows: [] };
  }
}

const has = (log: Recorded[], needle: string): boolean => log.some((r) => r.sql.includes(needle));
const indexOf = (log: Recorded[], needle: string): number => log.findIndex((r) => r.sql.includes(needle));

function scheduleWithNetwork(): ProjectSchedule {
  const base = makeProjectSchedule({
    tenantId: 'pm004-tenant',
    projectId: '11111111-0000-4000-8000-000000000001',
    projectName: 'PM-004 proof',
    tasks: [
      { id: '22222222-0000-4000-8000-000000000002', name: 'Rough-in', plannedStart: '2026-03-02', plannedEnd: '2026-03-06' },
      {
        id: '33333333-0000-4000-8000-000000000003',
        name: 'Pull cables',
        plannedStart: '2026-03-09',
        plannedEnd: '2026-03-13',
        requirements: [
          { resource: { resourceType: 'pool', canonicalResourceId: '44444444-0000-4000-8000-000000000004' }, quantity: 4, unit: 'persons' },
        ],
      },
    ],
  });
  // A finish-to-start edge so writeTasks also emits a dependency INSERT — the statement the failure
  // test trips on, precisely because it is issued AFTER the DELETE and the task/requirement inserts.
  return setScheduleDependencies(base, [
    { predecessorTaskId: '22222222-0000-4000-8000-000000000002', successorTaskId: '33333333-0000-4000-8000-000000000003' },
  ]);
}

describe('PostgresScheduleStore — AURA-PM-004 save atomicity', () => {
  it('create wraps the row write, DELETE and every re-insert in one committed transaction', async () => {
    const pool = new FakePool();
    const store = new PostgresScheduleStore(pool as unknown as Pool);

    await store.create(scheduleWithNetwork());

    const log = pool.txLog;
    // Exactly one client checked out, and it was released.
    expect(pool.clients).toHaveLength(1);
    expect(pool.clients[0].released).toBe(true);

    // The whole save is bracketed by BEGIN … COMMIT, and never rolled back.
    expect(log[0].sql).toBe('BEGIN');
    expect(log[log.length - 1].sql).toBe('COMMIT');
    expect(has(log, 'ROLLBACK')).toBe(false);

    // Every mutation lands between BEGIN and COMMIT.
    const begin = 0;
    const commit = log.length - 1;
    for (const stmt of [
      'INSERT INTO public.aura_projects_schedules',
      'DELETE FROM public.aura_projects_schedule_tasks',
      'INSERT INTO public.aura_projects_schedule_tasks', // the task re-insert (DELETE uses DELETE FROM)
      'aura_projects_task_requirements',
      'aura_projects_schedule_dependencies',
    ]) {
      const at = indexOf(log, stmt);
      expect(at, `"${stmt}" must be issued`).toBeGreaterThan(begin);
      expect(at, `"${stmt}" must be before COMMIT`).toBeLessThan(commit);
    }

    // The DELETE precedes the re-inserts — the whole reason it must not auto-commit on its own.
    expect(indexOf(log, 'DELETE FROM public.aura_projects_schedule_tasks'))
      .toBeLessThan(indexOf(log, 'aura_projects_schedule_dependencies'));

    // Nothing was routed through the auto-committing pool.query path.
    expect(pool.directQueries).toHaveLength(0);
  });

  it('rolls the entire save back — DELETE included — when a later statement fails', async () => {
    // Fail on the dependency INSERT: it is issued after the DELETE and the task/requirement inserts,
    // so a store that auto-committed would already have destroyed the task rows by the time it threw.
    const pool = new FakePool((sql) => sql.includes('aura_projects_schedule_dependencies'));
    const store = new PostgresScheduleStore(pool as unknown as Pool);

    await expect(store.update(scheduleWithNetwork())).rejects.toThrow(/simulated failure/);

    const log = pool.txLog;
    // The transaction was opened, the DELETE was issued inside it, and then it was rolled back —
    // never committed. Because the DELETE shares the rolled-back transaction, Postgres discards it,
    // so the schedule keeps the tasks it had. That is the data-loss the defect caused.
    expect(has(log, 'BEGIN')).toBe(true);
    expect(has(log, 'DELETE FROM public.aura_projects_schedule_tasks')).toBe(true);
    expect(has(log, 'ROLLBACK')).toBe(true);
    expect(has(log, 'COMMIT')).toBe(false);
    expect(indexOf(log, 'DELETE FROM public.aura_projects_schedule_tasks'))
      .toBeLessThan(indexOf(log, 'ROLLBACK'));

    // The DELETE never took the auto-committing path, and the client was released after the failure.
    expect(pool.directQueries).toHaveLength(0);
    expect(pool.clients[0].released).toBe(true);
  });
});

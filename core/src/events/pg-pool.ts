import { Pool, types } from 'pg';
import { readSecret } from '@aura/shared';

/** DI token for the shared pg Pool (or null when there's no DATABASE_URL). */
export const PG_POOL = Symbol('PG_POOL');

/**
 * Builds a pg Pool from DATABASE_URL (secret seam — `DATABASE_URL_FILE` works for
 * vault/secret mounts), or returns null when it's absent — letting the kernel fall
 * back to the in-memory event store so the API still boots with no database (dev /
 * CI). `new Pool` is lazy (no socket until first query), so an unreachable DB never
 * blocks bootstrap. Supabase needs SSL; localhost and `?sslmode=disable` (compose /
 * CI service containers) do not.
 */
/**
 * A SQL `date` is a calendar day: no time, no zone. node-postgres parses OID 1082 into a JS `Date`
 * at LOCAL midnight, so any UTC-based formatting afterwards moves it — `2026-08-16` read on a
 * UTC+4 host becomes `2026-08-15T20:00Z`, and `toISOString().split('T')[0]` reports the 15th. The
 * stores look careful about it (`row.date instanceof Date ? row.date.toISOString()… : String(…)`),
 * which is exactly what made it silent: the defensive branch is the one that loses the day.
 *
 * Measured: a site daily report stored as `2026-08-16` was served by the API as `2026-08-15`, and
 * the browser suite failed on a date that was never wrong in the database. In-memory stores keep
 * the original string, so this could only ever be seen against PostgreSQL.
 *
 * Returning the string as-is makes the driver agree with the domain, which has always treated a
 * calendar day as `YYYY-MM-DD`.
 */
const PG_DATE_OID = 1082;
types.setTypeParser(PG_DATE_OID, (value: string) => value);

export function createPgPool(): Pool | null {
  const connectionString = readSecret('DATABASE_URL');
  if (!connectionString) return null;
  const isLocal = /(@|\/\/)(localhost|127\.0\.0\.1)/.test(connectionString);
  const sslOff = isLocal || /[?&]sslmode=disable/.test(connectionString);
  const pool = new Pool({
    connectionString,
    max: Number(process.env.DATABASE_POOL_MAX ?? 5),
    ssl: sslOff ? false : { rejectUnauthorized: false },
  });
  // A dropped connection must never kill the API. Managed Postgres recycles idle connections,
  // fails over, and drops sockets on network blips; Node makes an unhandled 'error' event fatal.
  // Both listeners below are required — they cover DIFFERENT clients, which is easy to miss:
  //
  //   1. pool.on('error')   — fires for a client sitting IDLE IN THE POOL. pg attaches its own
  //                           listener to idle clients and forwards their errors here.
  //                           Crash signature: "Emitted 'error' event on BoundPool instance".
  //
  //   2. pool.on('connect') — pg REMOVES that idle listener when a client is checked out, so a
  //                           checked-out client sitting between queries (the outbox relay holds
  //                           one across reactor processing) has NO listener and its error is
  //                           fatal. Postgres reports such a connection as `idle`, so it is a
  //                           prime target for server-side termination.
  //                           Crash signature: "Emitted 'error' event on Client instance".
  //
  // Both were reproduced against real Postgres by terminating idle backends; (1) alone still died.
  // Logging is the correct response: pg discards the dead client and the next checkout reconnects.
  pool.on('error', (err) => {
    console.error(`[pg] idle client error (pool recovers on next checkout): ${err.message}`);
  });
  pool.on('connect', (client) => {
    client.on('error', (err: Error) => {
      console.error(`[pg] client error (connection discarded, next query reconnects): ${err.message}`);
    });
  });
  return pool;
}

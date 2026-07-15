import { Pool } from 'pg';
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

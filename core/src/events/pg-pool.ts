import { Pool } from 'pg';

/** DI token for the shared pg Pool (or null when there's no DATABASE_URL). */
export const PG_POOL = Symbol('PG_POOL');

/**
 * Builds a pg Pool from DATABASE_URL, or returns null when it's absent — letting
 * the kernel fall back to the in-memory event store so the API still boots with no
 * database (dev / CI). `new Pool` is lazy (no socket until first query), so an
 * unreachable DB never blocks bootstrap. Supabase needs SSL; localhost does not.
 */
export function createPgPool(): Pool | null {
  const connectionString = process.env.DATABASE_URL?.trim();
  if (!connectionString) return null;
  const isLocal = /(@|\/\/)(localhost|127\.0\.0\.1)/.test(connectionString);
  return new Pool({
    connectionString,
    max: Number(process.env.DATABASE_POOL_MAX ?? 5),
    ssl: isLocal ? false : { rejectUnauthorized: false },
  });
}

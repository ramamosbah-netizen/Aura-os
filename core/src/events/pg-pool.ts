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
  return new Pool({
    connectionString,
    max: Number(process.env.DATABASE_POOL_MAX ?? 5),
    ssl: sslOff ? false : { rejectUnauthorized: false },
  });
}

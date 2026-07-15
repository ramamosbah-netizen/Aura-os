import { EventEmitter } from 'node:events';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { createPgPool } from './pg-pool';

// The failure this guards against is not a query error — it is an IDLE client dying (managed
// Postgres recycling a connection, a failover, a blip). node-postgres emits that on the POOL, and
// an unhandled 'error' event is fatal in Node: the whole API exits. Observed in dev as
// "Connection terminated unexpectedly" → "throw er; // Unhandled 'error' event".
describe('createPgPool — an idle client error must not kill the process', () => {
  const OLD = process.env.DATABASE_URL;
  afterEach(() => {
    if (OLD === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = OLD;
    vi.restoreAllMocks();
  });

  it('returns null with no DATABASE_URL (in-memory dev/test) — no pool, nothing to guard', () => {
    delete process.env.DATABASE_URL;
    expect(createPgPool()).toBeNull();
  });

  it('registers an error listener, so the emit is absorbed instead of thrown', () => {
    // Lazy pool: `new Pool` opens no socket, so this never touches a real database.
    process.env.DATABASE_URL = 'postgres://u:p@localhost:5432/nonexistent_db_for_test';
    const pool = createPgPool();
    expect(pool).not.toBeNull();

    // Without a listener, EventEmitter re-throws 'error' — this line would take the process down.
    expect(pool!.listenerCount('error')).toBeGreaterThan(0);

    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() => pool!.emit('error', new Error('Connection terminated unexpectedly'), {} as never)).not.toThrow();
    expect(logged).toHaveBeenCalledOnce();
    expect(String(logged.mock.calls[0]?.[0])).toContain('Connection terminated unexpectedly');

    void pool!.end().catch(() => undefined);
  });

  it('guards a CHECKED-OUT client too — pg drops its idle listener on checkout', () => {
    // The pool-level listener alone is not enough: pg removes its idle handler when a client is
    // checked out, so a client held between queries (the outbox relay does exactly this during
    // reactor processing) has no listener and its error is fatal. Reproduced against real
    // Postgres — the pool-only fix still crashed with "Emitted 'error' event on Client instance".
    process.env.DATABASE_URL = 'postgres://u:p@localhost:5432/nonexistent_db_for_test';
    const pool = createPgPool()!;
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    // Simulate pg handing a fresh client to the pool's 'connect' subscribers.
    const client = new EventEmitter();
    pool.emit('connect', client as never);
    expect(client.listenerCount('error')).toBeGreaterThan(0);
    expect(() => client.emit('error', new Error('Connection terminated unexpectedly'))).not.toThrow();
    expect(String(logged.mock.calls[0]?.[0])).toContain('client error');

    void pool.end().catch(() => undefined);
  });
});

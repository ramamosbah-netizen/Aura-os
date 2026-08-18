// S2 verification — auth_sessions (migration 0235) under the PRODUCTION role.
//
// Runs as `aura_app` (NOBYPASSRLS, non-owner) against the CI PostgreSQL service container with
// SEPARATE connections. The boundary's cache + validate logic is proven in the unit/e2e suites
// (in-memory); this proves the DB layer the boundary rests on: RLS tenant isolation, that
// revocation is tenant-scoped and single-effect under contention, and that absolute expiry is a
// property of the row, not of the app.
//
// Gates:
//   (A) role is non-bypass.
//   (B) RLS scoping: no tenant → denied · tenant A → visible · tenant B → A's session invisible.
//   (C) revoke is tenant-scoped: tenant B cannot revoke tenant A's session; tenant A can.
//   (D) concurrent revoke is single-effect: two racers on one live session → exactly one wins,
//       repeated many times.
//   (E) absolute expiry: a session past expires_at is not "live" even though revoked_at is null.
//   (F) revokeAllForUser: one statement ends every live session for a user, leaving others.

import pg from 'pg';
import { randomUUID } from 'node:crypto';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is required (point it at the aura_app role).');
  process.exit(2);
}
const sslOff = /(@|\/\/)(localhost|127\.0\.0\.1)/.test(url) || /[?&]sslmode=disable/.test(url);
const ssl = sslOff ? false : { rejectUnauthorized: false };

const TENANT_A = 'sess-tenant-a';
const TENANT_B = 'sess-tenant-b';
const RACES = 25;

let failures = 0;
function check(ok, label) {
  console.log(`${ok ? 'OK  ' : 'FAIL'}  ${label}`);
  if (!ok) failures++;
}

function newClient() {
  return new pg.Client({ connectionString: url, ssl });
}
async function bind(client, tenant) {
  await client.query(`SELECT set_config('app.current_tenant_id', $1, false)`, [tenant]);
}
async function seedSession(client, { id, tenant, user = 'u-sess', ttlMs = 12 * 60 * 60 * 1000 }) {
  const expiresAt = Date.now() + ttlMs;
  await client.query(
    `INSERT INTO public.auth_sessions
       (id, tenant_id, user_id, credential_id, created_at, last_seen_at, idle_timeout_seconds, expires_at, revoked_at, revoked_reason)
     VALUES ($1, $2, $3, $4, now(), NULL, NULL, to_timestamp($5 / 1000.0), NULL, NULL)`,
    [id, tenant, user, randomUUID(), expiresAt],
  );
}
// The boundary's liveness predicate.
function liveCount(client, tenant, id) {
  return client
    .query(
      `SELECT id FROM public.auth_sessions
         WHERE tenant_id = $1 AND id = $2 AND revoked_at IS NULL AND expires_at > now()`,
      [tenant, id],
    )
    .then((r) => r.rowCount);
}
// The revoke statement.
function revoke(client, tenant, id) {
  return client.query(
    `UPDATE public.auth_sessions SET revoked_at = now(), revoked_reason = 'test'
       WHERE tenant_id = $1 AND id = $2 AND revoked_at IS NULL RETURNING id`,
    [tenant, id],
  );
}

async function main() {
  const seed = newClient();
  await seed.connect();
  await bind(seed, TENANT_A);

  const { rows: role } = await seed.query(
    `SELECT rolbypassrls OR rolsuper AS bypass, current_user AS who FROM pg_roles WHERE rolname = current_user`,
  );
  check(role[0]?.bypass === false, `runtime role ${role[0]?.who} cannot bypass RLS`); // (A)

  // (B) RLS scoping
  const sid = randomUUID();
  await seedSession(seed, { id: sid, tenant: TENANT_A });
  const probe = newClient();
  await probe.connect();
  await bind(probe, '');
  check((await probe.query(`SELECT id FROM public.auth_sessions WHERE id = $1`, [sid])).rowCount === 0, 'no tenant context → session access denied');
  await bind(probe, TENANT_A);
  check((await probe.query(`SELECT id FROM public.auth_sessions WHERE id = $1`, [sid])).rowCount === 1, 'tenant A → its own session is visible');
  await bind(probe, TENANT_B);
  check((await probe.query(`SELECT id FROM public.auth_sessions WHERE id = $1`, [sid])).rowCount === 0, "tenant B → tenant A's session is invisible");
  await probe.end();

  // (C) revoke is tenant-scoped
  const cTarget = randomUUID();
  await seedSession(seed, { id: cTarget, tenant: TENANT_A });
  const bClient = newClient();
  await bClient.connect();
  await bind(bClient, TENANT_B);
  check((await revoke(bClient, TENANT_A, cTarget)).rowCount === 0, 'tenant B cannot revoke tenant A\'s session');
  await bClient.end();
  check((await revoke(seed, TENANT_A, cTarget)).rowCount === 1, 'tenant A revokes its own session');
  check((await liveCount(seed, TENANT_A, cTarget)) === 0, '…and the revoked session is no longer live');

  // (D) concurrent revoke is single-effect
  const c1 = newClient();
  const c2 = newClient();
  await c1.connect();
  await c2.connect();
  await bind(c1, TENANT_A);
  await bind(c2, TENANT_A);
  let raceOk = true;
  for (let i = 0; i < RACES; i++) {
    const id = randomUUID();
    await seedSession(seed, { id, tenant: TENANT_A });
    const [a, b] = await Promise.all([revoke(c1, TENANT_A, id), revoke(c2, TENANT_A, id)]);
    if (a.rowCount + b.rowCount !== 1) {
      raceOk = false;
      console.log(`  revoke race ${i}: ${a.rowCount} + ${b.rowCount} winners (expected 1)`);
    }
  }
  check(raceOk, `${RACES} concurrent revokes each took effect exactly once`);
  await c1.end();
  await c2.end();

  // (E) absolute expiry
  const expired = randomUUID();
  await seedSession(seed, { id: expired, tenant: TENANT_A, ttlMs: -1000 });
  check((await liveCount(seed, TENANT_A, expired)) === 0, 'a session past its absolute expiry is not live (revoked_at still null)');

  // (F) revokeAllForUser
  const bulkUser = 'u-bulk';
  for (let i = 0; i < 3; i++) await seedSession(seed, { id: randomUUID(), tenant: TENANT_A, user: bulkUser });
  const keep = randomUUID();
  await seedSession(seed, { id: keep, tenant: TENANT_A, user: 'u-keep' });
  const bulk = await seed.query(
    `UPDATE public.auth_sessions SET revoked_at = now(), revoked_reason = 'sign-out-everywhere'
       WHERE tenant_id = $1 AND user_id = $2 AND revoked_at IS NULL RETURNING id`,
    [TENANT_A, bulkUser],
  );
  check(bulk.rowCount === 3, 'revokeAllForUser ends every live session for the user (3)');
  check((await liveCount(seed, TENANT_A, keep)) === 1, "…and leaves another user's session live");

  await seed.end();

  if (failures > 0) {
    console.error(`\n✗ ${failures} auth_sessions verification gate(s) failed under aura_app.`);
    process.exit(1);
  }
  console.log('\n✓ auth_sessions RLS scoping + tenant-scoped single-effect revocation verified under aura_app.');
}

main().catch((err) => {
  console.error(`auth-session-verify crashed: ${err.message}`);
  process.exit(1);
});

// S2 verification — auth_challenges (migration 0235) under the PRODUCTION role.
//
// Runs as `aura_app` (NOBYPASSRLS, non-owner) against the CI PostgreSQL service container, using
// SEPARATE physical connections so the concurrency gate is a genuine two-transaction race — not a
// single-connection simulation. PGlite can prove the SQL compiles; only this can prove the atomic
// DELETE … RETURNING is single-winner under real contention and that RLS scopes every path.
//
// Acceptance gates proven here:
//   (2) RLS scoping: no tenant → denied · tenant A → visible · tenant B → A's challenge invisible.
//   (3) Two concurrent consumers of one valid challenge → exactly one DELETE … RETURNING wins.
//   (4) The race is repeated many times to cut the chance of a false-green.
//   (5) wrong kind · expired · wrong tenant · already-consumed → no claim (0 rows), never a session.
//
// Gates (1) full-chain apply and RLS fitness ENABLE+FORCE+policy, (8) idempotent rerun + rollback,
// and (7) the auth suite are covered by other CI steps.

import pg from 'pg';
import { randomUUID } from 'node:crypto';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is required (point it at the aura_app role).');
  process.exit(2);
}
const sslOff = /(@|\/\/)(localhost|127\.0\.0\.1)/.test(url) || /[?&]sslmode=disable/.test(url);
const ssl = sslOff ? false : { rejectUnauthorized: false };

const TENANT_A = 'chal-tenant-a';
const TENANT_B = 'chal-tenant-b';
const RACES = 50;

let failures = 0;
function check(ok, label) {
  console.log(`${ok ? 'OK  ' : 'FAIL'}  ${label}`);
  if (!ok) failures++;
}

function newClient() {
  return new pg.Client({ connectionString: url, ssl });
}

async function bind(client, tenant) {
  // Session-level GUC (is_local=false): the RLS policies read app.current_tenant_id.
  await client.query(`SELECT set_config('app.current_tenant_id', $1, false)`, [tenant]);
}

async function seedChallenge(client, { id, tenant, kind = 'mfa', user = 'u-chal', ttlMs = 300000 }) {
  const expiresAt = Date.now() + ttlMs;
  await client.query(
    `INSERT INTO public.auth_challenges
       (id, tenant_id, kind, user_id, credential_id, must_change_password, attempts, expires_at, created_at)
     VALUES ($1, $2, $3, $4, $5, false, 0, to_timestamp($6 / 1000.0), now())`,
    [id, tenant, kind, user, randomUUID(), expiresAt],
  );
}

// The exact consume the store issues.
function consume(client, tenant, id, kind) {
  return client.query(
    `DELETE FROM public.auth_challenges
       WHERE tenant_id = $1 AND id = $2 AND kind = $3 AND expires_at > now() RETURNING id`,
    [tenant, id, kind],
  );
}

async function main() {
  const seed = newClient();
  await seed.connect();
  await bind(seed, TENANT_A);

  // Confirm we really are non-bypass (mirrors the R1 activation proof).
  const { rows: role } = await seed.query(
    `SELECT rolbypassrls OR rolsuper AS bypass, current_user AS who FROM pg_roles WHERE rolname = current_user`,
  );
  check(role[0]?.bypass === false, `runtime role ${role[0]?.who} cannot bypass RLS`);

  // ---- Gate 2: RLS scoping -------------------------------------------------------------------
  const scopedId = randomUUID();
  await seedChallenge(seed, { id: scopedId, tenant: TENANT_A });

  const probe = newClient();
  await probe.connect();

  await bind(probe, ''); // no tenant context
  let r = await probe.query(`SELECT id FROM public.auth_challenges WHERE id = $1`, [scopedId]);
  check(r.rowCount === 0, 'no tenant context → challenge access denied');

  await bind(probe, TENANT_A);
  r = await probe.query(`SELECT id FROM public.auth_challenges WHERE id = $1`, [scopedId]);
  check(r.rowCount === 1, 'tenant A → its own challenge is visible');

  await bind(probe, TENANT_B);
  r = await probe.query(`SELECT id FROM public.auth_challenges WHERE id = $1`, [scopedId]);
  check(r.rowCount === 0, "tenant B → tenant A's challenge is invisible");
  await probe.end();

  // ---- Gates 3 + 4: genuine concurrent race, repeated ---------------------------------------
  const c1 = newClient();
  const c2 = newClient();
  await c1.connect();
  await c2.connect();
  await bind(c1, TENANT_A);
  await bind(c2, TENANT_A);

  let raceOk = true;
  for (let i = 0; i < RACES; i++) {
    const id = randomUUID();
    await seedChallenge(seed, { id, tenant: TENANT_A });
    // Fire both consumes on SEPARATE connections at once — a real two-transaction race.
    const [a, b] = await Promise.all([consume(c1, TENANT_A, id, 'mfa'), consume(c2, TENANT_A, id, 'mfa')]);
    const winners = a.rowCount + b.rowCount;
    if (winners !== 1) {
      raceOk = false;
      console.log(`  race ${i}: ${a.rowCount} + ${b.rowCount} = ${winners} winners (expected exactly 1)`);
    }
  }
  check(raceOk, `${RACES} concurrent races each produced exactly one winner`);
  await c1.end();
  await c2.end();

  // ---- Gate 5: wrong kind · expired · wrong tenant · already-consumed → no claim -------------
  const wrongKindId = randomUUID();
  await seedChallenge(seed, { id: wrongKindId, tenant: TENANT_A, kind: 'mfa' });
  let d = await consume(seed, TENANT_A, wrongKindId, 'password_change');
  check(d.rowCount === 0, 'wrong kind → no claim');
  d = await consume(seed, TENANT_A, wrongKindId, 'mfa');
  check(d.rowCount === 1, '…and the mfa challenge itself is still claimable exactly once');

  const expiredId = randomUUID();
  await seedChallenge(seed, { id: expiredId, tenant: TENANT_A, ttlMs: -1000 }); // already past
  d = await consume(seed, TENANT_A, expiredId, 'mfa');
  check(d.rowCount === 0, 'expired challenge → no claim');

  const wrongTenantId = randomUUID();
  await seedChallenge(seed, { id: wrongTenantId, tenant: TENANT_A });
  const other = newClient();
  await other.connect();
  await bind(other, TENANT_B);
  d = await consume(other, TENANT_A, wrongTenantId, 'mfa'); // RLS blocks it from TENANT_B's session
  check(d.rowCount === 0, 'wrong tenant → no claim (RLS)');
  await other.end();

  const twiceId = randomUUID();
  await seedChallenge(seed, { id: twiceId, tenant: TENANT_A });
  const first = await consume(seed, TENANT_A, twiceId, 'mfa');
  const second = await consume(seed, TENANT_A, twiceId, 'mfa');
  check(first.rowCount === 1 && second.rowCount === 0, 'already-consumed → second attempt makes no claim');

  await seed.end();

  if (failures > 0) {
    console.error(`\n✗ ${failures} auth_challenges verification gate(s) failed under aura_app.`);
    process.exit(1);
  }
  console.log('\n✓ auth_challenges RLS scoping + concurrent single-use verified under aura_app.');
}

main().catch((err) => {
  console.error(`auth-challenge-verify crashed: ${err.message}`);
  process.exit(1);
});

// S2 verification — opaque refresh rotation + replay containment, through the RUNNING API on real
// PostgreSQL under aura_app. This drives the ACTUAL rotate transaction (SELECT … FOR UPDATE over
// the refresh-token/session aggregate) over HTTP, not a re-implementation — so the concurrency
// proof is of the real code path, under FORCE RLS as the production role.
//
// Gates:
//   (A) sequential chain: login → rotate → A2 works → replay R1 → 401, R2 → 401 (family contained),
//       A2 → protected 401 (session revoked by the containment). The full chain, once.
//   (B) R1 || R1 raced many times: exactly one rotation wins and one is a replay; after which the
//       winner's R2 is unusable and its A2 is rejected at the sid boundary. Repeats reduce a
//       false-green concurrency pass.

import pg from 'pg';
import { createHash } from 'node:crypto';

const API = process.env.API_URL || 'http://localhost:4500';
const USER = process.env.AUTH_USER;
const PASS = process.env.AUTH_PASS;
const DIAG_DB = process.env.DIAG_DATABASE_URL; // aura_app URL — reproduces the rotate SELECTs directly
const RACES = 15;

// Reproduce the rotate transaction's SELECTs against the DB (as aura_app), printing each result to
// THIS script's stdout (CI captures it line-by-line, unlike the API's file-redirected logs). Shows
// exactly why a rotation denies: token missing/state, session ineligible, or user row absent.
async function diagnose(refreshToken) {
  if (!DIAG_DB) return;
  const c = new pg.Client({ connectionString: DIAG_DB, ssl: false });
  try {
    await c.connect();
    await c.query(`SELECT set_config('app.current_tenant_id','dev-tenant',false)`);
    const hash = createHash('sha256').update(refreshToken, 'utf8').digest('hex');
    const r1 = await c.query(
      `SELECT id, session_id, state, (expires_at <= now()) AS expired FROM public.auth_refresh_tokens WHERE token_hash=$1`,
      [hash],
    );
    console.log(`DIAG refresh_token rows=${r1.rowCount} ${JSON.stringify(r1.rows[0] || null)}`);
    if (r1.rows[0]) {
      try {
        const ses = await c.query(
          `SELECT user_id, revoked_at,
                  (expires_at <= now()) AS expired,
                  (now() - COALESCE(last_seen_at, created_at) > make_interval(secs => COALESCE(idle_timeout_seconds, 3600))) AS idle
             FROM public.auth_sessions WHERE id=$1`,
          [r1.rows[0].session_id],
        );
        console.log(`DIAG session rows=${ses.rowCount} ${JSON.stringify(ses.rows[0] || null)}`);
        const u = await c.query(`SELECT active FROM public.aura_users WHERE user_id=$1`, [ses.rows[0]?.user_id]);
        console.log(`DIAG aura_users rows=${u.rowCount} ${JSON.stringify(u.rows[0] || null)}`);
      } catch (e) {
        console.log(`DIAG session/user query ERROR: ${e.message}`);
      }
    }
  } catch (e) {
    console.log(`DIAG connect/query ERROR: ${e.message}`);
  } finally {
    await c.end().catch(() => {});
  }
}

if (!USER || !PASS) {
  console.error('AUTH_USER and AUTH_PASS are required.');
  process.exit(2);
}

let failures = 0;
function check(ok, label) {
  console.log(`${ok ? 'OK  ' : 'FAIL'}  ${label}`);
  if (!ok) failures++;
}

async function login() {
  const res = await fetch(`${API}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: USER, password: PASS }),
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, access: body.token, refresh: body.refreshToken };
}

async function rotate(refreshToken) {
  const res = await fetch(`${API}/api/v1/auth/refresh`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  });
  const deny = res.headers.get('x-refresh-deny');
  if (deny) console.log(`DIAG rotate denied: ${deny}`);
  const body = res.ok ? await res.json().catch(() => ({})) : null;
  return { status: res.status, access: body?.token, refresh: body?.refreshToken };
}

async function protectedStatus(access) {
  const res = await fetch(`${API}/api/v1/crm/accounts`, { headers: { authorization: `Bearer ${access}` } });
  return res.status;
}

async function main() {
  // ── (A) the sequential chain ────────────────────────────────────────────────────────────────
  const first = await login();
  check(first.status === 200 && !!first.access && !!first.refresh, 'login returns an access token and an opaque refresh token');

  await diagnose(first.refresh); // ground truth: what does the DB hold for this token/session/user?

  const rot = await rotate(first.refresh);
  check(rot.status === 200 && !!rot.refresh && rot.refresh !== first.refresh, 'rotate: fresh access + NEW refresh token issued');
  check((await protectedStatus(rot.access)) === 200, 'the rotated access token authorises a protected route');

  check((await rotate(first.refresh)).status === 401, 'replaying the consumed R1 is refused (401)');
  check((await rotate(rot.refresh)).status === 401, 'the successor R2 is dead — family contained (401)');
  check((await protectedStatus(rot.access)) !== 200, 'the session was revoked by containment — A2 rejected at the sid boundary');

  // ── (B) genuine R1 || R1 race, repeated ─────────────────────────────────────────────────────
  let raceOk = true;
  for (let i = 0; i < RACES; i++) {
    const fresh = await login();
    const [a, b] = await Promise.all([rotate(fresh.refresh), rotate(fresh.refresh)]);
    const codes = [a.status, b.status].sort();
    if (codes[0] !== 200 || codes[1] !== 401) {
      raceOk = false;
      console.log(`  race ${i}: statuses ${a.status} + ${b.status} (expected one 200 + one 401)`);
      continue;
    }
    const winner = a.status === 200 ? a : b;
    // The losing replay contained the family and revoked the session, so the winner's tokens are dead.
    if ((await rotate(winner.refresh)).status !== 401) {
      raceOk = false;
      console.log(`  race ${i}: winner R2 still rotatable (expected 401)`);
    }
    if ((await protectedStatus(winner.access)) === 200) {
      raceOk = false;
      console.log(`  race ${i}: winner A2 still authorised (session should be revoked)`);
    }
  }
  check(raceOk, `${RACES} × (R1 || R1) → one rotation, one replay, family+session contained, R2 & A2 unusable`);

  if (failures > 0) {
    console.error(`\n✗ ${failures} refresh-rotation gate(s) failed under aura_app.`);
    process.exit(1);
  }
  console.log('\n✓ opaque refresh rotation + replay containment verified under aura_app on real PostgreSQL.');
}

main().catch((err) => {
  console.error(`auth-refresh-verify crashed: ${err.message}`);
  process.exit(1);
});

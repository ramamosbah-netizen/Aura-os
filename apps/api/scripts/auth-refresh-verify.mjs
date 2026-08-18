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

const API = process.env.API_URL || 'http://localhost:4500';
const USER = process.env.AUTH_USER;
const PASS = process.env.AUTH_PASS;
const RACES = 15;

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

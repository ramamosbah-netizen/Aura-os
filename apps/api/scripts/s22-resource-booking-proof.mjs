// §22 Step 6 — resource bookings: database proof.
//
// A booking is the third of the four facts the gate insists never collapse (Demand ≠ Capacity ≠
// Booking ≠ Actual), and the one that carries the temporal invariant:
//
//   > A booking is valid AT CREATION only if capacity was available at that time. A later
//   > availability change does not rewrite history [...] it changes the booking's CURRENT
//   > FEASIBILITY and creates a visible resource conflict requiring resolution.
//
// So the proof has to establish two things the schema cannot say in a CHECK: that the commitment
// snapshot is immutable, and that today's verdict is DERIVED — which means demonstrating that
// capacity can change underneath a booking, the verdict flips, and the row does not move.
//
// Usage:  node s22-resource-booking-proof.mjs <repo>/apps/api
import { readFileSync } from 'node:fs';
import { config } from 'dotenv';
import pg from 'pg';

const apiRoot = process.argv[2];
config({ path: `${apiRoot}/.env.local` });
const envOrFile = (n) => {
  const f = process.env[`${n}_FILE`]?.trim();
  if (f) return readFileSync(f, 'utf8').trim() || null;
  return process.env[n]?.trim() || null;
};
const ownerUrl = envOrFile('MIGRATION_DATABASE_URL') ?? envOrFile('DATABASE_URL');
const appPassword = process.env.LOCAL_APP_PASSWORD?.trim() || 'aura_app_local';
const appUrl = ownerUrl.replace(/\/\/[^@]+@/, `//aura_app:${encodeURIComponent(appPassword)}@`);

const say = (s = '') => console.log(s);
let failures = 0;
const check = (ok, label, detail = '') => {
  if (!ok) failures++;
  say(`${ok ? '  ✓' : '  ✗'} ${label}${detail ? ` — ${detail}` : ''}`);
  return ok;
};

const owner = new pg.Client({ connectionString: ownerUrl });
await owner.connect();
const { rows: marker } = await owner
  .query('select marker from public.aura_environment limit 1').catch(() => ({ rows: [] }));
if (marker[0]?.marker !== 'e2e-disposable') {
  console.error('✗ refusing to run: this database carries no e2e-disposable marker.');
  process.exit(1);
}
const setTenant = (c, t) => c.query(`select set_config('app.current_tenant_id',$1,false)`, [t ?? '']);
const refused = async (c, sql, params) => {
  try { await c.query(sql, params); return null; } catch (e) { return e.message; }
};

const T = 's22f-tenant';
const OTHER = 's22f-other';
const pA = 'a2000000-0000-4000-8000-00000000000a';
const pB = 'b2000000-0000-4000-8000-00000000000b';
const CRANE = 'CR-01';

const cleanup = async () => {
  for (const t of [T, OTHER]) {
    await setTenant(owner, t);
    await owner.query('delete from public.aura_projects_resource_bookings where tenant_id=$1', [t]).catch(() => {});
    await owner.query('delete from public.aura_projects_resource_capacity where tenant_id=$1', [t]).catch(() => {});
    await owner.query('delete from public.aura_projects_projects where id = any($1::uuid[])', [[pA, pB]]).catch(() => {});
  }
  await setTenant(owner, null);
};
await cleanup();

say('# §22 Step 6 — resource booking proof');
say();
say(`_Generated ${new Date().toISOString()} against the disposable database._`);
say();
const { rows: mig } = await owner.query(
  'select count(*)::int as applied, max(filename) as head from public.aura_migrations');
say('## Migration chain');
say(`Applied from zero: **${mig[0].applied}** · head \`${mig[0].head}\``);
say();

await setTenant(owner, T);
for (const [pid, title] of [[pA, 'Project A'], [pB, 'Project B']]) {
  await owner.query(
    `insert into public.aura_projects_projects (id, tenant_id, title, status) values ($1,$2,$3,'planned')`,
    [pid, T, title]);
}

const COLS = `(tenant_id, project_id, task_id, resource_type, canonical_resource_id, unit, quantity,
               valid_from, valid_to, status, capacity_at_commitment, demand_at_commitment,
               over_capacity_reason, released_reason, released_at)`;
const VALS = '($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)';
const row = (o = {}) => [
  o.tenant ?? T, o.project ?? pA, o.task ?? null, o.type ?? 'asset', o.resource ?? CRANE,
  o.unit ?? 'units', o.quantity ?? 1, o.from ?? '2026-07-06', o.to ?? '2026-07-08', o.status ?? 'held',
  o.capacity === undefined ? 2 : o.capacity, o.demand ?? 1,
  o.overReason ?? null, o.relReason ?? null, o.relAt ?? null,
];
const book = (o) => owner.query(
  `insert into public.aura_projects_resource_bookings ${COLS} values ${VALS} returning id`, row(o));
const bookRefused = (o) => refused(owner,
  `insert into public.aura_projects_resource_bookings ${COLS} values ${VALS}`, row(o));

say('## 1. Current feasibility is NOT a column');
// The schema's single most important decision, and the only one that cannot be proven by trying to
// violate it — a column that does not exist rejects nothing. It is proven by enumeration instead.
const { rows: cols } = await owner.query(`
  select column_name from information_schema.columns
   where table_schema='public' and table_name='aura_projects_resource_bookings'
   order by ordinal_position`);
const names = cols.map((c) => c.column_name);
const verdictish = names.filter((n) => /feasib|conflict|available|overallocat/.test(n));
check(verdictish.length === 0,
  'no column stores a feasibility verdict — it is derived on every read, never remembered',
  verdictish.length ? `found ${verdictish.join(', ')}` : `${names.length} columns, none of them a verdict`);
check(names.includes('capacity_at_commitment') && names.includes('demand_at_commitment'),
  'the COMMITMENT SNAPSHOT is stored — what was known when the promise was made');
say();

say('## 2. The temporal invariant, demonstrated');
// A crane: two of them available all week, one booked by Project A. It fits.
await owner.query(
  `insert into public.aura_projects_resource_capacity
     (tenant_id, resource_type, canonical_resource_id, unit, quantity, valid_from, valid_to)
   values ($1,'asset',$2,'units',2,'2026-07-01','2026-07-31')`, [T, CRANE]);
const { rows: made } = await book({ capacity: 2, demand: 1 });
const bookingId = made[0].id;

// The query the cross-project engine will make: everyone's held demand against today's capacity.
const verdict = async (day) => {
  const { rows } = await owner.query(`
    select
      (select sum(quantity) from public.aura_projects_resource_bookings b
        where b.tenant_id=$1 and b.resource_type='asset' and b.canonical_resource_id=$2
          and b.status='held' and $3::date between b.valid_from and b.valid_to)::numeric as committed,
      (select sum(quantity) from public.aura_projects_resource_capacity c
        where c.tenant_id=$1 and c.resource_type='asset' and c.canonical_resource_id=$2
          and $3::date between c.valid_from and c.valid_to)::numeric as capacity`,
    [T, CRANE, day]);
  const { committed, capacity } = rows[0];
  if (capacity === null) return 'UNKNOWN';
  return Number(committed ?? 0) > Number(capacity) ? 'CONFLICTED' : 'AVAILABLE';
};

const before = await verdict('2026-07-07');
check(before === 'AVAILABLE', 'the booking fits when it is made', before);

const snapshot = async () => {
  const { rows } = await owner.query(`
    select capacity_at_commitment::int as cap, demand_at_commitment::int as demand,
           committed_at::text as at, status
      from public.aura_projects_resource_bookings where id=$1`, [bookingId]);
  return rows[0];
};
const s1 = await snapshot();

// Now the world changes for a reason that has nothing to do with this project: the second crane
// goes off hire. Nobody touches the booking.
await owner.query(
  `update public.aura_projects_resource_capacity set quantity = 0
    where tenant_id=$1 and canonical_resource_id=$2`, [T, CRANE]);

const after = await verdict('2026-07-07');
check(after === 'CONFLICTED',
  'the SAME booking is conflicted once capacity drops, with no write to the booking', after);

const s2 = await snapshot();
check(s1.cap === s2.cap && s1.demand === s2.demand && s1.at === s2.at && s2.status === 'held',
  'and the commitment snapshot is untouched — history was not rewritten',
  `capacity_at_commitment ${s2.cap}, demand ${s2.demand}, status ${s2.status}`);
check(s2.cap === 2 && s2.demand === 1,
  'so the record still says BOTH: it fitted when committed, and it does not fit now');

await owner.query(
  `update public.aura_projects_resource_capacity set quantity = 2
    where tenant_id=$1 and canonical_resource_id=$2`, [T, CRANE]);
say();

say('## 3. Committing over capacity is governed, not blocked');
const silent = await bookRefused({ project: pB, capacity: 2, demand: 5, quantity: 5 });
check(!!silent && /over_capacity_check/.test(silent),
  'a SILENT overrun is rejected — committing past a known capacity costs a sentence',
  silent?.split('\n')[0]);

const blank = await bookRefused({ project: pB, capacity: 2, demand: 5, quantity: 5, overReason: '   ' });
check(!!blank && /over_capacity_check/.test(blank),
  'and whitespace is not a reason', blank?.split('\n')[0]);

const stated = await bookRefused({
  project: pB, capacity: 2, demand: 5, quantity: 5, overReason: 'third crane hired from Al-Faris',
});
check(!stated,
  'WITH a reason it is accepted — blocking would not prevent the overrun, only the record of it',
  stated ?? '');

const unknownCap = await bookRefused({ project: pB, capacity: null, demand: 99, quantity: 99 });
check(!unknownCap,
  'no reason is demanded when capacity is UNKNOWN — nobody can justify exceeding an unrecorded number',
  unknownCap ?? '');
say();

say('## 4. What a booking refuses to be');
const zero = await bookRefused({ quantity: 0, demand: 0 });
check(!!zero && /quantity_check/.test(zero),
  'zero held is rejected — that is the absence of a booking, not a booking', zero?.split('\n')[0]);

const understated = await bookRefused({ quantity: 4, demand: 2, capacity: 10 });
check(!!understated && /demand_check/.test(understated),
  'a snapshot whose total demand is less than this booking alone is rejected as incoherent',
  understated?.split('\n')[0]);

const backwards = await bookRefused({ from: '2026-07-08', to: '2026-07-06' });
check(!!backwards && /interval_check/.test(backwards), 'a range that ends before it starts is rejected');

const badType = await bookRefused({ type: 'crane' });
check(!!badType && /type_check/.test(badType),
  'an unknown resource type is rejected — a reference is typed, never free text');

const badUnit = await bookRefused({ unit: 'people' });
check(!!badUnit && /unit_check/.test(badUnit), 'an unknown unit is rejected');

// Two constraints independently reject this, and only one of them can be reported: `release_check`
// is written as (held AND no release fields) OR (released AND reason AND time), so any third value
// fails it as well as failing `status_check`. Naming either is honest; naming one specifically
// would be asserting an evaluation order PostgreSQL does not promise.
const badStatus = await bookRefused({ status: 'conflicted' });
check(!!badStatus && /(status_check|release_check)/.test(badStatus),
  "'conflicted' is not a status a booking can be IN — it is a verdict ABOUT one, and is not stored",
  badStatus?.split('\n')[0]);
say();

say('## 5. Releasing');
const noReason = await bookRefused({ status: 'released', relAt: new Date().toISOString() });
check(!!noReason && /release_check/.test(noReason),
  'a release with no reason is rejected — it is indistinguishable from a mistake',
  noReason?.split('\n')[0]);

const heldWithRelease = await bookRefused({ status: 'held', relReason: 'x', relAt: new Date().toISOString() });
check(!!heldWithRelease && /release_check/.test(heldWithRelease),
  'a HELD booking carrying release fields is rejected', heldWithRelease?.split('\n')[0]);

const released = await bookRefused({
  project: pB, status: 'released', relReason: 'task moved to August', relAt: new Date().toISOString(),
});
check(!released, 'a release with a reason and a time is accepted', released ?? '');

// A released booking holds nothing, so it must not appear in any conflict total.
const { rows: heldOnly } = await owner.query(`
  select count(*)::int as n from public.aura_projects_resource_bookings
   where tenant_id=$1 and status='held'`, [T]);
const { rows: allRows } = await owner.query(`
  select count(*)::int as n from public.aura_projects_resource_bookings where tenant_id=$1`, [T]);
check(allRows[0].n > heldOnly[0].n,
  'the released booking is still on the record — capacity is given back, history is not deleted',
  `${allRows[0].n} bookings, ${heldOnly[0].n} held`);

const { rows: idx } = await owner.query(`
  select indexdef from pg_indexes
   where schemaname='public' and indexname='idx_aura_projects_resource_bookings_resource'`);
check(/WHERE \(status = 'held'/.test(idx[0]?.indexdef ?? ''),
  "the engine's index is PARTIAL on held — a released booking cannot reach a conflict total",
  idx[0]?.indexdef?.split('WHERE')[1]?.trim());
say();

say('## 6. Lineage — a booking cannot claim another tenant\'s project');
const crossTenant = await bookRefused({ tenant: OTHER, project: pA });
check(!!crossTenant && /project_fkey/.test(crossTenant),
  "a booking naming this tenant's project under ANOTHER tenant is rejected BY THE COMPOSITE FK",
  crossTenant?.split('\n')[0]);

const ghostProject = await bookRefused({ project: 'f0000000-0000-4000-8000-00000000000f' });
check(!!ghostProject && /project_fkey/.test(ghostProject),
  'a booking naming a project that does not exist is rejected', ghostProject?.split('\n')[0]);

// The stated non-guarantee, proven so that nobody mistakes it for an oversight. See AURA-PM-004.
const ghostTask = await bookRefused({ project: pA, task: '11100000-0000-4000-8000-000000000001' });
check(!ghostTask,
  'a task reference is an ADDRESS, not an integrity claim: it is accepted and may stop resolving',
  'AURA-PM-004 — schedule saves delete and re-insert task rows, so no FK is safe here');
say();

say('## 7. Isolation, from aura_app (NOSUPERUSER, NOBYPASSRLS, non-owner)');
const { rows: posture } = await owner.query(`
  select c.relrowsecurity as enabled, c.relforcerowsecurity as forced,
         (select count(*)::int from pg_policy p where p.polrelid=c.oid) as policies
    from pg_class c join pg_namespace n on n.oid=c.relnamespace
   where n.nspname='public' and c.relname='aura_projects_resource_bookings'`);
check(posture[0]?.enabled === true, 'relrowsecurity');
check(posture[0]?.forced === true, 'relforcerowsecurity');
check((posture[0]?.policies ?? 0) > 0, 'has a policy', `${posture[0]?.policies}`);

const app = new pg.Client({ connectionString: appUrl });
let connected = true;
try { await app.connect(); } catch (e) { connected = false; check(false, 'connect as aura_app', e.message); }
if (connected) {
  const { rows: who } = await app.query(
    `select rolsuper, rolbypassrls from pg_roles where rolname = current_user`);
  check(who[0]?.rolsuper === false && who[0]?.rolbypassrls === false,
    'the actor is NOSUPERUSER and NOBYPASSRLS, so this proof is not vacuous');

  await setTenant(app, OTHER);
  const { rows: seen } = await app.query('select id from public.aura_projects_resource_bookings');
  check(seen.length === 0, "another tenant cannot read this tenant's commitments");
  await setTenant(app, T);
  const { rows: own } = await app.query('select id from public.aura_projects_resource_bookings');
  check(own.length > 0, 'the owning tenant can — the policy is not simply denying everything',
    `${own.length} booking(s)`);
  await app.end();
}

await cleanup();
await owner.end();
say();
say(failures === 0
  ? '**All checks passed.** Every seeded row was deleted.'
  : `**${failures} check(s) FAILED.** See above.`);
process.exit(failures === 0 ? 0 : 1);

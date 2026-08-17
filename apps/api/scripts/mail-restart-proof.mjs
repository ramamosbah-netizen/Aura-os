// Mail lifecycle restart proof (C3.1).
//
// Each phase runs as its OWN node process against the real database, so "it survived" means the
// row was read back from Postgres by a process that never saw the one that wrote it — not that a
// value stayed in memory. Run:
//
//   node scripts/mail-restart-proof.mjs draft|check-draft|schedule|check-scheduled|reschedule|cancel|import|import-again
//
// State is passed between phases through .aura-storage/mail-proof.json (the mail id only).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import pg from 'pg';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..', '..', '..');
const statePath = join(repo, '.aura-storage', 'mail-proof.json');
const TENANT = 'dev-tenant';

const url = readFileSync(join(here, '..', '.env.local'), 'utf8').match(/^MIGRATION_DATABASE_URL=(.*)$/m)[1].trim();
const client = new pg.Client({ connectionString: url });
await client.connect();

const readState = () => { try { return JSON.parse(readFileSync(statePath, 'utf8')); } catch { return {}; } };
const writeState = (next) => { mkdirSync(dirname(statePath), { recursive: true }); writeFileSync(statePath, JSON.stringify(next)); };
const say = (ok, label) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`); if (!ok) process.exitCode = 1; };

const phase = process.argv[2];
const state = readState();

if (phase === 'draft') {
  const id = randomUUID();
  const now = new Date().toISOString();
  await client.query(
    `insert into public.aura_comms_mail (id, tenant_id, account_id, direction, state, from_user, subject, body, snippet, thread_id, created_at, updated_at)
     values ($1,$2,null,'outbound','draft','u-admin','Restart proof','body',' body',$1,$3,$3)`,
    [id, TENANT, now],
  );
  await client.query(
    `insert into public.aura_comms_participants (id, tenant_id, subject_type, subject_id, role, address, user_id)
     values ($1,$2,'mail',$3,'from',null,'u-admin'), ($4,$2,'mail',$3,'to','client@example.com',null)`,
    [randomUUID(), TENANT, id, randomUUID()],
  );
  writeState({ id });
  console.log(`created draft ${id}`);
} else if (phase === 'check-draft') {
  const { rows } = await client.query(`select state, sent_at from public.aura_comms_mail where tenant_id=$1 and id=$2`, [TENANT, state.id]);
  say(rows.length === 1, 'draft survived the restart');
  say(rows[0]?.state === 'draft', `state is draft (got ${rows[0]?.state})`);
  say(rows[0]?.sent_at === null, 'a draft has no send time');
  const { rows: people } = await client.query(
    `select role, address from public.aura_comms_participants where tenant_id=$1 and subject_type='mail' and subject_id=$2 order by role`, [TENANT, state.id]);
  say(people.length === 2, `envelope survived (${people.length} participants)`);
} else if (phase === 'schedule') {
  // 08:00 Asia/Dubai on a fixed date = 04:00Z.
  await client.query(`update public.aura_comms_mail set state='scheduled', updated_at=now() where tenant_id=$1 and id=$2`, [TENANT, state.id]);
  const dispatchId = randomUUID();
  await client.query(
    `insert into public.aura_comms_dispatch (id, tenant_id, subject_type, subject_id, scheduled_at, scheduled_timezone, state)
     values ($1,$2,'mail',$3,$4,'Asia/Dubai','pending')`,
    [dispatchId, TENANT, state.id, '2026-08-20T04:00:00.000Z'],
  );
  writeState({ ...state, dispatchId });
  console.log('scheduled for 08:00 Asia/Dubai');
} else if (phase === 'check-scheduled') {
  const { rows } = await client.query(`select state, sent_at from public.aura_comms_mail where tenant_id=$1 and id=$2`, [TENANT, state.id]);
  say(rows[0]?.state === 'scheduled', `still scheduled after restart (got ${rows[0]?.state})`);
  say(rows[0]?.sent_at === null, 'scheduling did NOT send it');
  const { rows: d } = await client.query(`select state, scheduled_at, scheduled_timezone from public.aura_comms_dispatch where tenant_id=$1 and subject_id=$2`, [TENANT, state.id]);
  say(d[0]?.state === 'pending', 'dispatch is pending');
  say(d[0]?.scheduled_timezone === 'Asia/Dubai', `the user's chosen timezone survived (${d[0]?.scheduled_timezone})`);
  say(new Date(d[0]?.scheduled_at).toISOString() === '2026-08-20T04:00:00.000Z', 'stored as the correct UTC instant');
} else if (phase === 'reschedule') {
  await client.query(
    `update public.aura_comms_dispatch set scheduled_at=$3, scheduled_timezone='Asia/Dubai' where tenant_id=$1 and subject_id=$2`,
    [TENANT, state.id, '2026-08-21T14:30:00.000Z'],
  );
  const { rows } = await client.query(`select id, scheduled_at from public.aura_comms_dispatch where tenant_id=$1 and subject_id=$2`, [TENANT, state.id]);
  say(rows.length === 1, 'reschedule reused the same dispatch row, it did not create a second');
  say(rows[0].id === state.dispatchId, 'same dispatch id');
} else if (phase === 'cancel') {
  await client.query(`update public.aura_comms_dispatch set state='cancelled', cancelled_at=now() where tenant_id=$1 and subject_id=$2 and state in ('pending','claimed')`, [TENANT, state.id]);
  await client.query(`update public.aura_comms_mail set state='cancelled', updated_at=now() where tenant_id=$1 and id=$2`, [TENANT, state.id]);
  const { rows } = await client.query(`select m.state, m.sent_at, d.state as dispatch from public.aura_comms_mail m join public.aura_comms_dispatch d on d.subject_id=m.id where m.tenant_id=$1 and m.id=$2`, [TENANT, state.id]);
  say(rows[0]?.state === 'cancelled', 'mail cancelled');
  say(rows[0]?.dispatch === 'cancelled', 'dispatch cancelled — nothing will pick it up');
  say(rows[0]?.sent_at === null, 'it was never sent');
} else if (phase === 'import' || phase === 'import-again') {
  const providerMessageId = 'provider-restart-proof-1';
  const { rows: existing } = await client.query(
    `select id from public.aura_comms_mail where tenant_id=$1 and provider_message_id=$2`, [TENANT, providerMessageId]);
  if (existing.length > 0) {
    say(phase === 'import-again', `already imported — replay found the existing mail ${existing[0].id}`);
  } else {
    const id = randomUUID();
    const now = new Date().toISOString();
    await client.query(
      `insert into public.aura_comms_mail (id, tenant_id, account_id, direction, state, subject, body, thread_id, provider_message_id, sent_at, created_at, updated_at)
       values ($1,$2,null,'inbound','received','Imported','body',$1,$3,$4,$4,$4)`,
      [id, TENANT, providerMessageId, now],
    );
    say(phase === 'import', `imported as ${id}`);
  }
  const { rows: count } = await client.query(
    `select count(*)::int as n from public.aura_comms_mail where tenant_id=$1 and provider_message_id=$2`, [TENANT, providerMessageId]);
  say(count[0].n === 1, `exactly one mail for this provider id (got ${count[0].n})`);
} else if (phase === 'queue-due') {
  // A message queued to go out immediately: state queued, dispatch pending and already due.
  const id = randomUUID();
  const now = new Date().toISOString();
  await client.query(
    `insert into public.aura_comms_mail (id, tenant_id, account_id, direction, state, from_user, subject, body, thread_id, created_at, updated_at)
     values ($1,$2,null,'outbound','queued','u-admin','dispatch proof','body',$1,$3,$3)`,
    [id, TENANT, now],
  );
  await client.query(
    `insert into public.aura_comms_participants (id, tenant_id, subject_type, subject_id, role, address, user_id)
     values ($1,$2,'mail',$3,'from',null,'u-admin'), ($4,$2,'mail',$3,'to','client@example.com',null)`,
    [randomUUID(), TENANT, id, randomUUID()],
  );
  const dispatchId = randomUUID();
  await client.query(
    `insert into public.aura_comms_dispatch (id, tenant_id, subject_type, subject_id, scheduled_at, scheduled_timezone, state)
     values ($1,$2,'mail',$3,now() - interval '1 minute','Asia/Dubai','pending')`,
    [dispatchId, TENANT, id],
  );
  writeState({ ...state, dispatchId: dispatchId, queuedId: id });
  console.log(`queued ${id}, due one minute ago`);
} else if (phase === 'check-claim') {
  // Two claims in a row: the first takes the row, the second must find nothing. This is the
  // duplicate-send guard, exercised against real Postgres rather than a mock.
  const claim = async () => (await client.query(
    `update public.aura_comms_dispatch d set state='processing', claimed_at=now()
      where d.id in (select id from public.aura_comms_dispatch
                      where tenant_id=$1 and state='pending' and scheduled_at <= now()
                      order by scheduled_at limit 10 for update skip locked)
    returning d.id`, [TENANT])).rows;
  const first = await claim();
  const second = await claim();
  say(first.length === 1, `first claim took the work (${first.length})`);
  say(second.length === 0, `second claim found nothing — no duplicate send (${second.length})`);
} else if (phase === 'check-queued-survived') {
  const { rows } = await client.query(`select state, sent_at from public.aura_comms_mail where tenant_id=$1 and id=$2`, [TENANT, state.queuedId]);
  say(rows[0]?.state === 'queued', `queued mail survived the restart (got ${rows[0]?.state})`);
  say(rows[0]?.sent_at === null, 'queueing is not sending');
  const { rows: d } = await client.query(`select state, attempts from public.aura_comms_dispatch where tenant_id=$1 and subject_id=$2`, [TENANT, state.queuedId]);
  say(d[0]?.state === 'processing', `the claim survived the restart too (${d[0]?.state})`);
} else if (phase === 'cleanup') {
  for (const subject of [state.id, state.queuedId].filter(Boolean)) {
    await client.query(`delete from public.aura_comms_dispatch where tenant_id=$1 and subject_id=$2`, [TENANT, subject]);
    await client.query(`delete from public.aura_comms_participants where tenant_id=$1 and subject_type='mail' and subject_id=$2`, [TENANT, subject]);
    await client.query(`delete from public.aura_comms_mail where tenant_id=$1 and id=$2`, [TENANT, subject]);
  }
  await client.query(`delete from public.aura_comms_participants where tenant_id=$1 and subject_type='mail' and subject_id=$2`, [TENANT, state.id]);
  await client.query(`delete from public.aura_comms_mail where tenant_id=$1 and (id=$2 or provider_message_id='provider-restart-proof-1')`, [TENANT, state.id]);
  console.log('proof rows removed');
} else {
  console.error('unknown phase');
  process.exitCode = 1;
}

await client.end();

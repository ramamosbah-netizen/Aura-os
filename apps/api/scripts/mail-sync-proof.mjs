// Inbound sync proof (C3.4) — against the real database, across separate processes.
//
//   node scripts/mail-sync-proof.mjs setup      # process A: accounts + first sync, saves cursor
//   node scripts/mail-sync-proof.mjs resume     # process B: reads the SAME account id back
//   node scripts/mail-sync-proof.mjs cleanup
//
// Every account is addressed by an explicit id written to /tmp, because an earlier run of this
// proof selected by `provider='probe'` and picked up an orphan row from a crashed attempt — the
// checkpoint looked broken when the query was.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';
import pg from 'pg';

const here = dirname(fileURLToPath(import.meta.url));
// pathToFileURL: on Windows a bare absolute path is not a valid ESM specifier.
const dist = (name) => pathToFileURL(join(here, '..', 'dist', 'comms', 'mail', name)).href;
const { PostgresMailStore } = await import(dist('postgres-mail-store.js'));
const { MailSyncEngine } = await import(dist('mail-sync.engine.js'));

const url = readFileSync(join(here, '..', '.env.local'), 'utf8').match(/^MIGRATION_DATABASE_URL=(.*)$/m)[1].trim();
const pool = new pg.Pool({ connectionString: url });
const store = new PostgresMailStore(pool);
const engine = new MailSyncEngine(store);

const TENANT_A = 'dev-tenant';
const TENANT_B = 'proof-tenant-b';
const statePath = '/tmp/mail-sync-proof.json';
const say = (ok, label) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`); if (!ok) process.exitCode = 1; };
const readState = () => { try { return JSON.parse(readFileSync(statePath, 'utf8')); } catch { return {}; } };

const accountRef = (id, tenantId) => ({
  id, tenantId, companyId: null, provider: 'probe', externalAccountId: 'mbx',
  address: 'alice@aura.example', capabilities: ['send', 'fetch_messages', 'fetch_threads'], status: 'connected',
});

const message = (over = {}) => {
  const id = randomUUID();
  const now = new Date().toISOString();
  return {
    id, tenantId: TENANT_A, companyId: null, accountId: null, direction: 'inbound', state: 'received',
    fromUser: null, subject: 'Sync proof', body: 'body', bodyHtml: null, snippet: null,
    participants: [{ role: 'from', address: 'client@example.com' }, { role: 'to', address: 'alice@aura.example' }],
    threadId: id, parentMailId: null, forwardedFromMailId: null,
    providerMessageId: 'pm-proof-1', providerThreadId: 'pt-proof-1',
    internetMessageId: `<${id}@example.com>`, inReplyTo: null, referencesHeader: null,
    sentAt: now, failedReason: null, createdAt: now, updatedAt: now, ...over,
  };
};

const adapter = (pages) => ({
  provider: 'probe',
  capabilities: ['send', 'fetch_messages', 'fetch_threads'],
  calls: [],
  async health() { return { status: 'connected', detail: null, checkedAt: new Date().toISOString() }; },
  async send() { return { providerMessageId: 'x', providerThreadId: 'y', internetMessageId: null, sentAt: new Date().toISOString() }; },
  async fetchSince(_a, cursor) {
    this.calls.push(cursor?.token ?? null);
    return pages.shift() ?? { messages: [], cursor: cursor ?? { token: null, fetchedAt: new Date().toISOString() }, hasMore: false };
  },
});

const newAccount = async (tenantId) => {
  const id = randomUUID();
  await pool.query(
    `insert into public.aura_comms_accounts (id, tenant_id, channel, provider, display_label, capabilities, status)
     values ($1,$2,'email','probe','Sync proof','["send","fetch_messages"]','connected')`, [id, tenantId]);
  return id;
};

const phase = process.argv[2];

if (phase === 'setup') {
  await pool.query(`delete from public.aura_comms_mail where provider_message_id like 'pm-proof-%'`);
  await pool.query(`delete from public.aura_comms_accounts where provider = 'probe'`);

  const accA = await newAccount(TENANT_A);
  const accB = await newAccount(TENANT_A);
  const accOther = await newAccount(TENANT_B);
  writeFileSync(statePath, JSON.stringify({ accA, accB, accOther }));

  const shared = message();
  const pages = [
    { messages: [shared], cursor: { token: 'cur-1', fetchedAt: new Date().toISOString() }, hasMore: false },
  ];
  const a = adapter(pages);
  const outcome = await engine.syncAccount(accountRef(accA, TENANT_A), a, null);
  say(outcome.imported === 1, `first sync imported ${outcome.imported}`);
  await store.saveSyncCursor(TENANT_A, accA, outcome.cursor.token, outcome.error, new Date().toISOString());

  // Same provider message, second account in the same tenant.
  const outcomeB = await engine.syncAccount(
    accountRef(accB, TENANT_A),
    adapter([{ messages: [message()], cursor: { token: 'cur-b', fetchedAt: new Date().toISOString() }, hasMore: false }]),
    null,
  );
  say(outcomeB.imported === 1, 'the same provider message imported again on a DIFFERENT account');

  // A reply, arriving later, carrying the provider thread id.
  const reply = message({ providerMessageId: 'pm-proof-2', providerThreadId: 'pt-proof-1' });
  await engine.syncAccount(accountRef(accA, TENANT_A), adapter([{ messages: [reply], cursor: { token: 'cur-2', fetchedAt: new Date().toISOString() }, hasMore: false }]), null);

  // Another reply with NO provider thread id, threaded only by In-Reply-To.
  const root = await store.findByProviderMessage(TENANT_A, accA, 'pm-proof-1');
  const headerReply = message({ providerMessageId: 'pm-proof-3', providerThreadId: null, inReplyTo: root.internetMessageId });
  await engine.syncAccount(accountRef(accA, TENANT_A), adapter([{ messages: [headerReply], cursor: { token: 'cur-3', fetchedAt: new Date().toISOString() }, hasMore: false }]), null);

  // A message into another tenant entirely.
  await engine.syncAccount(accountRef(accOther, TENANT_B), adapter([{ messages: [message({ providerMessageId: 'pm-proof-9' })], cursor: { token: 'cur-x', fetchedAt: new Date().toISOString() }, hasMore: false }]), null);
  console.log('setup complete — process exiting');
} else if (phase === 'resume') {
  const { accA, accB, accOther } = readState();

  const cursor = await store.getSyncCursor(TENANT_A, accA);
  say(cursor === 'cur-1', `checkpoint survived the restart: ${cursor}`);

  // Resume: the adapter records the cursor it was handed. It must be the saved one, not null.
  const a = adapter([{ messages: [message()], cursor: { token: 'cur-4', fetchedAt: new Date().toISOString() }, hasMore: false }]);
  const outcome = await engine.syncAccount(accountRef(accA, TENANT_A), a, { token: cursor, fetchedAt: new Date().toISOString() });
  say(a.calls[0] === 'cur-1', `resumed from the saved cursor, not the beginning (got ${a.calls[0]})`);
  say(outcome.imported === 0 && outcome.duplicates === 1, 'the replayed message was recognised, not duplicated');

  const { rows: dupes } = await pool.query(
    `select count(*)::int n from public.aura_comms_mail where tenant_id=$1 and account_id=$2 and provider_message_id='pm-proof-1'`, [TENANT_A, accA]);
  say(dupes[0].n === 1, `exactly one row for (account, provider_message_id) — got ${dupes[0].n}`);

  const { rows: across } = await pool.query(
    `select account_id, id from public.aura_comms_mail where tenant_id=$1 and provider_message_id='pm-proof-1' order by account_id`, [TENANT_A]);
  say(across.length === 2, `the same provider id on two accounts = two rows (${across.length})`);
  say(across[0].id !== across[1].id, 'each carries its own AURA id, so neither copy overwrites the other');

  const root = await store.findByProviderMessage(TENANT_A, accA, 'pm-proof-1');
  const viaThreadId = await store.findByProviderMessage(TENANT_A, accA, 'pm-proof-2');
  const viaHeaders = await store.findByProviderMessage(TENANT_A, accA, 'pm-proof-3');
  say(viaThreadId.threadId === root.threadId, 'threaded by provider_thread_id');
  say(viaHeaders.threadId === root.threadId, 'threaded by In-Reply-To when the provider gave no thread id');

  const { rows: states } = await pool.query(
    `select distinct state, direction from public.aura_comms_mail where provider_message_id like 'pm-proof-%'`);
  say(states.every((r) => r.state === 'received' && r.direction === 'inbound'), 'every imported row is received/inbound');

  const { rows: leak } = await pool.query(
    `select count(*)::int n from public.aura_comms_mail where tenant_id=$1 and provider_message_id='pm-proof-9'`, [TENANT_A]);
  say(leak[0].n === 0, `tenant B's message is not visible in tenant A (${leak[0].n})`);
  const { rows: theirs } = await pool.query(
    `select count(*)::int n from public.aura_comms_mail where tenant_id=$1 and account_id=$2`, [TENANT_B, accOther]);
  say(theirs[0].n === 1, 'and it did land in tenant B');
} else if (phase === 'cleanup') {
  await pool.query(`delete from public.aura_comms_participants where subject_id in (select id from public.aura_comms_mail where provider_message_id like 'pm-proof-%')`);
  await pool.query(`delete from public.aura_comms_mail_recipients where mail_id in (select id from public.aura_comms_mail where provider_message_id like 'pm-proof-%')`);
  await pool.query(`delete from public.aura_comms_mail where provider_message_id like 'pm-proof-%'`);
  await pool.query(`delete from public.aura_comms_accounts where provider = 'probe'`);
  console.log('proof rows removed');
} else {
  console.error('unknown phase');
  process.exitCode = 1;
}

await pool.end();

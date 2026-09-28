import { createHmac, randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * SEC-01 STAGE 4 — THE TWO INBOUND WEBHOOKS, PROVED ON THE RUNNING API AGAINST POSTGRESQL.
 *
 * The owner put these aside as "security/authentication work, not business-role permissions". Before
 * this, with login enforced, both were unreachable to the machines that call them: the permission
 * guard refused any request with no user ("Actor identity is missing"), and the telemetry route was
 * not even a public path — a telematics box needed an administrator's token. And WhatsApp had a second
 * defect under it: the receiving number was looked up in a table under forced RLS while the webhook
 * bound no tenant, so a real tenant's account could never be found.
 *
 * Run against the LIVE stack, because what is proved lives in main.ts (the token-free paths, the raw
 * body kept for the HMAC) as much as in the handlers:
 *
 *   AURA_LIVE_API_URL=http://127.0.0.1:4000 MIGRATION_DATABASE_URL=… DATABASE_URL=… \
 *   WHATSAPP_APP_SECRET=… WHATSAPP_WEBHOOK_VERIFY_TOKEN=… FLEET_TELEMETRY_WEBHOOK_SECRET=… FLEET_TELEMETRY_TENANT_ID=… \
 *   pnpm --filter @aura/api exec vitest run --config vitest.config.e2e-db.ts test/signed-inbound.live.e2e-spec.ts
 *
 * with the API started under the same four webhook variables. Both proof tenants differ from the
 * local users' `dev-tenant` on purpose: that is also the placeholder an anonymous request is bound to,
 * so a proof inside it could not tell routing from coincidence.
 */
const API = process.env.AURA_LIVE_API_URL;
const ADMIN_DB = process.env.MIGRATION_DATABASE_URL;
const APP_DB = process.env.DATABASE_URL;
const WA_SECRET = process.env.WHATSAPP_APP_SECRET ?? '';
const WA_TOKEN = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN ?? '';
const FLEET_SECRET = process.env.FLEET_TELEMETRY_WEBHOOK_SECRET ?? '';
const FLEET_TENANT = process.env.FLEET_TELEMETRY_TENANT_ID ?? '';
const live = Boolean(API && ADMIN_DB && APP_DB && WA_SECRET && WA_TOKEN && FLEET_SECRET && FLEET_TENANT);

const hmac = (secret: string, body: string) => `sha256=${createHmac('sha256', secret).update(Buffer.from(body)).digest('hex')}`;
const post = (path: string, body: string, headers: Record<string, string> = {}) =>
  fetch(`${API}/api/v1/${path}`, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body });

describe.skipIf(!live)('signed inbound webhooks — the running API, PostgreSQL, login enforced', () => {
  const run = Date.now().toString().slice(-7);
  let admin: Pool;
  let app: Pool;
  const WA_TENANT = `wa-proof-${run}`;
  const phoneNumberId = `pn-${run}`;
  const accountId = randomUUID();
  const proofVehicle = randomUUID();
  const devVehicle = randomUUID();

  beforeAll(async () => {
    admin = new Pool({ connectionString: ADMIN_DB });
    app = new Pool({ connectionString: APP_DB });
    await admin.query(
      `insert into public.aura_fleet_vehicles (id, tenant_id, make, model, year, plate_number) values ($1, $2, 'Toyota', 'Hilux', 2025, $3), ($4, 'dev-tenant', 'Nissan', 'Urvan', 2024, $5)`,
      [proofVehicle, FLEET_TENANT, `P ${run}`, devVehicle, `D ${run}`],
    );
    await admin.query(
      `insert into public.aura_comms_accounts (id, tenant_id, channel, provider, external_account_id, display_label, status) values ($1, $2, 'whatsapp', 'whatsapp-business', $3, 'Proof number', 'connected')`,
      [accountId, WA_TENANT, phoneNumberId],
    );
  });

  afterAll(async () => { await admin?.end(); await app?.end(); });

  // ── Fleet telemetry ─────────────────────────────────────────────────────────────────────────────
  it('telemetry: refused unsigned, with the wrong secret, and with a body other than the one signed', async () => {
    const body = JSON.stringify({ vehicleId: proofVehicle, latitude: 25.2, longitude: 55.3, speed: 40 });
    expect((await post('fleet/telemetry/webhook', body)).status).toBe(401);
    expect((await post('fleet/telemetry/webhook', body, { 'x-aura-signature': hmac('not-the-secret-not-the-secret-000', body) })).status).toBe(401);
    const tampered = JSON.stringify({ vehicleId: proofVehicle, latitude: 1, longitude: 1, speed: 199 });
    expect((await post('fleet/telemetry/webhook', tampered, { 'x-aura-signature': hmac(FLEET_SECRET, body) })).status).toBe(401);
    const rows = await admin.query('select count(*)::int as n from public.aura_fleet_telemetry_logs where vehicle_id = $1', [proofVehicle]);
    expect(rows.rows[0].n, 'nothing was recorded').toBe(0);
  });

  it('telemetry: a signed position is recorded in the tenant the secret is bound to — and only there', async () => {
    const body = JSON.stringify({ vehicleId: proofVehicle, latitude: 25.204849, longitude: 55.270782, speed: 62.5, odometer: 18_250 });
    const res = await post('fleet/telemetry/webhook', body, { 'x-aura-signature': hmac(FLEET_SECRET, body) });
    expect(res.status, await res.clone().text()).toBe(201);
    const logs = await admin.query('select tenant_id, latitude::float, speed::float from public.aura_fleet_telemetry_logs where vehicle_id = $1', [proofVehicle]);
    expect(logs.rows).toEqual([{ tenant_id: FLEET_TENANT, latitude: 25.204849, speed: 62.5 }]);

    // A vehicle that exists only in ANOTHER tenant is not found, even correctly signed: the binding
    // decides whose fleet this is, not the vehicle id the caller names.
    const foreign = JSON.stringify({ vehicleId: devVehicle, latitude: 1, longitude: 1, speed: 1 });
    expect((await post('fleet/telemetry/webhook', foreign, { 'x-aura-signature': hmac(FLEET_SECRET, foreign) })).status).toBe(404);
    const none = await admin.query('select count(*)::int as n from public.aura_fleet_telemetry_logs where vehicle_id = $1', [devVehicle]);
    expect(none.rows[0].n).toBe(0);
  });

  // ── WhatsApp ────────────────────────────────────────────────────────────────────────────────────
  it('whatsapp: the old lookup could not see the account under RLS; the routing function can', async () => {
    const client = await app.connect();
    try {
      await client.query("select set_config('app.current_tenant_id', 'dev-tenant', false)");
      const old = await client.query(`select id from public.aura_comms_accounts where channel = 'whatsapp' and external_account_id = $1`, [phoneNumberId]);
      expect(old.rows, 'as the app role under the placeholder tenant, forced RLS hides the account').toEqual([]);
      const routed = await client.query('select id, tenant_id from public.aura_route_whatsapp_account($1)', [phoneNumberId]);
      expect(routed.rows).toEqual([{ id: accountId, tenant_id: WA_TENANT }]);
    } finally {
      await client.query("select set_config('app.current_tenant_id', '', false)");
      client.release();
    }
  });

  it('whatsapp: the subscription handshake answers only the configured verify token', async () => {
    const ok = await fetch(`${API}/api/v1/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=${WA_TOKEN}&hub.challenge=ch-${run}`);
    expect(ok.status).toBe(200);
    expect(await ok.text()).toBe(`ch-${run}`);
    expect((await fetch(`${API}/api/v1/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=x`)).status).toBe(400);
  });

  const delivery = (messageId: string, text: string) => JSON.stringify({
    entry: [{ changes: [{ value: {
      metadata: { phone_number_id: phoneNumberId },
      contacts: [{ wa_id: '971501234567', profile: { name: `Customer ${run}` } }],
      messages: [{ id: messageId, from: '971501234567', timestamp: String(Math.floor(Date.now() / 1000)), type: 'text', text: { body: text } }],
    } }] }],
  });

  it('whatsapp: a delivery with a bad signature is refused and stores nothing', async () => {
    const body = delivery(`wamid.bad.${run}`, 'should not arrive');
    const res = await post('whatsapp/webhook', body, { 'x-hub-signature-256': hmac('not-the-app-secret', body) });
    expect(res.status).toBe(403);
    expect(((await res.json()) as { message: string }).message).toBe('Invalid WhatsApp webhook signature');
    const rows = await admin.query('select count(*)::int as n from public.aura_comms_whatsapp_messages where external_message_id = $1', [`wamid.bad.${run}`]);
    expect(rows.rows[0].n).toBe(0);
  });

  it('whatsapp: a signed delivery lands in the tenant that owns the receiving number', async () => {
    const body = delivery(`wamid.ok.${run}`, `Please send the O&M manuals ${run}`);
    const res = await post('whatsapp/webhook', body, { 'x-hub-signature-256': hmac(WA_SECRET, body) });
    expect(res.status, await res.clone().text()).toBe(201);
    expect(await res.json()).toEqual({ received: true, processed: 1 });
    const message = await admin.query('select tenant_id, direction, body, provider_account_id from public.aura_comms_whatsapp_messages where external_message_id = $1', [`wamid.ok.${run}`]);
    expect(message.rows).toEqual([{ tenant_id: WA_TENANT, direction: 'inbound', body: `Please send the O&M manuals ${run}`, provider_account_id: accountId }]);
    const thread = await admin.query('select tenant_id, phone_e164, display_name from public.aura_comms_whatsapp_threads where provider_account_id = $1', [accountId]);
    expect(thread.rows).toEqual([{ tenant_id: WA_TENANT, phone_e164: '+971501234567', display_name: `Customer ${run}` }]);
  });

  it('whatsapp: a number registered in two tenants is refused, not routed to whichever came first', async () => {
    const second = randomUUID();
    await admin.query(
      `insert into public.aura_comms_accounts (id, tenant_id, channel, provider, external_account_id, display_label, status) values ($1, $2, 'whatsapp', 'whatsapp-business', $3, 'Duplicate', 'connected')`,
      [second, `${WA_TENANT}-other`, phoneNumberId],
    );
    try {
      const body = delivery(`wamid.dup.${run}`, 'ambiguous');
      const res = await post('whatsapp/webhook', body, { 'x-hub-signature-256': hmac(WA_SECRET, body) });
      expect(await res.json()).toEqual({ received: true, processed: 0 });
      const rows = await admin.query('select count(*)::int as n from public.aura_comms_whatsapp_messages where external_message_id = $1', [`wamid.dup.${run}`]);
      expect(rows.rows[0].n).toBe(0);
    } finally {
      await admin.query('delete from public.aura_comms_accounts where id = $1', [second]);
    }
  });

  it('the other WhatsApp routes still need a signed-in user', async () => {
    expect((await post('whatsapp/threads/any/reply', '{"text":"x"}')).status).toBe(401);
  });
});

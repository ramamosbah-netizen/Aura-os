import crypto from 'node:crypto';
import pg from 'pg';

const ownerUrl = process.env.OWNER_URL ?? process.env.DATABASE_URL;
const appUrl = process.env.APP_DATABASE_URL;
if (!ownerUrl || !appUrl) throw new Error('OWNER_URL and APP_DATABASE_URL are required');

const owner = new pg.Pool({ connectionString: ownerUrl, max: 2 });
const app = new pg.Pool({ connectionString: appUrl, max: 2 });
const ids = { a: crypto.randomUUID(), b: crypto.randomUUID() };

async function main() {
  await owner.query(
    `INSERT INTO public.aura_crm_activities
      (id, tenant_id, company_id, type, subject, status, assignee_id, created_by)
     VALUES ($1, 'rls-activity-a', 'company-a', 'note', 'RLS proof A', 'open', 'u-admin', 'u-admin'),
            ($2, 'rls-activity-b', 'company-b', 'note', 'RLS proof B', 'open', 'u-admin', 'u-admin')`,
    [ids.a, ids.b],
  );

  const client = await app.connect();
  try {
    await client.query(`SELECT set_config('app.current_tenant_id', 'rls-activity-a', false)`);
    const same = await client.query(`SELECT id FROM public.aura_crm_activities WHERE id = $1`, [ids.a]);
    const cross = await client.query(`SELECT id FROM public.aura_crm_activities WHERE id = $1`, [ids.b]);
    const update = await client.query(`UPDATE public.aura_crm_activities SET subject = 'cross-tenant mutation' WHERE id = $1`, [ids.b]);
    const remove = await client.query(`DELETE FROM public.aura_crm_activities WHERE id = $1`, [ids.b]);
    if (same.rowCount !== 1 || cross.rowCount !== 0 || update.rowCount !== 0 || remove.rowCount !== 0) {
      throw new Error(`RLS isolation failed: same=${same.rowCount} cross=${cross.rowCount} update=${update.rowCount} delete=${remove.rowCount}`);
    }
    let insertDenied = false;
    try {
      await client.query(
        `INSERT INTO public.aura_crm_activities (id, tenant_id, company_id, type, subject, status, created_by)
         VALUES ($1, 'rls-activity-b', 'company-b', 'note', 'cross-tenant insert', 'open', 'u-admin')`,
        [crypto.randomUUID()],
      );
    } catch {
      insertDenied = true;
    }
    if (!insertDenied) throw new Error('RLS allowed a cross-tenant insert');
    console.log('Activities RLS proof: same-tenant read=1; cross-tenant read/update/delete=0; cross-tenant insert=denied under aura_app');
  } finally {
    client.release();
  }
}

try {
  await main();
} finally {
  await owner.query(`DELETE FROM public.aura_crm_activities WHERE id IN ($1, $2)`, [ids.a, ids.b]).catch(() => undefined);
  await owner.end();
  await app.end();
}

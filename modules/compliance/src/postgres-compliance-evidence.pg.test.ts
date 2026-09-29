import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { PostgresComplianceStore } from './postgres-compliance-store';
import { makeComplianceCase, setCaseStatus } from './domain/compliance-case';
import { makeSubmission } from './domain/case-records';

/**
 * SEC-01 D-09 — AN AUTHORITY SUBMISSION NEVER EXISTS WITHOUT EVIDENCE, AND A RECEIVED CERTIFICATE IS A
 * STATE OF ITS OWN — against real PostgreSQL (migration 0399).
 *
 *   evidence     a package submission is stored with its transmittal, a portal submission with its
 *                receipt and reference, and both read back
 *   the database a submission with no method, a portal one with no receipt, and a package one with no
 *                transmittal are refused by the table itself — not only by the domain
 *   received     a case saved at `certificate_received` reads back there
 *
 * It SKIPS without a database rather than passing quietly.
 */
function databaseUrl(): string | undefined {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  try {
    const envPath = path.resolve(__dirname, '../../../apps/api/.env.local');
    if (!fs.existsSync(envPath)) return undefined;
    for (const line of fs.readFileSync(envPath, 'utf8').replace(/^﻿/, '').split(/\r?\n/)) {
      if (line.startsWith('DATABASE_URL=')) return line.split('DATABASE_URL=')[1].trim();
    }
  } catch {
    // no env file — treated as "no database", which is a skip, not a failure
  }
  return undefined;
}

const TENANT = `d09pg-${Date.now()}`;

describe('authority submissions carry their evidence (PostgreSQL)', () => {
  let pool: Pool | null = null;
  let store: PostgresComplianceStore;
  let caseId = '';

  beforeAll(async () => {
    const url = databaseUrl();
    if (!url) return;
    pool = new Pool({ connectionString: url });
    pool.on('connect', (client) => {
      void client.query(`SELECT set_config('app.current_tenant_id', '${TENANT}', false)`);
    });
    store = new PostgresComplianceStore(pool);
    const c = makeComplianceCase({ tenantId: TENANT, authorityCode: 'DCD', obligationCode: 'FIRE_ALARM_NOC', scope: 'PROJECT', subjectId: randomUUID() });
    await store.saveCase(c);
    caseId = c.id;
  });

  afterAll(async () => { await pool?.end(); });

  it('stores and reads back a package submission and a portal submission with their evidence', async (ctx) => {
    if (!pool) { ctx.skip(); return; }
    const transmittalId = randomUUID();
    const receiptId = randomUUID();
    await store.addSubmission(makeSubmission({ tenantId: TENANT, caseId, attempt: 1, submittedAt: '2026-09-29', method: 'controlled_package', transmittalId }));
    await store.addSubmission(makeSubmission({ tenantId: TENANT, caseId, attempt: 2, submittedAt: '2026-09-30', method: 'authority_portal', evidenceDocumentId: receiptId, reference: 'DCD-PORTAL-9' }));
    const read = await store.listSubmissions(TENANT, caseId);
    expect(read.map((s) => ({ attempt: s.attempt, method: s.method, transmittalId: s.transmittalId, evidenceDocumentId: s.evidenceDocumentId, reference: s.reference }))).toEqual([
      { attempt: 1, method: 'controlled_package', transmittalId, evidenceDocumentId: null, reference: null },
      { attempt: 2, method: 'authority_portal', transmittalId: null, evidenceDocumentId: receiptId, reference: 'DCD-PORTAL-9' },
    ]);
  });

  it('the table itself refuses a submission without evidence — whatever wrote it', async (ctx) => {
    if (!pool) { ctx.skip(); return; }
    const insert = (attempt: number, method: string | null, transmittal: string | null, evidence: string | null, reference: string | null) =>
      pool!.query(
        `INSERT INTO public.aura_compliance_submissions (id, tenant_id, case_id, attempt, submitted_at, method, transmittal_id, evidence_document_id, reference)
         VALUES ($1,$2,$3,$4,'2026-10-01',$5,$6,$7,$8)`,
        [randomUUID(), TENANT, caseId, attempt, method, transmittal, evidence, reference],
      );
    await expect(insert(10, null, null, null, null), 'no method at all').rejects.toThrow(/chk_aura_compliance_submission_evidence/);
    await expect(insert(11, 'controlled_package', null, null, null), 'a package with no transmittal').rejects.toThrow(/chk_aura_compliance_submission_evidence/);
    await expect(insert(12, 'authority_portal', null, randomUUID(), null), 'a portal submission with no reference').rejects.toThrow(/chk_aura_compliance_submission_evidence/);
    await expect(insert(13, 'authority_portal', null, randomUUID(), '   '), 'a blank reference').rejects.toThrow(/chk_aura_compliance_submission_evidence/);
    await expect(insert(14, 'authority_portal', null, null, 'REF'), 'a portal submission with no receipt').rejects.toThrow(/chk_aura_compliance_submission_evidence/);
    await expect(insert(15, 'email', randomUUID(), null, null), 'an unknown method').rejects.toThrow(/chk_aura_compliance_submission_evidence/);
  });

  it('a case waiting at certificate_received is stored and read back there', async (ctx) => {
    if (!pool) { ctx.skip(); return; }
    let c = (await store.findCase(caseId, TENANT))!;
    for (const s of ['submitted', 'approved', 'certificate_received'] as const) c = setCaseStatus(c, s);
    await store.saveCase(c);
    expect((await store.findCase(caseId, TENANT))!.status).toBe('certificate_received');
  });
});

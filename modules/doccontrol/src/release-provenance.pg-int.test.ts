import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Pool } from 'pg';
import { randomUUID } from 'node:crypto';
import { PostgresTransmittalStore } from './postgres-transmittal-store';
import { PostgresSubmittalStore } from './postgres-submittal-store';
import { PostgresCorrespondenceStore } from './postgres-correspondence-store';
import { makeTransmittal, sendTransmittal } from './domain/transmittal';
import { makeSubmittal, submitForReview, returnWithCode } from './domain/submittal';
import { makeCorrespondence, closeCorrespondence } from './domain/correspondence';

/**
 * SEC-01 wave C — REAL Postgres proof that the release signatures are STORED and CONSTRAINED.
 *
 * The API e2e for document control runs on in-memory stores, so it proves the HTTP contract and the
 * permissions and NOTHING WHATEVER about the schema. That gap is not theoretical in this wave:
 *
 *   * five new columns went into two INSERT statements whose column list, placeholder list and value
 *     array are maintained by hand. The submittal insert went from 17 placeholders to 19 with the
 *     column list already at 19 — an arity mismatch that no type-checker and no in-memory test can
 *     see, and that fails only when a real database parses the statement.
 *   * `sendTransmittal(t, sentBy)` is passed to the service as a callback that used to be typed
 *     `(t) => Transmittal`, so `sentBy` silently took its default and EVERY send recorded null. The
 *     domain unit test passed the actor directly and was green throughout.
 *
 * It also pins the four row-level invariants from migrations 0371 and 0372, because a CHECK that
 * never binds is worse than no CHECK — 0362 shipped one that passed on NULL and was caught only by
 * its own test.
 *
 * Gated on DOCCONTROL_PG_TEST_URL (migrations 0371 and 0372 applied).
 */
const URL = process.env.DOCCONTROL_PG_TEST_URL;
const TENANT = `wavec-int-${Date.now()}`;
const PROJECT = '00000000-0000-0000-0000-0000000000c1';
const run = URL ? describe : describe.skip;

run('Wave C — document control release provenance, in Postgres', () => {
  let pool: Pool;
  let transmittals: PostgresTransmittalStore;
  let submittals: PostgresSubmittalStore;
  let correspondence: PostgresCorrespondenceStore;

  beforeAll(async () => {
    pool = new Pool({ connectionString: URL });
    pool.on('connect', (c) => {
      c.query("SELECT set_config('app.current_tenant_id', $1, false)", [TENANT]).catch(() => undefined);
    });
    transmittals = new PostgresTransmittalStore(pool);
    submittals = new PostgresSubmittalStore(pool);
    correspondence = new PostgresCorrespondenceStore(pool);
  });

  afterAll(async () => {
    await pool?.query('DELETE FROM public.aura_doccontrol_transmittals   WHERE tenant_id = $1', [TENANT]).catch(() => undefined);
    await pool?.query('DELETE FROM public.aura_doccontrol_submittals     WHERE tenant_id = $1', [TENANT]).catch(() => undefined);
    await pool?.query('DELETE FROM public.aura_doccontrol_correspondence WHERE tenant_id = $1', [TENANT]).catch(() => undefined);
    await pool?.end();
  });

  const draft = (code: string, kind?: 'internal_release' | 'external') =>
    makeTransmittal({ tenantId: TENANT, code, title: 'IFC drawings', projectId: PROJECT, kind });

  it('round-trips sentBy and kind through the INSERT — the arity the type-checker cannot see', async () => {
    const sent = sendTransmittal(draft(`TR-${Date.now()}`), 'u-document-controller');
    await transmittals.save(sent);

    // The RAW columns, not the mapper. A mapper can agree with a bug the database never saw.
    const raw = await pool.query<{ sent_by: string | null; kind: string | null; sent_at: Date | null }>(
      'SELECT sent_by, kind, sent_at FROM public.aura_doccontrol_transmittals WHERE id = $1', [sent.id]);
    expect(raw.rows[0].sent_by).toBe('u-document-controller');
    expect(raw.rows[0].kind).toBe('external');
    expect(raw.rows[0].sent_at).not.toBeNull();

    const read = await transmittals.findById(sent.id, TENANT);
    expect(read?.sentBy).toBe('u-document-controller');
    expect(read?.kind).toBe('external');
  });

  it('stores the engineering handoff as an internal release, distinguishable from a client conveyance', async () => {
    const internal = sendTransmittal(draft(`TR-INT-${Date.now()}`, 'internal_release'), 'u-technical-engineer');
    await transmittals.save(internal);
    const read = await transmittals.findById(internal.id, TENANT);
    expect(read?.kind).toBe('internal_release');
    // THE WHOLE POINT OF THE COLUMN: the register can now tell the two apart. Before it, an engineer
    // holding no document-control permission produced a row in this table, marked `sent`, that read
    // exactly like one the Document Controller had released to the client.
    expect(read?.sentBy).toBe('u-technical-engineer');
  });

  it('refuses a third kind — a typo would otherwise be read as external', async () => {
    const t = draft(`TR-BAD-${Date.now()}`);
    await transmittals.save(t);
    await expect(
      pool.query("UPDATE public.aura_doccontrol_transmittals SET kind = 'internal' WHERE id = $1", [t.id]),
    ).rejects.toThrow(/aura_dc_transmittal_kind/);
  });

  it('refuses a sender with no send time', async () => {
    const t = draft(`TR-ASYM-${Date.now()}`);
    await transmittals.save(t);
    await expect(
      pool.query("UPDATE public.aura_doccontrol_transmittals SET sent_by = 'u-x', sent_at = NULL WHERE id = $1", [t.id]),
    ).rejects.toThrow(/aura_dc_transmittal_sent_complete/);
  });

  it('refuses an EXTERNAL conveyance sent by nobody, and allows the historical shape', async () => {
    const t = draft(`TR-UNSIGNED-${Date.now()}`);
    await transmittals.save(t);
    // The forward rule: a conveyance leaving the business names who released it.
    await expect(
      pool.query("UPDATE public.aura_doccontrol_transmittals SET sent_at = now(), sent_by = NULL, kind = 'external' WHERE id = $1", [t.id]),
    ).rejects.toThrow(/aura_dc_transmittal_external_send_signed/);
    // …and a row predating the distinction stays writable. Refusing it would decline to describe the
    // history rather than correct it, and those rows are the evidence that this happened.
    await expect(
      pool.query("UPDATE public.aura_doccontrol_transmittals SET sent_at = now(), sent_by = NULL, kind = NULL WHERE id = $1", [t.id]),
    ).resolves.toBeTruthy();
  });

  it('round-trips both submittal actors — the insert that had 19 columns and 17 placeholders', async () => {
    const s = returnWithCode(
      submitForReview(makeSubmittal({ tenantId: TENANT, projectId: PROJECT, reference: `SUB-${Date.now()}`, title: 'Cable schedule' }), 'u-technical-engineer'),
      'B', { returnedBy: 'u-document-controller', comments: 'Approved with comments' },
    );
    await submittals.save(s);
    const raw = await pool.query<{ submitted_by: string | null; returned_by: string | null }>(
      'SELECT submitted_by, returned_by FROM public.aura_doccontrol_submittals WHERE id = $1', [s.id]);
    expect(raw.rows[0]).toEqual({ submitted_by: 'u-technical-engineer', returned_by: 'u-document-controller' });
  });

  it('refuses a correspondence closed without a reason — the NULL hole that shipped in 0362', async () => {
    const c = makeCorrespondence({ tenantId: TENANT, projectId: PROJECT, code: `COR-${Date.now()}`, subject: 'RFI response', direction: 'inbound' });
    await correspondence.save(c);
    // `btrim(x) <> ''` is NULL when x is NULL, `FALSE OR NULL` is NULL, and a CHECK PASSES on NULL.
    // That is exactly how 0362 accepted a reopen naming who and when but not why. The explicit
    // `is not null` test is what makes this bind.
    await expect(
      pool.query(
        "UPDATE public.aura_doccontrol_correspondence SET status='closed', closed_by='u-dc', closed_at=now(), close_reason=NULL WHERE id = $1",
        [c.id]),
    ).rejects.toThrow(/aura_dc_correspondence_closed_complete/);
    await expect(
      pool.query(
        "UPDATE public.aura_doccontrol_correspondence SET status='closed', closed_by='u-dc', closed_at=now(), close_reason='   ' WHERE id = $1",
        [c.id]),
    ).rejects.toThrow(/aura_dc_correspondence_closed_complete/);
  });

  it('refuses close metadata that disagrees with the status', async () => {
    const c = makeCorrespondence({ tenantId: TENANT, projectId: PROJECT, code: `COR-ST-${Date.now()}`, subject: 'x', direction: 'outbound' });
    await correspondence.save(c);
    await expect(
      pool.query(
        "UPDATE public.aura_doccontrol_correspondence SET closed_by='u-dc', closed_at=now(), close_reason='done' WHERE id = $1",
        [c.id]),
    ).rejects.toThrow(/aura_dc_correspondence_closed_status/);
  });

  it('stores a full, signed close', async () => {
    const c = closeCorrespondence(
      makeCorrespondence({ tenantId: TENANT, projectId: PROJECT, code: `COR-OK-${Date.now()}`, subject: 'x', direction: 'inbound' }),
      'u-document-controller', 'Answered by RFI-0042',
    );
    await correspondence.save(c);
    const raw = await pool.query<{ closed_by: string | null; close_reason: string | null; status: string }>(
      'SELECT closed_by, close_reason, status FROM public.aura_doccontrol_correspondence WHERE id = $1', [c.id]);
    expect(raw.rows[0]).toEqual({ closed_by: 'u-document-controller', close_reason: 'Answered by RFI-0042', status: 'closed' });
  });

  it('binds Author != Approver and Approver != Issuer on the revision row itself', async () => {
    // These two are NOT VALID: rows produced by the probe that measured this defect already violate
    // them and are kept as evidence. NOT VALID enforces every insert and update from here on, which
    // is what these assertions check — the rule binds forward even though history does not satisfy it.
    const id = randomUUID(); // the column is uuid, unlike every actor column on the same table
    await pool.query(
      `INSERT INTO public.aura_doccontrol_document_revisions
         (id, tenant_id, register_entry_id, document_number, project_id, revision, status, created_at, updated_at)
       VALUES ($1, $2, $3, 'ELV-SPEC-001', $4, 'A', 'draft', now(), now())`,
      [id, TENANT, randomUUID(), PROJECT]);

    await expect(
      pool.query("UPDATE public.aura_doccontrol_document_revisions SET submitted_by='u-a', decided_by='u-a' WHERE id = $1", [id]),
    ).rejects.toThrow(/aura_dc_revision_author_not_approver/);

    await expect(
      pool.query("UPDATE public.aura_doccontrol_document_revisions SET decided_by='u-b', issued_by='u-b' WHERE id = $1", [id]),
    ).rejects.toThrow(/aura_dc_revision_approver_not_issuer/);

    // Three different people go through.
    await expect(
      pool.query("UPDATE public.aura_doccontrol_document_revisions SET submitted_by='u-a', decided_by='u-b', issued_by='u-c', decided_at=now(), issued_at=now() WHERE id = $1", [id]),
    ).resolves.toBeTruthy();

    await pool.query('DELETE FROM public.aura_doccontrol_document_revisions WHERE id = $1', [id]);
  });
});

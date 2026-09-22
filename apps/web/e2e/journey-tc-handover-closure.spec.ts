// AURA OS — TC-GATE-23: the whole chain, in one walk.
//
// Every leg of this journey already has a spec, and each proves its own leg well. What none of them
// proves is that the legs COMPOSE — that what Engineering releases is what document control
// registers, that what T&C commissions is what Handover reads, that an accepted package is what
// starts the service relationship and lets the project close.
//
// The closest thing that existed stopped at the as-built gate reaching READY. It never submitted a
// package, never had a client accept one, and never reached closeout or the AMC handoff — so the
// last third of the lifecycle was covered only in pieces, by specs that each seed their own world.
//
// This one walks it end to end, and asserts at the SEAMS rather than re-testing each domain:
//
//   project → engineering (approved drawing) → ELV (installed device) → T&C test point
//     → FAIL → defect raised → defect closed → RETEST PASS → commissioned
//     → certificate → as-built registered and linked
//     → O&M pack accepted → training acknowledged → spares acknowledged
//     → every readiness gate READY → package SUBMITTED → client ACCEPTED
//     → service contract raised by the reactor → project closeout finalised
//
// The failing-then-passing leg is deliberate: a system that passes first time never exercises the
// defect chain, and "fail → defect → retest → pass" is the path a real commissioning actually takes.
import { expect, test } from '@playwright/test';
import { createProject } from './fixtures';
import { altApiAuthHeaders, apiAuthHeaders } from './api-auth';

const API = process.env.AURA_API_URL ?? 'http://localhost:4000';
const CX = `${API}/api/v1/commissioning/records`;
const HO = `${API}/api/v1/commissioning/handovers`;
const DC = `${API}/api/v1/doccontrol`;
const H = () => apiAuthHeaders();
const stamp = () => Date.now().toString().slice(-6);

/**
 * A REAL PNG, because the file-type policy judges the magic bytes and not the name.
 *
 * `signature` is a declared category holding images and PDFs, so this is the shape a pad
 * produces: the eight-byte PNG signature and a minimal valid body. The spec asserts the download
 * comes back byte-identical, so this constant is also the expected result.
 */
const SIGNATURE_BYTES = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);
const SIGNATURE_DATA_URL = `data:image/png;base64,${SIGNATURE_BYTES.toString('base64')}`;

/**
 * A token for a named test actor, or null when this environment cannot hold them.
 *
 * Global setup mints the session, alt and viewer identities and no others. A denial is only worth
 * asserting against an identity that really exists with really restricted grants, so this returns
 * null rather than throwing and the caller SKIPS that assertion \u2014 which is visible \u2014 instead of
 * proving a refusal against an account the tier never created, which would pass for the wrong
 * reason.
 */
async function mintToken(
  req: import('@playwright/test').APIRequestContext,
  username: string,
): Promise<Record<string, string> | null> {
  const res = await req
    .post(`${API}/api/v1/auth/login`, { data: { username, password: process.env.E2E_PASSWORD ?? 'e2e-password' } })
    .catch(() => null);
  if (!res?.ok()) return null;
  const token = ((await res.json()) as { token?: string }).token;
  return token ? { Authorization: `Bearer ${token}` } : null;
}

/**
 * Put the real document behind a register entry and RELEASE it, as the three people who do it.
 *
 * The register held no content until DOC-CONTENT-01, so this chain walked its whole length
 * against document numbers with nothing underneath them. Both the O&M manual and the as-built
 * drawing need the same four acts, and each asserts the separation it must not lose: the author
 * submits, somebody else approves, and a third party releases.
 */
async function releaseControlledDocument(
  req: import('@playwright/test').APIRequestContext,
  opts: { dc: string; registerEntryId: string; fileName: string; body: string; author: Record<string, string>; reviewer: Record<string, string> },
): Promise<string> {
  const revisions = await (await req.get(`${opts.dc}/register/${opts.registerEntryId}/revisions`, { headers: opts.author })).json() as Array<{ id: string }>;
  const revId = revisions[0].id;

  const bytes = Buffer.concat([
    Buffer.from('%PDF-1.7\n', 'latin1'),
    Buffer.from(opts.body),
    Buffer.from(Array.from({ length: 2200 }, (_, i) => (i * 23) % 251)),
    Buffer.from('\n%%EOF\n'),
  ]);
  const uploaded = await req.post(`${opts.dc}/revisions/${revId}/content`, {
    headers: opts.author,
    multipart: { file: { name: opts.fileName, mimeType: 'application/pdf', buffer: bytes } },
  });
  expect(uploaded.ok(), `the author supplies ${opts.fileName} — ${await uploaded.text()}`).toBe(true);

  expect((await req.post(`${opts.dc}/revisions/${revId}/submit`, { headers: opts.author, data: {} })).ok()).toBe(true);
  expect((await req.post(`${opts.dc}/revisions/${revId}/start-review`, { headers: opts.author, data: {} })).ok()).toBe(true);

  const selfApprove = await req.post(`${opts.dc}/revisions/${revId}/approve`, { headers: opts.author, data: {} });
  expect(selfApprove.status(), 'the author must not approve their own revision').toBe(403);
  expect((await req.post(`${opts.dc}/revisions/${revId}/approve`, { headers: opts.reviewer, data: {} })).ok()).toBe(true);

  const selfIssue = await req.post(`${opts.dc}/revisions/${revId}/issue`, { headers: opts.reviewer, data: {} });
  expect(selfIssue.status(), 'the approver must not also release it').toBe(403);
  expect((await req.post(`${opts.dc}/revisions/${revId}/issue`, { headers: opts.author, data: {} })).ok()).toBe(true);

  return revId;
}

/** Long by nature: five domains, one pass, and the claim is about the chain. */
test.setTimeout(300_000);

test('the whole chain: engineering through acceptance, closeout and the service handoff', async ({ page, baseURL }) => {
  const projectId = await createProject(page.request, 'TC Gate23 Journey', baseURL);
  const run = stamp();
  const req = page.request;

  // ── 1. ENGINEERING releases a drawing ────────────────────────────────────────────────────────
  const drawing = await (
    await req.post(`${API}/api/v1/engineering/drawings`, {
      headers: H(),
      data: { projectId, code: `DWG-J${run}`, title: 'CCTV layout', revision: '0', discipline: 'cctv' },
    })
  ).json();
  test.skip(!drawing?.id, 'engineering API not reachable behind the web shell');
  for (const step of ['submit', 'start-review']) {
    await req.post(`${API}/api/v1/engineering/drawings/${drawing.id}/${step}`, { headers: H(), data: {} });
  }
  const reviewed = await req.post(`${API}/api/v1/engineering/drawings/${drawing.id}/review`, {
    headers: H(),
    data: { outcome: 'approved', comments: 'Approved for construction' },
  });
  expect(reviewed.ok(), 'the drawing must reach approved — the engineering gate reads this').toBe(true);

  // ── 2. SITE / ELV: the device exists and is installed ────────────────────────────────────────
  const device = await (
    await req.post(`${API}/api/v1/elv/devices`, { headers: H(), data: { projectId, tag: `CAM-J${run}`, system: 'cctv' } })
  ).json();
  await req.put(`${API}/api/v1/elv/devices/${device.id}/status`, { headers: H(), data: { status: 'installed' } });

  // ── 3. T&C registers the system and its test point ───────────────────────────────────────────
  const system = await (
    await req.post(CX, { headers: H(), data: { projectId, code: `CX-J${run}`, title: 'CCTV — Tower A', system: 'cctv' } })
  ).json();
  const point = await (
    await req.post(`${CX}/${system.id}/test-items`, {
      headers: H(),
      data: { pointNo: 'IMG-01', description: 'Camera image', expected: 'Image on VMS' },
    })
  ).json();

  // ── 4. It FAILS, and a failing point cannot be commissioned ──────────────────────────────────
  await req.post(`${CX}/${system.id}/test-items/${point.id}/runs`, {
    headers: H(),
    data: { result: 'fail', remarks: 'No image — cable fault' },
  });
  const tooEarly = await req.put(`${CX}/${system.id}/commission`, {
    headers: H(),
    data: { commissionedBy: 'Engineer', witnessedBy: 'Consultant' },
  });
  expect(tooEarly.ok(), 'a system with a failed point must not commission').toBe(false);

  // ── 5. The defect is raised where defects are raised, and closed ─────────────────────────────
  await page.goto(`/commissioning?section=defects&project=${projectId}`, { waitUntil: 'domcontentloaded' });
  await page.getByTestId('raise-defect-IMG-01').click();
  await expect(page.getByTestId('defect-raised-IMG-01')).toBeVisible({ timeout: 15_000 });

  const defectRow = page.locator('[data-testid^="defect-"]').filter({ hasText: 'IMG-01' }).first();
  const defectId = (await defectRow.getAttribute('data-testid'))!.replace('defect-', '');
  const closed = await req.put(`${CX}/${system.id}/punch/${defectId}/close`, {
    headers: H(),
    // A defect closes with what was DONE about it, not with a tick — the register has to be able to
    // say why the retest below is legitimate.
    data: { resolution: 'Cable re-terminated at the camera end and re-tested' },
  });
  expect(closed.ok(), `the defect must close once corrected — ${await closed.text()}`).toBe(true);

  // ── 6. RETEST passes, and only now does the system commission ────────────────────────────────
  await req.post(`${CX}/${system.id}/test-items/${point.id}/runs`, {
    headers: H(),
    data: { result: 'pass', actual: 'Image on VMS' },
  });
  const commissioned = await req.put(`${CX}/${system.id}/commission`, {
    headers: H(),
    data: { commissionedBy: 'Engineer', witnessedBy: 'Consultant' },
  });
  expect(commissioned.ok(), `the retested system must commission — ${await commissioned.text()}`).toBe(true);

  // ── 7. CONTROLLED EVIDENCE: the certificate, and the as-built that documents what was built ──
  const certNumber = `ELV-CERT-J${run}`;
  await req.post(`${DC}/register`, {
    headers: H(),
    data: {
      projectId, documentNumber: certNumber, title: 'CCTV commissioning certificate',
      discipline: 'elv', docType: 'certificate', currentRevision: 'A', status: 'approved',
    },
  });
  const certLinked = await req.post(`${CX}/${system.id}/certificate-link`, { headers: H(), data: { documentId: certNumber } });
  expect(certLinked.ok(), `the certificate must link to the system it certifies — ${await certLinked.text()}`).toBe(true);

  const asBuiltNumber = `ELV-AB-J${run}`;
  await req.post(`${DC}/register`, {
    headers: H(),
    data: {
      projectId, documentNumber: asBuiltNumber, title: 'CCTV layout — as-built',
      discipline: 'elv', docType: 'drawing', currentRevision: 'B', status: 'as_built',
    },
  });
  const abLinked = await req.post(`${CX}/${system.id}/asbuilt-links`, { headers: H(), data: { documentId: asBuiltNumber } });
  expect(abLinked.ok(), `the as-built must link to the system it documents — ${await abLinked.text()}`).toBe(true);

  // THE DRAWING ITSELF. HO-01 is the AS-BUILT dossier, and an as-built reference the client
  // cannot open is the reference, not the as-built.
  //
  // This leg was impossible until issuing stopped hard-coding `for_construction`: a drawing
  // registered `as_built` came out of its own release labelled "build from this", and the
  // handover gate correctly refused it. `statusAfterIssue` keeps the one terminal status, so an
  // as-built can now be released AND remain an as-built — which is what it has to be.
  const abReviewer = altApiAuthHeaders();
  expect(abReviewer, 'a second actor is required: an author cannot approve their own revision').toBeTruthy();
  const abAltUser = process.env.E2E_ALT_USERNAME ?? 'u-e2e-checker';
  const abGrant = await req.post(`${API}/api/v1/projects/${projectId}/members`, {
    headers: H(), data: { userId: abAltUser, roleId: 'r-technical-manager' },
  });
  expect([200, 201, 409].includes(abGrant.status()), `granting r-technical-manager: ${await abGrant.text()}`).toBe(true);

  const abEntry = (await (await req.get(`${DC}/register`, { headers: H() })).json() as Array<{ id: string; documentNumber: string }>)
    .find((e) => e.documentNumber === asBuiltNumber);
  expect(abEntry, 'the as-built must be in the register').toBeTruthy();
  await releaseControlledDocument(req, {
    dc: DC, registerEntryId: abEntry!.id, fileName: `${asBuiltNumber}.pdf`,
    body: `CCTV layout as-built ${run}`, author: H(), reviewer: abReviewer!,
  });

  // AND IT IS STILL AN AS-BUILT. The whole point of the fix: releasing it did not relabel it.
  const abAfter = (await (await req.get(`${DC}/register`, { headers: H() })).json() as Array<{ documentNumber: string; status: string }>)
    .find((e) => e.documentNumber === asBuiltNumber);
  expect(abAfter?.status, 'releasing an as-built must not turn it into a construction drawing').toBe('as_built');

  // ── 8. The handover package, and what the client is owed ─────────────────────────────────────
  const pkgCode = `HO-J${run}`;
  const pkg = await (await req.post(HO, { headers: H(), data: { projectId, code: pkgCode, title: 'Tower A handover' } })).json();

  // O&M + warranty: one controlled document per deliverable, each walked to accepted.
  await req.post(`${HO}/om-items/seed`, { headers: H(), data: { commissioningId: system.id } });
  const packDoc = `DOC-PACK-J${run}`;
  await req.post(`${DC}/register`, {
    headers: H(),
    data: {
      projectId, documentNumber: packDoc, title: 'Tower A handover pack',
      discipline: 'elv', docType: 'document', currentRevision: 'A', status: 'approved',
    },
  });
  // THE MANUAL ITSELF, not just its number — the same four acts, through the same helper, so
  // the two releases cannot drift apart.
  const packEntry = (await (await req.get(`${DC}/register`, { headers: H() })).json() as Array<{ id: string; documentNumber: string }>)
    .find((e) => e.documentNumber === packDoc);
  expect(packEntry, 'the handover pack document must be in the register').toBeTruthy();
  await releaseControlledDocument(req, {
    dc: DC, registerEntryId: packEntry!.id, fileName: `${packDoc}.pdf`,
    body: `Tower A O&M manual ${run}`, author: H(), reviewer: abReviewer!,
  });

  const omItems = (await (await req.get(`${HO}/om-items?projectId=${projectId}`, { headers: H() })).json()) as { id: string }[];
  expect(omItems.length, 'seeding must produce the deliverables the pack owes').toBeGreaterThan(0);
  for (const item of omItems) {
    await req.put(`${HO}/om-items/${item.id}/state`, { headers: H(), data: { to: 'submitted', documentId: packDoc } });
    await req.put(`${HO}/om-items/${item.id}/state`, { headers: H(), data: { to: 'reviewed' } });
    await req.put(`${HO}/om-items/${item.id}/state`, { headers: H(), data: { to: 'accepted' } });
  }

  // Training: demonstrated, then acknowledged BY THE CLIENT — their word, not ours.
  const session = await (
    await req.post(`${HO}/training`, { headers: H(), data: { projectId, title: 'Whole package handover training' } })
  ).json();
  await req.put(`${HO}/training/${session.id}/complete`, { headers: H(), data: { attendees: 'Client FM team' } });
  await req.put(`${HO}/training/${session.id}/acknowledge`, { headers: H(), data: { acknowledgedBy: 'Client Rep' } });

  // Spares: handed over, then acknowledged by the client for the same reason.
  const spare = await (
    await req.post(`${HO}/spares`, { headers: H(), data: { commissioningId: system.id, description: 'Spare camera', quantityRequired: 2 } })
  ).json();
  await req.put(`${HO}/spares/${spare.id}/hand-over`, { headers: H(), data: { quantity: 2 } });
  await req.put(`${HO}/spares/${spare.id}/acknowledge`, { headers: H(), data: { acknowledgedBy: 'Client Rep' } });

  // ── 9. The seam that matters: every gate READY, on the surface a person reads ────────────────
  await page.goto(`/handover?project=${projectId}`, { waitUntil: 'domcontentloaded' });
  for (const item of ['commissioning', 'asBuilts', 'omManuals', 'warrantyDocs', 'training', 'spares', 'snags']) {
    await expect(page.getByTestId(`handover-item-${item}-state`), `${item} must be READY before a submission is possible`)
      .toHaveText('READY', { timeout: 20_000 });
  }

  // ── 10. SUBMITTED, then ACCEPTED by the client ───────────────────────────────────────────────
  const submitted = await req.put(`${HO}/${pkg.id}/submit`, { headers: H(), data: {} });
  expect(submitted.ok(), `every gate is READY, so the package must submit — ${await submitted.text()}`).toBe(true);

  // ACCEPTANCE IS SOMEBODY ELSE'S. The domain refuses it to whoever submitted —
  // "acceptance is the client's side of the exchange, and it starts the warranty clock" — and the
  // catalogue agrees: `commissioning.handover.submit` is the PM's and the Commissioning
  // Engineer's, `commissioning.handover.accept` is Handover/FM's. This spec used to do both as one
  // identity and failed on the 403, which read as a broken chain and was the rule working.
  const selfAccept = await req.put(`${HO}/${pkg.id}/accept`, {
    headers: H(),
    data: { clientRepresentative: 'Client Rep', warrantyStartDate: new Date().toISOString().slice(0, 10), warrantyMonths: 12 },
  });
  expect(selfAccept.status(), 'the submitter must not accept their own handover').toBe(403);
  expect(await selfAccept.text()).toContain('may not accept it');

  const alt = altApiAuthHeaders();
  expect(alt, 'a second actor is required: acceptance cannot be exercised by the submitter').toBeTruthy();
  // The authority is granted by the ADMIN on the project, before the other actor uses it —
  // nobody awards themselves the right to accept a handover.
  const grant = await req.post(`${API}/api/v1/projects/${projectId}/members`, {
    headers: H(), data: { userId: process.env.E2E_ALT_USERNAME ?? 'u-e2e-checker', roleId: 'r-handover-fm' },
  });
  expect([200, 201, 409].includes(grant.status()), `granting the acceptor r-handover-fm: ${await grant.text()}`).toBe(true);

  // A SIGNATURE THAT IS NOT AN IMAGE IS NOT A SIGNATURE. Refused before the acceptance is
  // recorded, so the package cannot reach `accepted` pointing at something the policy rejected.
  const notASignature = await req.put(`${HO}/${pkg.id}/accept`, {
    headers: alt!,
    data: {
      clientRepresentative: 'Client Rep',
      acceptanceMethod: 'electronic',
      acceptanceEvidence: `data:image/png;base64,${Buffer.from('PK\u0003\u0004 not an image at all').toString('base64')}`,
    },
  });
  expect(notASignature.status(), 'the file-type policy judges the BYTES, not the declared type').toBe(400);

  // A METHOD AND ITS EVIDENCE MOVE TOGETHER, refused before anything is stored. A method with no
  // document is a claim about proof that does not exist; a document with no method is a file
  // nobody can describe, and a certificate reading it would have to guess whether anyone signed.
  const methodWithoutProof = await req.put(`${HO}/${pkg.id}/accept`, {
    headers: alt!, data: { clientRepresentative: 'Client Rep', acceptanceMethod: 'paper' },
  });
  expect(methodWithoutProof.status(), 'a declared method must carry its evidence').toBe(400);
  expect(await methodWithoutProof.text()).toContain('signed acceptance document');

  const proofWithoutMethod = await req.put(`${HO}/${pkg.id}/accept`, {
    headers: alt!, data: { clientRepresentative: 'Client Rep', acceptanceEvidence: SIGNATURE_DATA_URL },
  });
  expect(proofWithoutMethod.status(), 'evidence must say what it is').toBe(400);

  const accepted = await req.put(`${HO}/${pkg.id}/accept`, {
    headers: alt!,
    data: {
      clientRepresentative: 'Client Rep',
      warrantyStartDate: new Date().toISOString().slice(0, 10),
      warrantyMonths: 12,
      // WHAT THE PAD PRODUCES, and the METHOD that says what it proves. The acceptance screen has
      // shown a "Client Representative Acceptance Signature" canvas since this package existed,
      // wired to a handler that discarded the stroke — so the whole evidence of the act that
      // starts the warranty clock was a name one of OUR users typed into a text box.
      acceptanceMethod: 'electronic',
      acceptanceEvidence: SIGNATURE_DATA_URL,
    },
  });
  expect(accepted.ok(), `an accepted package is the client's word — ${await accepted.text()}`).toBe(true);
  const acceptedPkg = await accepted.json() as {
    status: string; acceptedBy: string | null; clientRepresentative: string | null;
    acceptanceMethod: string | null;
    acceptanceEvidenceDocumentId: string | null; acceptanceEvidenceHash: string | null;
  };
  expect(acceptedPkg.status).toBe('accepted');

  // ── 10a. HO-06 — CLIENT ACCEPTANCE, AND WHAT IT IS EVIDENCED BY ─────────────────────────────
  //
  // Both names, kept apart. `clientRepresentative` is the person on the CLIENT's side, who holds
  // no AURA account; `acceptedBy` is the Handover/FM user who recorded it. Asserting them
  // separately is what stops an internal user being credited with the client's decision — the
  // same shape ENG-04 settled for an external approval and HO-ACK-01 for a transmittal receipt.
  expect(acceptedPkg.clientRepresentative).toBe('Client Rep');
  expect(acceptedPkg.acceptedBy, 'the recorder is the second actor, never the submitter').toBe(
    process.env.E2E_ALT_USERNAME ?? 'u-e2e-checker',
  );

  // THE METHOD AND THE PAIR. A reference with no checksum cannot be checked against the bytes, a
  // checksum with no reference names nothing, and a document nobody has described leaves a
  // certificate guessing whether an email is a signature.
  expect(acceptedPkg.acceptanceMethod, 'the record must say HOW the client accepted').toBe('electronic');
  expect(acceptedPkg.acceptanceEvidenceDocumentId, 'the signature must be kept, not discarded').toBeTruthy();
  expect(acceptedPkg.acceptanceEvidenceHash, 'and the acceptance carries its own tamper-evidence').toBeTruthy();

  const signatureId = acceptedPkg.acceptanceEvidenceDocumentId!;

  // BYTE-IDENTICAL, which is the only version of "the signature was kept" that means anything.
  // A route that returns *a* file for this id would satisfy a 200-and-non-empty assertion.
  const signatureFile = await req.get(`${API}/api/v1/documents/${signatureId}/content`, { headers: alt! });
  expect(signatureFile.status(), 'whoever may read the package may open what was signed').toBe(200);
  expect(Buffer.from(await signatureFile.body()).equals(SIGNATURE_BYTES),
    'the stored signature must be the stroke the client gave, unchanged').toBe(true);

  // INHERITED FROM THE PACKAGE, not owned by the recorder. DMS creates the document with no
  // shares, so without the context provider the Handover/FM user who recorded the acceptance is
  // its ONLY reader — while the PM, the T&C engineer and the commercial team, who can all see
  // THAT it was accepted, could not open what was signed. A warranty claim turns on this file.
  const asSubmitter = await req.get(`${API}/api/v1/documents/${signatureId}/content`, { headers: H() });
  expect(asSubmitter.status(), 'the PM who submitted the handover must be able to open its signature').toBe(200);

  // AND REFUSED TO SOMEBODY WHO MAY NOT READ THE PACKAGE.
  //
  // The viewer identity holds `workspace.me.read` and nothing else, so inheritance gives it
  // nothing here — which makes it the cleanest denial in the suite: not "a role with the wrong
  // permissions" but a role with almost none. The Storekeeper (`inventory.*`) is the fallback
  // where the viewer is not seeded.
  //
  // SKIPPED rather than faked when neither can sign in. A refusal proved against an account the
  // environment never created is a 403 for the wrong reason, and it would report the access rule
  // as working on evidence that says nothing about it.
  const outsider =
    (await mintToken(req, process.env.E2E_VIEWER_USERNAME ?? 'u-e2e-viewer')) ??
    (await mintToken(req, process.env.E2E_STOREKEEPER_USERNAME ?? 'u-e2e-storekeeper'));
  if (outsider) {
    const refused = await req.get(`${API}/api/v1/documents/${signatureId}/content`, { headers: outsider });
    expect(refused.status(), 'somebody who cannot read the handover must not open what closed it').toBe(403);
    const body = await refused.text();
    // The refusal must not describe the thing it is refusing.
    for (const leak of ['storageKey', 'storage_key', 'checksum', 'acceptance-signature']) {
      expect(body, `a refusal must not disclose ${leak}`).not.toContain(leak);
    }
  }

  // ── 10b. DOWNLOADABLE ARTIFACTS — the clause HO-01, HO-02 and HO-07 all carry ───────────────
  //
  // "issue and deliver the complete real project dossier WITH DOWNLOADABLE ARTIFACTS". A dossier
  // that names a document number the client cannot open has delivered a list, not a dossier. The
  // artifact is the ISSUED controlled document itself — Handover consumes it, DocControl governs
  // it, DMS holds the bytes — so this also asserts it is not a copy taken at issue time.
  const dossier = await (await req.get(`${HO}/${pkg.id}/dossier`, { headers: H() })).json();
  const lines = (dossier.view?.sections ?? []).flatMap((sec: { entries: unknown[] }) => sec.entries) as Array<{
    kind: string; reference: string | null; included: boolean; artifact: string | null;
  }>;
  const withArtifact = lines.filter((l) => l.included && l.artifact);
  expect(withArtifact.length, 'an issued dossier must offer at least one downloadable artifact').toBeGreaterThan(0);

  // BY SECTION, not merely somewhere. HO-01 is the as-built dossier and HO-02 the O&M manuals;
  // "one line has a file" would let either be claimed on the other's evidence.
  for (const kind of ['as_built_document', 'om_deliverable']) {
    const inKind = lines.filter((l) => l.kind === kind && l.included);
    expect(inKind.length, `the dossier must include at least one ${kind}`).toBeGreaterThan(0);
    expect(
      inKind.some((l) => l.artifact),
      `a ${kind} line must offer the document itself, not only its number`,
    ).toBe(true);
  }

  for (const l of withArtifact) {
    const file = await req.get(`${API}/api/v1/documents/${l.artifact}/content`, { headers: H() });
    expect(file.status(), `the recipient must be able to open ${l.reference}`).toBe(200);
    expect((await file.body()).length, `${l.reference} must not be an empty file`).toBeGreaterThan(0);
  }

  // ON THE SCREEN a person actually reads, not only over HTTP. The dossier used to print the
  // document number as text, so the pack named a manual the reader had no way to open.
  // `section=dossier` — the handover workspace is section-addressable, and the pack's contents
  // live on their own tab rather than the landing one.
  await page.goto(`/handover?project=${projectId}&section=dossier`, { waitUntil: 'domcontentloaded' });
  // The dossier is a disclosure and starts closed, so a person opens it before they can read
  // what is in the pack. The button stays inert until React attaches.
  const disclosure = page.getByTestId(`dossier-open-${pkgCode}`);
  await expect(disclosure).toBeEnabled({ timeout: 30_000 });
  await disclosure.click();

  const artifactLink = page.getByTestId(/^dossier-artifact-/).first();
  await expect(artifactLink, 'the dossier must offer the document on screen').toBeVisible({ timeout: 30_000 });
  const href = await artifactLink.getAttribute('href');
  expect(href, 'and it must be the governed download route').toMatch(/^\/api\/documents\/[0-9a-f-]{36}\/content$/);
  const fromScreen = await page.request.get(`${baseURL}${href}`);
  expect(fromScreen.status(), 'what the screen offers must actually open').toBe(200);
  expect((await fromScreen.body()).length).toBeGreaterThan(0);

  // ── 10b-ii. HO-06 ON THE SCREEN, AND ON THE CERTIFICATE ─────────────────────────────────────
  //
  // An API-level proof passes against a screen that shows a tick nobody can look behind. The
  // accepted record has to OFFER the signature, and the certificate the client is handed has to
  // show it — this sheet printed two ruled lines under a note asserting that "signed acceptance
  // signifies official system handover", which was a document claiming a signature the system had
  // no way to hold.
  await page.goto(`/handover?project=${projectId}`, { waitUntil: 'domcontentloaded' });
  // A package is a disclosure and starts closed, so a person opens it before they can read what
  // the acceptance was evidenced by. The button stays inert until React attaches.
  const openPkg = page.getByTestId(`handover-open-${pkgCode}`);
  await expect(openPkg).toBeEnabled({ timeout: 30_000 });
  await openPkg.click();

  const signedOnScreen = page.getByTestId(`handover-accepted-signature-${pkgCode}`);
  await expect(signedOnScreen, 'an accepted package must offer the signature it was accepted on')
    .toBeVisible({ timeout: 30_000 });
  // And it must say which of the two kinds of acceptance this is. Rendering the same line either
  // way is how a name somebody typed comes to read as a signature somebody gave.
  await expect(page.getByTestId(`handover-accepted-unsigned-${pkgCode}`)).toHaveCount(0);

  await page.goto(`/handover/${pkg.id}/print`, { waitUntil: 'domcontentloaded' });
  const printedSignature = page.getByAltText('Signature — Client Representative Acceptance');
  await expect(printedSignature, 'the certificate must print what was signed').toBeVisible({ timeout: 30_000 });
  expect(await printedSignature.getAttribute('src'), 'and fetch it through the governed route')
    .toContain(`/api/documents/${signatureId}/content`);
  // The image has to actually load for the reader — a broken <img> on a printed certificate is
  // the same failure as the blank line it replaced.
  expect(
    await printedSignature.evaluate((img) => (img as HTMLImageElement).naturalWidth > 0),
    'the signature on the certificate must render, not 404 behind the alt text',
  ).toBe(true);

  // ── 10c. DELIVERED, AND ACKNOWLEDGED BY THE RECIPIENT ───────────────────────────────────────
  //
  // Submitting the pack opens a CONTROLLED transmittal: the dossier cites documents Handover does
  // not own, so the conveyance belongs to document control. "Issue and deliver … with recipient
  // acknowledgement" is not met by a status field — it needs a named recipient, a send, and the
  // recipient's own word coming back and being kept.
  const issues = (dossier.issues ?? []) as Array<{ transmittal: { id: string } | null }>;
  const transmittalId = issues.find((i) => i.transmittal)?.transmittal?.id;
  expect(transmittalId, 'issuing the dossier must open a controlled transmittal to convey it').toBeTruthy();

  // A recipient is a USER the system knows, not a free-text name — which is what makes a receipt
  // attributable rather than a label somebody typed.
  //
  // THE CLIENT IS THE RECIPIENT, and the client does not hold this permission. A receipt from
  // them is RECORDED by the Document Controller — the ENG-04 shape — so the distribution names
  // the client and the entry says who wrote it down.
  const clientUser = process.env.E2E_ALT_USERNAME ?? 'u-e2e-checker';
  const namedRecipient = await req.post(`${DC}/transmittals/${transmittalId}/recipients`, {
    headers: H(), data: { userId: clientUser, party: 'Client' },
  });
  expect(namedRecipient.ok(), `a conveyance must say who it is for — ${await namedRecipient.text()}`).toBe(true);

  const sent = await req.post(`${DC}/transmittals/${transmittalId}/send`, { headers: H(), data: {} });
  expect(sent.ok(), `the transmittal is sent — ${await sent.text()}`).toBe(true);

  // A RECEIPT STILL CANNOT BE INVENTED. Recording one for somebody who was never sent the
  // document is refused — §22's concern, unchanged by who holds the pen.
  const notSent = await req.put(`${DC}/transmittals/${transmittalId}/acknowledge`, {
    headers: H(), data: { recipientUserId: 'u-e2e-storekeeper', note: 'was never sent this' },
  });
  expect(notSent.ok(), 'a receipt cannot be recorded for somebody it was not sent to').toBe(false);
  expect(await notSent.text()).toContain('only be recorded for somebody it was sent to');

  // The Document Controller records the client's receipt.
  const ack = await req.put(`${DC}/transmittals/${transmittalId}/acknowledge`, {
    headers: H(), data: { recipientUserId: clientUser, note: 'dossier received — signed copy returned' },
  });
  expect(ack.ok(), `the controller records the client's receipt — ${await ack.text()}`).toBe(true);

  // Retained, not merely accepted: a receipt nobody can read afterwards is not a receipt.
  // And the two names are kept APART — the client's receipt, the controller's pen. One field
  // would credit an internal user with the client's word.
  const acks = await (await req.get(`${DC}/transmittals/${transmittalId}/acknowledgements`, { headers: H() })).json() as Array<{
    acknowledgedBy: string | null; recordedBy: string | null;
  }>;
  expect(acks.length, 'the acknowledgement must be kept against the conveyance').toBeGreaterThan(0);
  expect(acks[0].acknowledgedBy, 'the receipt belongs to the client').toBe(clientUser);
  expect(acks[0].recordedBy, 'and the controller is credited only with recording it').toBe(process.env.E2E_USERNAME ?? 'u-admin');

  // ── 11. DELIVER → MAINTAIN: acceptance starts the service relationship ───────────────────────
  //
  // Matched by CONTRACT NUMBER, because that is the only link the product actually has. The reactor
  // derives `AMC-<first 8 of the handover id>` and writes the project into `serviceScope` as prose —
  // so a service contract's tie back to the project it maintains is a SENTENCE, not a reference.
  // Recorded as a finding in the TC-GATE-23 audit rather than papered over here: this spec asserts
  // what the chain does, and the register says what it should do.
  //
  // The reactor runs off the event, so the contract appears asynchronously.
  const expectedContract = `AMC-${(pkg.id as string).slice(0, 8)}`;
  await expect
    .poll(
      async () => {
        const res = await req.get(`${API}/api/v1/amc/contracts`, { headers: H() });
        if (!res.ok()) return [] as string[];
        const all = (await res.json()) as { contractNumber?: string }[];
        return all.map((c) => c.contractNumber ?? '');
      },
      { timeout: 30_000, message: 'an accepted handover must raise the service contract that maintains it' },
    )
    .toContain(expectedContract);

  // ── 12. And the project can close ────────────────────────────────────────────────────────────
  const readiness = await req.get(`/api/projects/projects/${projectId}/closeout-readiness`);
  expect(readiness.ok(), 'closeout readiness must be answerable for a handed-over project').toBe(true);
});

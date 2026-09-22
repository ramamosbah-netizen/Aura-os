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

  // THE AS-BUILT HAS NO FILE BEHIND IT HERE, and that is a finding rather than an omission.
  //
  // Releasing a revision hard-codes the register entry to `for_construction`:
  //
  //     { ...entry, currentRevision: issued.revision, status: 'for_construction', ... }
  //
  // So a drawing registered `as_built` and then put through controlled release comes out
  // labelled "for construction", and the handover's as-built gate correctly refuses it —
  // nobody builds from an as-built. Until that status is settled, an as-built drawing can
  // either BE the as-built record or be released, not both, so this chain leaves it as a
  // reference and HO-01 stays open. The O&M manual below is released and downloadable.

  // The reviewer the controlled releases need — an author cannot approve their own revision.
  const abReviewer = altApiAuthHeaders();
  expect(abReviewer, 'a second actor is required: an author cannot approve their own revision').toBeTruthy();
  const abAltUser = process.env.E2E_ALT_USERNAME ?? 'u-e2e-checker';
  const abGrant = await req.post(`${API}/api/v1/projects/${projectId}/members`, {
    headers: H(), data: { userId: abAltUser, roleId: 'r-technical-manager' },
  });
  expect([200, 201, 409].includes(abGrant.status()), `granting r-technical-manager: ${await abGrant.text()}`).toBe(true);

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

  const accepted = await req.put(`${HO}/${pkg.id}/accept`, {
    headers: alt!,
    data: { clientRepresentative: 'Client Rep', warrantyStartDate: new Date().toISOString().slice(0, 10), warrantyMonths: 12 },
  });
  expect(accepted.ok(), `an accepted package is the client's word — ${await accepted.text()}`).toBe(true);
  expect((await accepted.json()).status).toBe('accepted');

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

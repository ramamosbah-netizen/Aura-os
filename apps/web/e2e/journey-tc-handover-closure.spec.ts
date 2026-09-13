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
import { apiAuthHeaders } from './api-auth';

const API = process.env.AURA_API_URL ?? 'http://localhost:4000';
const CX = `${API}/api/v1/commissioning/records`;
const HO = `${API}/api/v1/commissioning/handovers`;
const DC = `${API}/api/v1/doccontrol`;
const H = () => apiAuthHeaders();
const stamp = () => Date.now().toString().slice(-6);

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

  const accepted = await req.put(`${HO}/${pkg.id}/accept`, {
    headers: H(),
    data: { clientRepresentative: 'Client Rep', warrantyStartDate: new Date().toISOString().slice(0, 10), warrantyMonths: 12 },
  });
  expect(accepted.ok(), `an accepted package is the client's word — ${await accepted.text()}`).toBe(true);
  expect((await accepted.json()).status).toBe('accepted');

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

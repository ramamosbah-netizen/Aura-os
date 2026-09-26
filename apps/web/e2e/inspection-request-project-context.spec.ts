// AURA OS — J4-03: an inspection request raised from a project's workspace is raised ON that project.
//
// The finding: "creating an IR re-asks for the project despite entering from a specific project; the
// list is scoped but the form is not configured with the context." The Project 360 Quality workspace
// already linked the register with the project, and the register already scoped its LIST to it — but
// the request form started blank and asked again.
//
// Driven the ordinary way, as the QA/QC engineer (the shipped `r-qa-qc` role) who owns inspection
// requests and has been put on the project: open the project's Quality workspace, follow its
// Inspection requests link, and raise an inspection without being asked which project it is for.
import { expect, test } from '@playwright/test';
import { createProject } from './fixtures';
import { apiAuthHeaders } from './api-auth';
import { provisionedActorsUnavailable } from './provisioned-actors';
import { signInAs } from './project-member-harness';

const API = process.env.AURA_API_URL ?? 'http://localhost:4000';
const QAQC = process.env.E2E_QAQC_USERNAME ?? 'u-e2e-qaqc';

test('an inspection request opened from a project is raised on that project, without asking again', async ({ browser, page, baseURL }) => {
  test.skip(!apiAuthHeaders().Authorization, 'requires the Auth-ON local API');
  const unavailable = await provisionedActorsUnavailable(page.request);
  test.skip(unavailable !== null, unavailable ?? '');
  test.setTimeout(180_000);

  const run = Date.now().toString().slice(-6);
  const projectId = await createProject(page.request, `J4-03 IR context ${run}`, baseURL);
  test.skip(!projectId, 'project API not reachable behind the web shell');
  const member = await page.request.post(`${API}/api/v1/projects/${projectId}/members`, {
    headers: apiAuthHeaders(), data: { userId: QAQC, roleId: 'r-qa-qc' },
  });
  expect([200, 201, 409].includes(member.status()), `putting the QA/QC engineer on the project: ${await member.text()}`).toBe(true);

  const context = await browser.newContext({ storageState: undefined });
  const qaqc = await context.newPage();
  expect(await signInAs(qaqc, baseURL!, QAQC), `sign-in as ${QAQC} must complete`).toBe(true);

  // ── From the project's Quality workspace: its link carries the project ──────────────────────
  await qaqc.goto(`/project/${projectId}/workspace/quality`, { waitUntil: 'domcontentloaded' });
  const link = qaqc.getByRole('link', { name: /Inspection requests/ }).first();
  await expect(link).toBeVisible({ timeout: 30_000 });
  const href = await link.getAttribute('href');
  expect(href, 'the workspace opens the register FOR this project').toContain(`/quality/inspection-requests?projectId=${projectId}`);

  // ── The register opened for the project: the form already holds it, and holds it fixed ─────
  await qaqc.goto(href!, { waitUntil: 'domcontentloaded' });
  const project = qaqc.getByRole('combobox', { name: /^Project/ });
  await expect(project).toHaveValue(projectId!, { timeout: 30_000 });
  await expect(project).toBeDisabled();
  await expect(qaqc.getByTestId('ir-project-scoped')).toBeVisible();

  const irNumber = `IR-CTX-${run}`;
  await qaqc.getByPlaceholder('IR-001').fill(irNumber);
  await qaqc.getByPlaceholder('L3 riser, grid C4').fill(`L4 lobby cameras — ${run}`);
  await qaqc.locator('input[type="date"]').first().fill('2026-09-26');
  await expect(async () => {
    await qaqc.getByRole('button', { name: 'Request', exact: true }).click();
    await expect(qaqc.getByText(irNumber).first()).toBeVisible({ timeout: 4_000 });
  }).toPass({ timeout: 30_000 });

  // ── Read back: raised on the project it was opened for, by the QA/QC engineer ───────────────
  const token = (await (await qaqc.request.post(`${API}/api/v1/auth/login`, { data: { username: QAQC, password: process.env.E2E_PASSWORD ?? 'e2e-password' } })).json()) as { token: string };
  const irs = (await (await qaqc.request.get(`${API}/api/v1/quality/irs?projectId=${projectId}`, { headers: { Authorization: `Bearer ${token.token}` } })).json()) as Array<{ irNumber: string; projectId: string; status: string }>;
  expect(irs.find((ir) => ir.irNumber === irNumber)).toMatchObject({ projectId, status: 'requested' });

  // ── The control: opened without a project, the form asks — and is free to ───────────────────
  await qaqc.goto('/quality/inspection-requests', { waitUntil: 'domcontentloaded' });
  const unscoped = qaqc.getByRole('combobox', { name: /^Project/ });
  await expect(unscoped).toBeEnabled({ timeout: 30_000 });
  await expect(unscoped).toHaveValue('');
  await expect(qaqc.getByTestId('ir-project-scoped')).toHaveCount(0);
  await context.close();
});

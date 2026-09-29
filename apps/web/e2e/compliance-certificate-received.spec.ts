// AURA OS — SEC-01 D-09 on the real /compliance screen: a recorded certificate is RECEIVED, not closed.
//
// Owner, 2026-09-29: "Certificate receipt must NOT automatically close the authority case … final
// closure must be confirmed by the PM or Project Engineer", and "a submission must never exist without
// evidence". Who may do each step is proved with Auth ON in apps/api/test/sec01-owner-decisions.e2e-spec.ts;
// this proves what the persisted case looks like to a person reading the register — that it stops at
// "certificate received", says who closes it, shows the submission's evidence, and only reads "certified"
// once closure is confirmed.
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { runId } from './fixtures';

const V1 = `${process.env.AURA_API_URL ?? 'http://localhost:4000'}/api/v1`;
const UNIQUE = runId();
const CODE = `D09${UNIQUE}`.toUpperCase();
const OBLIGATION = `NOC_${UNIQUE}`.toUpperCase();

async function adminHeaders(request: APIRequestContext): Promise<Record<string, string>> {
  const res = await request.post(`${V1}/auth/login`, {
    data: { username: process.env.E2E_USERNAME ?? 'u-admin', password: process.env.E2E_PASSWORD ?? 'e2e-password' },
  });
  expect(res.ok(), `the fixture administrator signs in — ${await res.text()}`).toBe(true);
  return { Authorization: `Bearer ${((await res.json()) as { token: string }).token}` };
}

async function ok(res: Awaited<ReturnType<APIRequestContext['post']>>, what: string): Promise<{ id: string; [k: string]: unknown }> {
  expect(res.ok(), `${what} — ${res.status()} ${await res.text()}`).toBe(true);
  return (await res.json()) as { id: string };
}

async function openRegister(page: Page): Promise<void> {
  await page.goto('/compliance', { waitUntil: 'domcontentloaded' });
  const filter = page.locator('select').filter({ has: page.locator('option', { hasText: 'All authorities' }) }).first();
  await filter.waitFor({ state: 'visible', timeout: 60_000 });
  await filter.selectOption(CODE);
  await expect(page.getByText(OBLIGATION).first()).toBeVisible({ timeout: 30_000 });
}

test('a recorded certificate leaves the case at "certificate received" until closure is confirmed', async ({ page, request }) => {
  const headers = await adminHeaders(request);
  await ok(await request.post(`${V1}/compliance/authorities`, { headers, data: { code: CODE, name: `D-09 Authority ${UNIQUE}`, jurisdiction: 'Dubai' } }), 'register the authority');
  const kase = await ok(await request.post(`${V1}/compliance/cases`, {
    headers, data: { authorityCode: CODE, obligationCode: OBLIGATION, scope: 'PROJECT', subjectId: '11111111-1111-1111-1111-111111111111', system: 'fire alarm' },
  }), 'open the case');

  // A portal submission: the stored receipt and the portal reference ARE the evidence.
  const receipt = await ok(await request.post(`${V1}/documents`, {
    headers, data: {
      kind: 'report', title: `Portal receipt ${UNIQUE}`, aggregateType: 'compliance.case', aggregateId: kase.id,
      fileName: 'receipt.txt', contentType: 'text/plain', content: `Portal submission ${CODE}-P1 received`,
    },
  }), 'store the portal receipt');
  const receiptId = ((receipt as { document?: { id: string } }).document?.id ?? receipt.id) as string;
  const submission = await ok(await request.post(`${V1}/compliance/cases/${kase.id}/submissions`, {
    headers, data: { submittedAt: '2026-09-29', method: 'authority_portal', reference: `${CODE}-P1`, evidenceDocumentId: receiptId },
  }), 'record the portal submission');
  await ok(await request.post(`${V1}/compliance/cases/${kase.id}/decisions`, { headers, data: { outcome: 'approved', decisionDate: '2026-09-29' } }), 'record the approval');
  await ok(await request.post(`${V1}/compliance/cases/${kase.id}/certificates`, {
    headers, data: { number: `NOC-${UNIQUE}`, issuedAt: '2026-09-29', expiresAt: '2027-09-29' },
  }), 'record the certificate');

  await openRegister(page);
  const status = page.getByTestId(`case-status-${kase.id}`);
  await expect(status, 'recording the certificate did not close the case').toHaveText('certificate received');
  await expect(status).toHaveAttribute('title', /closure waits for the PM or Project Engineer/);

  await page.getByRole('row').filter({ hasText: OBLIGATION }).getByRole('button', { name: /^History$/ }).click();
  await expect(page.getByTestId(`submission-evidence-${submission.id}`)).toHaveText(' · via authority portal, receipt stored');
  await expect(page.getByText(`${CODE}-P1`).first()).toBeVisible();

  // Closure is a separate, confirmed act — and it persists.
  const closed = await request.put(`${V1}/compliance/cases/${kase.id}/status`, { headers, data: { status: 'certified' } });
  expect(closed.ok(), `confirm closure — ${await closed.text()}`).toBe(true);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await openRegister(page);
  await expect(page.getByTestId(`case-status-${kase.id}`)).toHaveText('certified');
});

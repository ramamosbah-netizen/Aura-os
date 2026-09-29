import { expect, type APIRequestContext } from '@playwright/test';

/**
 * A FIXTURE DRAWING APPROVED THE WAY THE PRODUCT NOW REQUIRES — by somebody other than its author.
 *
 * SEC-01 D-04 (owner, 2026-09-28): the Technical Manager reviews engineering work, and the domain refuses
 * an author reviewing or deciding their own drawing. Fixtures used to have the administrator write,
 * submit, review and approve the same drawing in four calls; that is now refused at the review, the
 * drawing never reaches "approved", and every readiness gate that reads it stays BLOCKED. So the author
 * submits, and the shipped Technical Manager (u-e2e-techmgr) reviews and approves.
 */
const V1 = `${process.env.AURA_API_URL ?? 'http://localhost:4000'}/api/v1`;

export async function technicalManagerHeaders(request: APIRequestContext): Promise<Record<string, string>> {
  const res = await request.post(`${V1}/auth/login`, {
    data: { username: 'u-e2e-techmgr', password: process.env.E2E_PASSWORD ?? 'e2e-password' },
  });
  expect(res.ok(), `u-e2e-techmgr must sign in to review the fixture drawing — ${await res.text()}`).toBe(true);
  return { Authorization: `Bearer ${((await res.json()) as { token: string }).token}` };
}

export async function approveDrawingForConstruction(
  request: APIRequestContext,
  drawingId: string,
  authorHeaders: Record<string, string>,
  comments = 'Approved for construction',
): Promise<void> {
  const submitted = await request.post(`${V1}/engineering/drawings/${drawingId}/submit`, { headers: authorHeaders, data: {} });
  expect(submitted.ok(), `the author submits the drawing — ${await submitted.text()}`).toBe(true);
  const reviewer = await technicalManagerHeaders(request);
  const started = await request.post(`${V1}/engineering/drawings/${drawingId}/start-review`, { headers: reviewer, data: {} });
  expect(started.ok(), `the Technical Manager starts the review — ${await started.text()}`).toBe(true);
  const approved = await request.post(`${V1}/engineering/drawings/${drawingId}/review`, { headers: reviewer, data: { outcome: 'approved', comments } });
  expect(approved.ok(), `the Technical Manager approves it — ${await approved.text()}`).toBe(true);
}

// AURA OS — TC-GATE-2: the new T&C endpoints are guarded, proved with a narrower actor.
//
// Gate 2 added routes that read and write test evidence — the workspace projection, the run append,
// the defect raise. Every one of them derives its permission from its route, which is exactly the
// kind of guarantee that holds silently until it does not: a route added in the wrong shape is
// simply ungoverned, and nothing fails until someone notices.
//
// So this signs in as an actor with NO commissioning permission and asserts the refusals. It uses a
// second actor only because permission behaviour cannot be exercised by a principal that has it —
// the admin the rest of the suite uses would pass every one of these.
import { expect, test } from '@playwright/test';
import { apiAuthHeaders } from './api-auth';

const BASE = (process.env.AURA_API_URL ?? 'http://localhost:4000') + '/api/v1';
const VIEWER = process.env.E2E_VIEWER_USERNAME;
const PASSWORD = process.env.E2E_PASSWORD ?? 'e2e-password';

test('a viewer without commissioning permission is refused the T&C reads and writes', async ({ request }) => {
  test.skip(!process.env.E2E_API_TOKEN, 'auth is off — there is no permission to assert');
  test.skip(!VIEWER, 'no restricted actor configured (E2E_VIEWER_USERNAME)');

  const login = await request.post(`${BASE}/auth/login`, { data: { username: VIEWER, password: PASSWORD } });
  expect(login.ok(), `the restricted actor '${VIEWER}' must be able to sign in, or this proves nothing`).toBe(true);
  const viewer = { Authorization: `Bearer ${((await login.json()) as { token: string }).token}` };

  // Read: the workspace projection carries every system's evidence, so it is not a public summary.
  const workspace = await request.get(`${BASE}/commissioning/records/workspace`, { headers: viewer });
  expect(workspace.status(), 'the workspace read must be governed').toBe(403);

  // Write: appending a run is recording evidence, and the defect raise gates a sign-off.
  const run = await request.post(`${BASE}/commissioning/records/00000000-0000-0000-0000-000000000000/test-items/00000000-0000-0000-0000-000000000000/runs`, {
    headers: viewer,
    data: { result: 'pass' },
  });
  expect(run.status(), 'recording a test run must be governed').toBe(403);

  const punch = await request.post(`${BASE}/commissioning/records/00000000-0000-0000-0000-000000000000/punch`, {
    headers: viewer,
    data: { description: 'should be refused' },
  });
  expect(punch.status(), 'raising a defect must be governed').toBe(403);

  // …and the admin the rest of the suite runs as is NOT refused, so the 403s above are about
  // permission rather than about the routes being broken for everyone.
  const asAdmin = await request.get(`${BASE}/commissioning/records/workspace`, { headers: apiAuthHeaders() });
  expect(asAdmin.ok(), 'the same read must succeed for an actor that holds the permission').toBe(true);
});

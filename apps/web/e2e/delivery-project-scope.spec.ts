import { expect, test } from '@playwright/test';
import { createProject } from './fixtures';
import { apiAuthHeaders } from './api-auth';

/**
 * The delivery workspaces narrow by project ON THE SERVER.
 *
 * The distinction this asserts is the whole point of the control. A picker that hid rows in the
 * browser would leave every project's data on the wire — readable from the API or devtools — while
 * the page looked restricted. So the assertion is not "the other project's row is not displayed";
 * it is "the API does not return it".
 *
 * It is a FILTER, not a permission: any signed-in user may still ask for any project today. When
 * "see only my projects" arrives, the enforcement belongs behind these same endpoints, and this
 * spec is what will still hold when it does.
 */
const API = process.env.AURA_API_URL ?? 'http://localhost:4000';
const H = () => apiAuthHeaders();
const stamp = () => Date.now().toString().slice(-6);

test('every delivery workspace narrows to one project, and the API is what narrows', async ({ page, baseURL }) => {
  const run = stamp();
  const mine = await createProject(page.request, `Scope A ${run}`, baseURL);
  const theirs = await createProject(page.request, `Scope B ${run}`, baseURL);
  const req = page.request;

  /** Seed one record per domain on EACH project, so "narrowed" cannot be confused with "empty". */
  const seed = async (projectId: string, tag: string) => {
    await req.post(`${API}/api/v1/site/daily-reports`, {
      headers: H(),
      data: { projectId, date: new Date().toISOString().slice(0, 10), workDescription: `Site ${tag}`, manpowerCount: 1, equipmentCount: 0 },
    });
    await req.post(`${API}/api/v1/quality/ncrs`, {
      headers: H(),
      data: { projectId, ncrNumber: `NCR-${tag}`, description: `Quality ${tag}`, severity: 'minor', system: 'cctv' },
    });
    await req.post(`${API}/api/v1/hse/incidents`, {
      headers: H(),
      data: { projectId, title: `HSE ${tag}`, description: `Incident ${tag}`, severity: 'minor', occurredAt: new Date().toISOString() },
    });
  };

  await seed(mine, `A${run}`);
  await seed(theirs, `B${run}`);

  /**
   * Ask each endpoint for ONE project and assert the other project's rows are absent from the
   * RESPONSE. `projectId` is checked on the rows themselves rather than counting, because a count
   * would pass just as well against an endpoint that ignored the filter and happened to be empty.
   */
  const endpoints = [
    '/api/v1/site/daily-reports',
    '/api/v1/site/delay-logs',
    '/api/v1/site/material-consumption',
    '/api/v1/site/instructions',
    '/api/v1/quality/ncrs',
    '/api/v1/quality/irs',
    '/api/v1/quality/snags',
    '/api/v1/quality/audits',
    '/api/v1/hse/incidents',
    '/api/v1/hse/ptws',
    '/api/v1/hse/capas',
    '/api/v1/hse/risk-assessments',
    '/api/v1/engineering/drawings',
    '/api/v1/engineering/rfis',
    '/api/v1/commissioning/records',
  ];

  for (const endpoint of endpoints) {
    const res = await req.get(`${API}${endpoint}?projectId=${encodeURIComponent(mine)}`, { headers: H() });
    expect(res.ok(), `${endpoint} must answer a scoped read`).toBe(true);
    const rows = (await res.json()) as { projectId?: string }[];
    expect(Array.isArray(rows), `${endpoint} must return a list`).toBe(true);
    expect(
      rows.filter((r) => r.projectId && r.projectId !== mine),
      `${endpoint} returned rows from another project — the filter is not applied on the server`,
    ).toEqual([]);
  }

  /**
   * And the seeded row IS there when its own project is asked for. Without this the loop above would
   * pass against an endpoint that returned nothing at all.
   */
  const scopedReports = await (await req.get(`${API}/api/v1/site/daily-reports?projectId=${encodeURIComponent(mine)}`, { headers: H() })).json();
  expect(
    (scopedReports as { workDescription?: string }[]).some((r) => r.workDescription === `Site A${run}`),
    'the scoped read must still contain its own project’s record',
  ).toBe(true);

  const otherReports = await (await req.get(`${API}/api/v1/site/daily-reports?projectId=${encodeURIComponent(theirs)}`, { headers: H() })).json();
  expect(
    (otherReports as { workDescription?: string }[]).some((r) => r.workDescription === `Site B${run}`),
    'and the other project’s record is reachable under ITS own scope — narrowed, not lost',
  ).toBe(true);

  // The surface carries it too: the picker writes `?project=`, which is what the page reads.
  await page.goto(`/site/control?project=${encodeURIComponent(mine)}`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('project-filter')).toHaveValue(mine);
});

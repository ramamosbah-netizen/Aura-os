import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { apiAuthHeaders } from './api-auth';

/**
 * UX-01 — THE PROJECT LEAVES THE PROJECT WORKSPACE WITH THE ENGINEER.
 *
 * The finding (J2–J6 delivery audit): Engineering, Testing & Commissioning and Handover read a
 * `project` query parameter while the Project 360 workspace links them with `projectId`; HSE permits
 * ignored the projectId altogether; and the "Project context preserved" badge on the workspace was
 * not preserved one click later. Proved here, on the ordinary route, against the running API:
 *
 *   every card   each card on each Project 360 workspace section either carries the project or says,
 *                on the card, that it opens all projects — none carries a projectId its page drops
 *   every owner  each project-scoped owner page reached from a card names THIS project: the
 *                workspace's own project filter shows it, or the register's scope banner names it
 *   the data     the scoped pages hold this project's rows and not the other project's — Engineering
 *                RFIs, HSE permits and NCRs, seeded on both, read as the admin who could see both,
 *                so an absence is the scope and not a permission
 *   the filter   choosing another project, or "All projects", on a page entered with ?projectId=
 *                drops it — the arrival project cannot go on scoping the page under a filter that no
 *                longer names it
 */
const API = `${process.env.AURA_API_URL ?? 'http://localhost:4000'}/api/v1`;
const SECTIONS = ['plan', 'engineering', 'procurement', 'subcontracts', 'site', 'quality', 'hse', 'commercial', 'documents', 'approvals', 'testing', 'handover', 'activity'];

type Project = { id: string; title: string };
type Proof = (page: Page, project: Project) => Promise<void>;

const byFilter = (testId = 'project-filter'): Proof => async (page, p) => {
  await expect(page.getByTestId(testId), 'the workspace filter shows the project it was opened for').toHaveValue(p.id, { timeout: 30_000 });
};
const byBanner: Proof = async (page, p) => {
  await expect(page.getByTestId('project-scope-name'), 'the register names the project it is scoped to').toHaveText(p.title, { timeout: 30_000 });
};
const byPanel = (testId: string): Proof => async (page, p) => {
  await expect(page.getByTestId(testId)).toContainText(p.title, { timeout: 30_000 });
};

/** How each owning page a project-scoped card reaches shows the project. A new card without an entry fails the walk. */
const OWNERS: Record<string, Proof> = {
  '/engineering': byFilter(),
  '/site/control': byFilter(),
  '/quality/control': byFilter(),
  '/hse/control': byFilter(),
  '/commissioning': byFilter(),
  '/handover': byFilter('handover-project-filter'),
  '/engineering/drawings': byBanner,
  '/site/instructions': byBanner,
  '/site/daily-reports': byBanner,
  '/quality/ncrs': byBanner,
  '/quality/snags': byBanner,
  '/hse/permits': byBanner,
  '/hse/risk-assessments': byBanner,
  '/hse/toolbox-talks': byBanner,
  '/doccontrol/register': byBanner,
  '/site/execution': byPanel('execution-scope'),
  '/procurement/purchase-requests': byPanel('project-context'),
  '/procurement/purchase-orders': byPanel('project-context'),
  '/subcontracts/subcontracts': byPanel('project-context'),
  '/quality/inspection-requests': async (page) => { await expect(page.getByTestId('ir-project-scoped')).toBeVisible({ timeout: 30_000 }); },
  '/projects/schedule': async (page, p) => { await expect(page.getByRole('heading', { level: 1 }).filter({ hasText: p.title })).toBeVisible({ timeout: 30_000 }); },
  // A project with no contract has nothing to certify — the page says so rather than pretending to scope.
  '/contracts/certificates': async (page) => { await expect(page.getByRole('status').filter({ hasText: 'This project has no contract yet' })).toBeVisible({ timeout: 30_000 }); },
};

async function seed(request: APIRequestContext, run: string) {
  const H = { ...apiAuthHeaders(), 'content-type': 'application/json' };
  const post = async <T>(url: string, data: unknown): Promise<T> => {
    const res = await request.post(`${API}${url}`, { headers: H, data });
    expect(res.ok(), `seed ${url} — ${await res.text()}`).toBe(true);
    return (await res.json()) as T;
  };
  const project = async (tag: string): Promise<Project> => {
    const title = `Carry ${tag} ${run}`;
    const created = await post<{ id: string }>('/projects/projects', { title, reference: `CX-${run}-${tag}`, value: 100_000 });
    return { id: created.id, title };
  };
  const mine = await project('MINE');
  const theirs = await project('THEIRS');
  for (const [p, tag] of [[mine, 'MINE'], [theirs, 'THEIRS']] as const) {
    await post('/engineering/rfis', { projectId: p.id, projectName: p.title, code: `RFI-${run}-${tag}`, title: `Carry RFI ${tag} ${run}`, question: 'Which riser carries the backbone?' });
    await post('/hse/ptws', { projectId: p.id, projectName: p.title, permitType: 'hot_work', description: `Carry permit ${tag} ${run}`, validFrom: '2026-10-01', validTo: '2026-10-05' });
    await post('/quality/ncrs', { projectId: p.id, ncrNumber: `NCR-${run}-${tag}`, description: `Carry NCR ${tag} ${run}`, severity: 'minor', system: 'cctv' });
  }
  return { mine, theirs };
}

let projects: { mine: Project; theirs: Project };
const run = Date.now().toString().slice(-6);

test.beforeAll(async ({ request }) => {
  test.skip(!apiAuthHeaders().Authorization, 'needs the Auth-ON local API');
  projects = await seed(request, run);
});

test('UX-01 — every Project 360 card keeps the project or says it opens all projects, and every owner names the project', async ({ page }) => {
  test.setTimeout(900_000);
  const { mine } = projects;
  const scoped = new Map<string, string>();

  for (const section of SECTIONS) {
    await page.goto(`/project/${mine.id}/workspace/${section}`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId(`project-section-${section}`)).toBeVisible({ timeout: 60_000 });
    const cards = await page.locator('a[data-testid^="capability-"]').evaluateAll((links) => links.map((a) => ({
      label: a.getAttribute('data-testid')!.slice('capability-'.length),
      href: a.getAttribute('href') ?? '',
      scope: a.getAttribute('data-scope'),
      text: a.textContent ?? '',
    })));
    expect(cards.length, `${section} renders its cards`).toBeGreaterThan(0);
    for (const card of cards) {
      const where = `${section} › ${card.label} → ${card.href}`;
      if (card.scope === 'all-projects') {
        expect(card.href, `${where}: an all-projects card carries no project it would drop`).not.toContain('projectId=');
        expect(card.text, `${where}: and says so on the card`).toContain('All projects');
        continue;
      }
      expect(card.scope, where).toBe('project');
      const url = new URL(card.href, 'http://x');
      if (url.pathname.startsWith('/project/')) {
        expect(url.pathname, `${where}: a project route is this project's`).toMatch(new RegExp(`^/project/${mine.id}(/|$)`));
      } else {
        expect(url.searchParams.get('projectId'), `${where}: carries this project`).toBe(mine.id);
      }
      if (!scoped.has(url.pathname)) scoped.set(url.pathname, card.href);
    }
  }

  const named = [...scoped.keys()].filter((pathname) => OWNERS[pathname]).length;
  test.info().annotations.push({ type: 'walk', description: `${scoped.size} distinct pages reached from project cards; ${named} name the project` });
  console.log(`UX-01 walk: ${scoped.size} distinct pages reached from project cards; ${named} name the project`);

  for (const [pathname, href] of scoped) {
    const response = await page.goto(href, { waitUntil: 'domcontentloaded' });
    expect(response?.status() ?? 0, `${href} opens`).toBeLessThan(400);
    if (pathname === '/controls') {
      await expect(page, 'the legacy controls link lands inside the project').toHaveURL(new RegExp(`/project/${mine.id}/controls`));
      continue;
    }
    if (pathname.startsWith('/project/')) continue;
    const proof = OWNERS[pathname];
    expect(proof, `${pathname} is reached from a project card — it must show the project; add how to OWNERS`).toBeDefined();
    await proof(page, mine);
  }
});

test('UX-01 — the owner pages hold this project’s rows and not the other’s', async ({ page }) => {
  test.setTimeout(300_000);
  const { mine, theirs } = projects;

  // Engineering, entered as the Project 360 card enters it.
  await page.goto(`/engineering?projectId=${mine.id}&section=rfis`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('project-filter')).toHaveValue(mine.id, { timeout: 60_000 });
  await expect(page.getByText(`Carry RFI MINE ${run}`)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(`Carry RFI THEIRS ${run}`)).toHaveCount(0);

  // HSE permits: scoped by the link, named by the banner.
  await page.goto(`/hse/permits?projectId=${mine.id}`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('project-scope-name')).toHaveText(mine.title, { timeout: 30_000 });
  await expect(page.getByTestId('permit-register')).toContainText(`Carry permit MINE ${run}`);
  await expect(page.getByTestId('permit-register')).not.toContainText(`Carry permit THEIRS ${run}`);
  // Unscoped, the register spans projects — so each row names its project.
  await page.getByTestId('project-scope-all').click();
  await expect(page).toHaveURL(/\/hse\/permits$/);
  await expect(page.getByTestId('project-scope-banner')).toHaveCount(0);
  const mineRow = page.locator('[data-testid^="permit-row-"]').filter({ hasText: `Carry permit MINE ${run}` });
  const theirsRow = page.locator('[data-testid^="permit-row-"]').filter({ hasText: `Carry permit THEIRS ${run}` });
  await expect(mineRow.locator('[data-testid^="permit-project-"]')).toHaveText(mine.title);
  await expect(theirsRow.locator('[data-testid^="permit-project-"]')).toHaveText(theirs.title);

  // NCRs.
  await page.goto(`/quality/ncrs?projectId=${mine.id}`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('project-scope-name')).toHaveText(mine.title, { timeout: 30_000 });
  await expect(page.getByText(`Carry NCR MINE ${run}`)).toBeVisible();
  await expect(page.getByText(`Carry NCR THEIRS ${run}`)).toHaveCount(0);
});

test('UX-01 — changing or clearing the filter drops the project the page was entered with', async ({ page }) => {
  test.setTimeout(300_000);
  const { mine, theirs } = projects;

  await page.goto(`/engineering?projectId=${mine.id}&section=rfis`, { waitUntil: 'domcontentloaded' });
  const filter = page.getByTestId('project-filter');
  await expect(filter).toHaveValue(mine.id, { timeout: 60_000 });
  await expect(filter).toBeEnabled({ timeout: 30_000 });

  await filter.selectOption(theirs.id);
  await expect(page).toHaveURL(new RegExp(`[?&]project=${theirs.id}`), { timeout: 60_000 });
  expect(new URL(page.url()).searchParams.get('projectId'), 'the arrival project is gone').toBeNull();
  expect(new URL(page.url()).searchParams.get('section'), 'the section survives').toBe('rfis');
  await expect(page.getByText(`Carry RFI THEIRS ${run}`)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(`Carry RFI MINE ${run}`)).toHaveCount(0);

  await expect(filter).toBeEnabled({ timeout: 30_000 });
  await filter.selectOption('');
  await expect.poll(() => new URL(page.url()).searchParams.get('project'), { timeout: 60_000 }).toBeNull();
  expect(new URL(page.url()).searchParams.get('projectId')).toBeNull();
  await expect(filter).toHaveValue('');
  await expect(page.getByText(`Carry RFI MINE ${run}`), 'all projects again: the list is re-read, not the last project’s').toBeVisible({ timeout: 30_000 });

  // The Quality control room: the rows follow the filter, not the project the page was entered with.
  await page.goto(`/quality/control?projectId=${mine.id}&section=ncrs`, { waitUntil: 'domcontentloaded' });
  const quality = page.getByTestId('project-filter');
  const ncrs = page.getByTestId('qa-ncrs');
  await expect(quality).toHaveValue(mine.id, { timeout: 60_000 });
  await expect(ncrs.getByText(`NCR-${run}-MINE`)).toBeVisible({ timeout: 30_000 });
  await expect(ncrs.getByText(`NCR-${run}-THEIRS`)).toHaveCount(0);
  await expect(quality).toBeEnabled({ timeout: 30_000 });
  await quality.selectOption(theirs.id);
  await expect(page).toHaveURL(new RegExp(`[?&]project=${theirs.id}`), { timeout: 60_000 });
  await expect(ncrs.getByText(`NCR-${run}-THEIRS`)).toBeVisible({ timeout: 30_000 });
  await expect(ncrs.getByText(`NCR-${run}-MINE`)).toHaveCount(0);

  // Handover's own picker obeys the same rule.
  await page.goto(`/handover?projectId=${mine.id}`, { waitUntil: 'domcontentloaded' });
  const handover = page.getByTestId('handover-project-filter');
  await expect(handover).toHaveValue(mine.id, { timeout: 60_000 });
  await expect(handover).toBeEnabled({ timeout: 30_000 });
  await handover.selectOption('');
  await expect.poll(() => new URL(page.url()).search, { timeout: 60_000 }).not.toContain(mine.id);
  await expect(handover).toHaveValue('');
});

// AURA OS — BIM viewer smoke: the /engineering/bim page renders, the registry
// round-trips through the BFF, and web-ifc (WASM) parses an IFC in-browser.
// Skips registry/parse checks when no API is behind the shell (CI smoke runs API-less).
import { expect, test } from '@playwright/test';

const MINIMAL_IFC = `ISO-10303-21;
HEADER;
FILE_DESCRIPTION((''),'2;1');
FILE_NAME('empty.ifc','2026-07-02T00:00:00',(''),(''),'','','');
FILE_SCHEMA(('IFC4'));
ENDSEC;
DATA;
#1=IFCPROJECT('0YvctVUKr0kugbFTf53O9L',$,'Empty project',$,$,$,$,$,$);
ENDSEC;
END-ISO-10303-21;
`;

test('BIM viewer page renders and web-ifc parses an IFC in-browser', async ({ page }) => {
  // Sign in through the BFF (mints a dev token when the API allows it).
  const login = await page.request.post('/api/auth/login', {
    data: { username: 'u-admin', password: 'dev' },
  });
  const apiUp = login.ok();

  const res = await page.goto('/engineering/bim', { waitUntil: 'domcontentloaded' });
  expect(res?.status()).toBeLessThan(500);

  if (!apiUp) {
    test.info().annotations.push({ type: 'skip-reason', description: 'API not running — shell-only smoke' });
    return;
  }

  await expect(page.getByRole('heading', { name: 'BIM Viewer' })).toBeVisible();
  // The three.js scene mounts a WebGL canvas.
  await expect(page.locator('canvas')).toBeVisible();

  // Registry round-trip: create a project, register a model against it.
  const stamp = Date.now().toString(36);
  await page.request.post('/api/projects/projects', {
    data: { title: `BIM Smoke ${stamp}` },
  });
  await page.reload({ waitUntil: 'domcontentloaded' });

  await page.getByPlaceholder('Code (BIM-STR-01)').fill(`BIM-${stamp}`);
  await page.getByPlaceholder('Model name').fill('Smoke structural model');
  await page.getByRole('button', { name: 'Register' }).click();
  await expect(page.getByRole('cell', { name: `BIM-${stamp}` })).toBeVisible();

  // In-browser parse: feed a minimal IFC through the file input → web-ifc WASM
  // must init, open the model, and report a mesh count (0 for an empty project).
  await page.locator('input[type="file"]').setInputFiles({
    name: 'empty.ifc',
    mimeType: 'application/octet-stream',
    buffer: Buffer.from(MINIMAL_IFC, 'utf8'),
  });
  await expect(page.getByText(/mesh(es)? rendered/)).toBeVisible({ timeout: 30_000 });
});

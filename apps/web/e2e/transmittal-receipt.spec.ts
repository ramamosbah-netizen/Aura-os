import { expect, test, type APIRequestContext } from '@playwright/test';
import { apiAuthHeaders } from './api-auth';

/**
 * ENG-05 / ENG-06 — a conveyance on the register, with auth on.
 *
 * The register used to show one free-text recipient and one status. Between them they made two
 * different situations look identical: a document that reached everybody, and a document one of
 * three people has opened.
 *
 * So the screen has to carry WHO it was sent to and which of them has answered — and it must not
 * round "some" up to "all". The people who have NOT answered are the point: "the Buyer has it,
 * Site has not" is what a document controller chases on.
 */

const API = `${process.env.AURA_API_URL ?? 'http://localhost:4000'}/api/v1`;

interface Transmittal { id: string; code: string; status: string }
interface Receipt { acknowledgedCount: number; fullyAcknowledged: boolean; recipients: Array<{ userId: string }> }

const receiptOf = async (request: APIRequestContext, id: string): Promise<Receipt> => {
  const response = await request.get(`${API}/doccontrol/transmittals/${id}/receipt`, { headers: apiAuthHeaders() });
  expect(response.ok(), await response.text()).toBe(true);
  return (await response.json()) as Receipt;
};

test.describe('A conveyance shows who has it, and who has not', () => {
  test.setTimeout(240_000);

  test('names the distribution, refuses to call partial receipt receipt, and accepts as the viewer', async ({ page, request }) => {
    test.skip(!apiAuthHeaders().Authorization, 'requires the Auth-ON local API');
    const run = Date.now().toString().slice(-6);
    const headers = { 'content-type': 'application/json', ...apiAuthHeaders() };
    const post = async <T>(path: string, data: unknown): Promise<T> => {
      const response = await request.post(`${API}${path}`, { headers, data });
      expect(response.ok(), `${path} — ${await response.text()}`).toBe(true);
      return response.json() as Promise<T>;
    };

    const project = await post<{ id: string }>('/projects/projects', { title: `Conveyance job ${run}` });
    const transmittal = await post<Transmittal>('/doccontrol/transmittals', {
      projectId: project.id, code: `TR-${run}`, title: `Level 3 containment ${run}`,
      sender: 'Engineering', recipient: 'Site distribution', purpose: 'For Construction',
    });

    // The viewer of this browser session, plus a second person who will never answer — so the
    // screen has to show an outstanding recipient rather than a finished conveyance.
    const viewer = process.env.E2E_USERNAME ?? 'u-admin';
    await post(`/doccontrol/transmittals/${transmittal.id}/recipients`, { userId: viewer, party: 'site_engineer' });
    await post(`/doccontrol/transmittals/${transmittal.id}/recipients`, { userId: 'u-e2e-viewer', party: 'procurement' });
    await post(`/doccontrol/transmittals/${transmittal.id}/send`, {});

    await page.goto(`/doccontrol/transmittals?projectId=${project.id}`, { waitUntil: 'domcontentloaded' });

    // ── Addressed, nobody has answered ────────────────────────────────────────
    const cell = page.getByTestId(`receipt-${transmittal.id}`);
    await expect(cell).toBeVisible();
    await expect(page.getByTestId(`receipt-count-${transmittal.id}`)).toHaveText('0 of 2 acknowledged');
    // Each person is named with their capacity, and both read as outstanding.
    await expect(page.getByTestId(`receipt-person-${transmittal.id}-${viewer}`)).toContainText('Site Engineer');
    await expect(page.getByTestId(`receipt-person-${transmittal.id}-${viewer}`)).toContainText('not yet');
    await expect(page.getByTestId(`receipt-person-${transmittal.id}-u-e2e-viewer`)).toContainText('Procurement');

    // ── The viewer is on the distribution, so they are offered the act ────────
    const accept = page.getByTestId(`receipt-accept-${transmittal.id}`);
    await expect(accept).toBeVisible();
    await accept.click();

    // ── One answer is NOT receipt ─────────────────────────────────────────────
    await expect(page.getByTestId(`receipt-count-${transmittal.id}`)).toHaveText('1 of 2 acknowledged');
    await expect(page.getByTestId(`receipt-person-${transmittal.id}-${viewer}`)).toContainText('received');
    // The other person is still outstanding, and the screen keeps saying so.
    await expect(page.getByTestId(`receipt-person-${transmittal.id}-u-e2e-viewer`)).toContainText('not yet');
    // …and the conveyance itself has not advanced to acknowledged on one person's answer.
    const afterOne = await receiptOf(request, transmittal.id);
    expect(afterOne).toMatchObject({ acknowledgedCount: 1, fullyAcknowledged: false });

    // The viewer cannot answer twice: the button is gone once they have.
    await expect(page.getByTestId(`receipt-accept-${transmittal.id}`)).toHaveCount(0);

    // ── Survives a reload: derived from the record, not from the click ────────
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId(`receipt-count-${transmittal.id}`)).toHaveText('1 of 2 acknowledged');
    await expect(page.getByTestId(`receipt-person-${transmittal.id}-${viewer}`)).toContainText('received');
  });
});

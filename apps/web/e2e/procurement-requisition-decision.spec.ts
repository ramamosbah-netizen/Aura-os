import { expect, test, type APIRequestContext, type Browser, type Page } from '@playwright/test';
import { memberPassword, signInAs } from './project-member-harness';

/**
 * BUY-APPR-01 on screen — the requisition decision reaches the role whose job it is.
 *
 * The decision route used to declare the Buyer's authoring floor (`procurement.pr.update`), which the
 * Procurement Manager does not hold, so every approval was made by an administrator. And even once
 * the route admits the manager, the ordinary path has to exist: the approvals inbox links a
 * SUBMITTED requisition to the register, and the register offered Approve and Reject on drafts only.
 * This drives that path with the shipped users, in a real browser, signed in through the login form.
 */

const API = `${process.env.AURA_API_URL ?? 'http://localhost:4000'}/api/v1`;
const BUYER = process.env.E2E_BUYER_USERNAME ?? 'u-e2e-buyer';
const MANAGER = process.env.E2E_PROCMGR_USERNAME ?? 'u-e2e-procmgr';
const STORE = process.env.E2E_STOREKEEPER_USERNAME ?? 'u-e2e-storekeeper';
const ADMIN = process.env.E2E_USERNAME ?? 'u-admin';

async function bearer(request: APIRequestContext, username: string): Promise<Record<string, string> | null> {
  const res = await request.post(`${API}/auth/login`, { data: { username, password: memberPassword() } }).catch(() => null);
  if (!res?.ok()) return null;
  const token = ((await res.json()) as { token?: string }).token;
  return token ? { Authorization: `Bearer ${token}` } : null;
}

async function seat(browser: Browser, baseURL: string, username: string): Promise<Page> {
  const context = await browser.newContext({ baseURL, storageState: { cookies: [], origins: [] } });
  const page = await context.newPage();
  expect(await signInAs(page, baseURL, username), `${username} could not sign in`).toBe(true);
  return page;
}

test.describe('A requisition is decided by the Procurement Manager, and only by them', () => {
  test.setTimeout(240_000);

  test('the buyer submits and is refused; the manager follows the inbox and approves and rejects', async ({ browser, request, baseURL }) => {
    test.skip(!memberPassword(), 'requires the Auth-ON local API and the e2e password');
    const [buyer, manager, store, admin] = await Promise.all([BUYER, MANAGER, STORE, ADMIN].map((u) => bearer(request, u)));
    test.skip(!buyer || !manager || !store || !admin, 'the shipped procurement users are not provisioned');

    const run = Date.now().toString().slice(-6);
    const post = async <T>(who: Record<string, string>, path: string, data: unknown): Promise<T> => {
      const res = await request.post(`${API}${path}`, { headers: who, data });
      expect(res.ok(), `POST ${path}: ${res.status()} ${await res.text()}`).toBe(true);
      return (await res.json()) as T;
    };
    const get = async <T>(who: Record<string, string>, path: string): Promise<T> =>
      (await (await request.get(`${API}${path}`, { headers: who })).json()) as T;

    const project = await post<{ id: string }>(admin!, '/projects/projects', { title: `Requisition decision ${run}` });
    const material = await post<{ code: string }>(store!, '/inventory/materials', { code: `CAM-DEC-${run}`, name: 'IP camera 4MP dome', uom: 'no' });
    const submitted = async (label: string): Promise<{ id: string; title: string }> => {
      const pr = await post<{ id: string; title: string }>(buyer!, '/procurement/purchase-requests', { title: `${label} ${run}`, projectId: project.id, value: 0 });
      await post(buyer!, `/procurement/purchase-requests/${pr.id}/lines`, { material: material.code, quantity: 4, estimatedUnitCost: 450 });
      const res = await request.patch(`${API}/procurement/purchase-requests/${pr.id}/status`, { headers: buyer!, data: { status: 'submitted' } });
      expect(res.status()).toBe(200);
      return pr;
    };
    const toApprove = await submitted('Cameras for level 12');
    const toReject = await submitted('Cameras for level 14');

    // ── The BUYER, on the register: the buttons are there, the authority is not ──────────────────
    const buyerPage = await seat(browser, baseURL!, BUYER);
    await buyerPage.goto(`/procurement/purchase-requests?record=${toApprove.id}`);
    await expect(async () => {
      await buyerPage.getByTestId(`pr-approve-${toApprove.id}`).click();
      await expect(buyerPage.getByText(/procurement\.pr\.approve/)).toBeVisible({ timeout: 3_000 });
    }).toPass({ timeout: 30_000 });
    expect((await get<{ status: string }>(buyer!, `/procurement/purchase-requests/${toApprove.id}`)).status).toBe('submitted');

    // ── The MANAGER follows the approvals inbox, the way the work reaches them ────────────────────
    const inbox = await get<Array<{ id: string; kind: string; action: string; href: string }>>(manager!, '/inbox');
    const waiting = inbox.find((i) => i.id === toApprove.id);
    expect(waiting, 'the submitted requisition should wait in the manager\'s inbox').toMatchObject({ kind: 'Purchase Request', action: 'Approve' });

    const managerPage = await seat(browser, baseURL!, MANAGER);
    await managerPage.goto(waiting!.href);
    const row = managerPage.locator(`[data-pr-id="${toApprove.id}"]`);
    await expect(async () => {
      await managerPage.getByTestId(`pr-approve-${toApprove.id}`).click();
      await expect(row).toContainText('PO Drafted', { timeout: 3_000 });
    }).toPass({ timeout: 30_000 });

    const approved = await get<{ status: string }>(manager!, `/procurement/purchase-requests/${toApprove.id}`);
    expect(approved.status).toBe('approved');
    const orders = await get<Array<{ id: string; title: string; value: number; status: string }>>(admin!, '/procurement/purchase-orders');
    expect(orders.find((o) => o.title === `PO for ${toApprove.title}`)).toMatchObject({ value: 1800, status: 'draft' });

    await managerPage.goto(`/procurement/purchase-requests?record=${toReject.id}`);
    const rejectRow = managerPage.locator(`[data-pr-id="${toReject.id}"]`);
    await expect(async () => {
      await managerPage.getByTestId(`pr-reject-${toReject.id}`).click();
      await expect(rejectRow).toContainText('Rejected', { timeout: 3_000 });
    }).toPass({ timeout: 30_000 });
    expect((await get<{ status: string }>(manager!, `/procurement/purchase-requests/${toReject.id}`)).status).toBe('rejected');
  });
});

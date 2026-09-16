import { expect, test, type APIRequestContext } from '@playwright/test';
import { apiAuthHeaders } from './api-auth';

/**
 * ENG-04 — the canonical material approval, on the Quality screen, with auth on.
 *
 * The contractor proposes a product and the consultant decides it. Two things have to be true on
 * the screen for that to mean anything: the decision has to say WHO PUT IT ON THE RECORD — site
 * builds to an approved material, and a decision nobody is accountable for entering is a rumour —
 * and a decision short of outright approval has to stay visibly unfinished, because "approved as
 * noted" carries binding conditions somebody must read and apply.
 *
 * The screen says "recorded by", not "decided by". The consultant is external to this system and
 * AURA captures no identity for them, so crediting an internal user with the decision would be a
 * claim the record cannot support.
 *
 * Deliberately NOT proven here: that the material on a purchase order is the approved one. A
 * purchase order carries no material identity in this system; the frozen roadmap gives that to
 * Wave 4 (`BUY-01`). Asserting it on this screen would be asserting something the system cannot do.
 */

const API = `${process.env.AURA_API_URL ?? 'http://localhost:4000'}/api/v1`;

interface Mar { id: string; reference: string; status: string; revision: number; reviewedBy: string | null }

const marOf = async (request: APIRequestContext, projectId: string, reference: string): Promise<Mar> => {
  const response = await request.get(`${API}/quality/material-approvals?projectId=${projectId}`, { headers: apiAuthHeaders() });
  expect(response.ok(), await response.text()).toBe(true);
  return ((await response.json()) as Mar[]).find((m) => m.reference === reference)!;
};

test.describe('A material approval is a decision somebody made', () => {
  test.setTimeout(240_000);

  test('shows the decision with whose it was, and keeps an as-noted approval visibly unfinished', async ({ page, request }) => {
    test.skip(!apiAuthHeaders().Authorization, 'requires the Auth-ON local API');
    const run = Date.now().toString().slice(-6);
    const headers = { 'content-type': 'application/json', ...apiAuthHeaders() };

    const project = (await (await request.post(`${API}/projects/projects`, {
      headers, data: { title: `Material job ${run}`, reference: `MJ-${run}` },
    })).json()) as { id: string };

    const reference = `MAR-${run}`;
    const created = await request.post(`${API}/quality/material-approvals`, {
      headers,
      data: {
        projectId: project.id, reference, materialName: `FP200 Gold 2C ${run}`,
        manufacturer: 'Prysmian', supplier: 'Gulf Cables LLC', specification: 'BS 7629-1',
      },
    });
    expect(created.ok(), await created.text()).toBe(true);
    const mar = (await created.json()) as Mar;

    // The as-noted decision asks for its binding comments through a prompt, and the client refuses
    // to send the decision without them. Registered before navigation so the handler is never a
    // race with the click that opens it.
    page.on('dialog', (dialog) => void dialog.accept('LSZH variant only, to BS 7629-1'));

    await page.goto(`/quality/material-approvals?projectId=${project.id}`, { waitUntil: 'domcontentloaded' });

    // ── Drafted: undecided, and nobody is named ───────────────────────────────
    const row = page.getByTestId(`mar-${mar.id}`);
    await expect(row).toBeVisible();
    await expect(page.getByTestId(`mar-status-${mar.id}`)).toContainText('draft');
    await expect(page.getByTestId(`mar-recorded-by-${mar.id}`)).toHaveCount(0);
    await expect(page.getByTestId(`mar-revision-${mar.id}`)).toHaveText('0');

    // ── Sent to the decider ───────────────────────────────────────────────────
    await page.getByTestId(`mar-submit-${mar.id}`).click();
    await expect(page.getByTestId(`mar-status-${mar.id}`)).toContainText('submitted');
    // Still nobody named: submitting is not deciding.
    await expect(page.getByTestId(`mar-recorded-by-${mar.id}`)).toHaveCount(0);

    // ── Decided, with conditions ──────────────────────────────────────────────
    // "Approved as noted" is an approval with binding conditions attached, and the screen keeps it
    // actionable rather than filing it as settled — which is how conditions get missed.
    // Scoped to THIS request's row: the register lists more than one project's requests, so a bare
    // button lookup would be ambiguous the moment a second one exists.
    await row.getByRole('button', { name: 'As noted' }).click();

    await expect(page.getByTestId(`mar-status-${mar.id}`)).toContainText('approved as noted');
    // WHO PUT IT ON THE RECORD, on the screen — and worded as recording rather than deciding,
    // because the consultant who decided it is external and this system captures no identity for
    // them. Naming an AURA user as the approver would be a claim the record cannot support.
    await expect(page.getByTestId(`mar-recorded-by-${mar.id}`)).toContainText('Decision recorded by');
    await expect(page.getByTestId(`mar-comments-${mar.id}`)).toContainText('LSZH variant only');
    // And it is still open work: a revision is offered, because the conditions have to be answered.
    await expect(page.getByTestId(`mar-revise-${mar.id}`)).toBeVisible();

    // ── Reloaded from the record, not from the click that made it ─────────────
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId(`mar-recorded-by-${mar.id}`)).toContainText('Decision recorded by');
    const persisted = await marOf(request, project.id, reference);
    expect(persisted.status).toBe('approved_as_noted');
    expect(persisted.reviewedBy).not.toBeNull();

    // ── Revising resets the decision and counts the round ─────────────────────
    await page.getByTestId(`mar-revise-${mar.id}`).click();
    await expect(page.getByTestId(`mar-status-${mar.id}`)).toContainText('draft');
    await expect(page.getByTestId(`mar-revision-${mar.id}`)).toHaveText('1');
    // The previous decision does not linger against a request nobody has decided yet.
    await expect(page.getByTestId(`mar-recorded-by-${mar.id}`)).toHaveCount(0);
  });
});

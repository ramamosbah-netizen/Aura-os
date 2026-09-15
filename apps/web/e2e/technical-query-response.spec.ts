import { expect, test, type APIRequestContext } from '@playwright/test';
import { apiAuthHeaders } from './api-auth';

/**
 * ENG-03 — a technical query response, on the engineering screen, with auth on.
 *
 * SITE BUILDS TO THE ANSWER. Everything below follows from that one fact: the screen must say who
 * decided it, it must not let the decision change without a reason, it must show when a decision
 * has MOVED — because somebody may already have built to the previous one — and accepting the
 * answer has to be a recorded act rather than the query silently going quiet.
 *
 * Before this slice the screen printed "A: <text>" and nothing else. No author, no revision, no way
 * to accept it, and `closed` was a status nothing in the system could reach.
 */

const API = `${process.env.AURA_API_URL ?? 'http://localhost:4000'}/api/v1`;

interface Tq { id: string; code: string; status: string; response: string | null; respondedBy: string | null; responseRevision: number }

const tqOf = async (request: APIRequestContext, id: string): Promise<Tq> => {
  const response = await request.get(`${API}/engineering/technical-queries/${id}`, { headers: apiAuthHeaders() });
  expect(response.ok(), await response.text()).toBe(true);
  return (await response.json()) as Tq;
};

test.describe('A technical query answer is a design decision', () => {
  test.setTimeout(240_000);

  test('shows who decided it, refuses a silent replacement, and refuses a self-acceptance', async ({ page, request }) => {
    test.skip(!apiAuthHeaders().Authorization, 'requires the Auth-ON local API');
    const run = Date.now().toString().slice(-6);
    const headers = { 'content-type': 'application/json', ...apiAuthHeaders() };
    const post = async <T>(path: string, data: unknown): Promise<T> => {
      const response = await request.post(`${API}${path}`, { headers, data });
      expect(response.ok(), `${path} — ${await response.text()}`).toBe(true);
      return response.json() as Promise<T>;
    };

    const project = await post<{ id: string }>('/projects/projects', { title: `TQ job ${run}`, reference: `TQ-${run}` });
    const tq = await post<Tq>('/engineering/technical-queries', {
      projectId: project.id, code: `TQ-${run}`, title: `Riser clash ${run}`,
      query: 'Which service takes precedence at level 3?', timeImpact: true,
    });

    // The Engineering workspace holds each register in its own addressable section (see
    // lib/use-workspace-section.ts) — a bare /engineering shows the overview, not the TQ list.
    await page.goto(`/engineering?section=technical-queries&projectId=${project.id}`, { waitUntil: 'domcontentloaded' });

    // ── Unanswered: the screen offers the response box, nothing else ───────────
    const respondBox = page.getByTestId(`tq-response-${tq.id}`);
    await expect(respondBox).toBeVisible();
    await expect(page.getByTestId(`tq-answer-${tq.id}`)).toHaveCount(0);

    // ── Answer it ─────────────────────────────────────────────────────────────
    await respondBox.fill('Duct takes precedence. Reroute riser east of grid C.');
    await page.getByTestId(`tq-respond-${tq.id}`).click();

    await expect(page.getByTestId(`tq-answer-${tq.id}`)).toContainText('Reroute riser east of grid C');
    // WHO decided it, on the screen — not buried in an event log.
    const meta = page.getByTestId(`tq-answer-meta-${tq.id}`);
    await expect(meta).toContainText('Answered by');
    // Nothing has moved yet, so no revision is claimed.
    await expect(meta).not.toContainText('revision');

    // ── Replacing it without a reason is refused, server-side ─────────────────
    await page.getByTestId(`tq-supersede-${tq.id}`).click();
    await page.getByTestId(`tq-new-response-${tq.id}`).fill('Actually, reroute west.');
    await page.getByTestId(`tq-supersede-save-${tq.id}`).click();
    // The old answer still stands: nothing was quietly overwritten.
    await expect(page.getByTestId(`tq-answer-${tq.id}`)).toContainText('east of grid C');
    expect((await tqOf(request, tq.id)).response).toContain('east of grid C');

    // ── With a reason, it is replaced — and the screen says the decision MOVED ─
    await page.getByTestId(`tq-supersede-reason-${tq.id}`).fill('consultant revised after coordination review');
    await page.getByTestId(`tq-supersede-save-${tq.id}`).click();
    await expect(page.getByTestId(`tq-answer-${tq.id}`)).toContainText('reroute west');
    await expect(page.getByTestId(`tq-answer-meta-${tq.id}`)).toContainText('revision 1');

    // What was displaced is still readable, because that is what was built to.
    const history = await request.get(`${API}/engineering/technical-queries/${tq.id}/responses`, { headers: apiAuthHeaders() });
    expect(history.ok()).toBe(true);
    const revisions = (await history.json()) as Array<{ revision: number; response: string; supersededReason: string }>;
    expect(revisions).toHaveLength(1);
    expect(revisions[0].response).toContain('east of grid C');
    expect(revisions[0].supersededReason).toContain('coordination review');

    // ── Accepting it takes TWO people, and the screen says so ────────────────
    // One principal has given both answers here, so the Accept button is refused: nobody declares
    // their own design decision adequate. The rule lives in the DOMAIN, not only in a permission,
    // and what matters on this screen is that the refusal reaches the person who clicked.
    await page.getByTestId(`tq-close-${tq.id}`).click();
    await expect(page.getByText(/only somebody other than the person who answered/i)).toBeVisible();

    // The record did not move, and the screen still offers the decision as open to acceptance
    // rather than quietly showing it as settled.
    expect((await tqOf(request, tq.id)).status).toBe('responded');
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId(`tq-answer-meta-${tq.id}`)).toContainText('revision 1');
    await expect(page.getByTestId(`tq-answer-meta-${tq.id}`)).not.toContainText('accepted by');
    await expect(page.getByTestId(`tq-close-${tq.id}`)).toBeVisible();

    // The SUCCESSFUL two-party acceptance — a different principal answering, then this one
    // accepting — is proven over HTTP in apps/api/test/technical-query-response.e2e-spec.ts with
    // real JWT principals. It is not repeated here because this environment seeds exactly one
    // account carrying engineering authority, and inventing a second would make the proof pass for
    // the wrong reason.
  });
});

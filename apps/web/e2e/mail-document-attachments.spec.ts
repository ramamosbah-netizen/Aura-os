// AURA OS — F-09: mail carries a governed AURA document, end to end, and to nobody it should not.
//
// The composer used to say attachments "are not yet wired into compose", and it was right: the
// attachments table had a document reference built for this in 0237 and nothing ever wrote one.
//
// Proved here, Auth ON against PostgreSQL, through the screens:
//   attach      the Document Controller (u-e2e-doccon) addresses a colleague BY USER and attaches
//               their own document from AURA Documents; the revision current at that moment is
//               pinned
//   no grant    the composer names the colleague who could not open it and will not send; the
//               sender gives access with the DMS's own share — an explicit act the DMS lets them make
//   delivery    sent through the internal provider (the dispatch worker takes it to Sent); the
//               commercial manager (u-e2e-qs) opens it from their inbox and downloads exactly the
//               pinned revision's bytes, although a newer revision exists by then
//   denial      a Sales user off the envelope gets 404 for the same link; with the share revoked,
//               the recipient gets 403 — being sent a document is not owning it
import { expect, test, type APIRequestContext, type Browser, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { apiAuthHeaders } from './api-auth';
import { memberPassword, signInAs } from './project-member-harness';
import { provisionedActorsUnavailable } from './provisioned-actors';

const API = `${process.env.AURA_API_URL ?? 'http://localhost:4000'}/api/v1`;
const EMAIL = '/my-work/communication?view=email';

async function tokenFor(request: APIRequestContext, username: string): Promise<string> {
  const login = await request.post(`${API}/auth/login`, { data: { username, password: memberPassword() } });
  expect(login.ok(), `${username} must be able to sign in — ${await login.text()}`).toBe(true);
  const token = ((await login.json()) as { token?: string }).token ?? '';
  expect(token).not.toBe('');
  return token;
}

async function seat(browser: Browser, baseURL: string, username: string): Promise<Page> {
  const context = await browser.newContext({ baseURL, storageState: { cookies: [], origins: [] }, acceptDownloads: true });
  const page = await context.newPage();
  expect(await signInAs(page, baseURL, username), `${username} could not sign in`).toBe(true);
  return page;
}

test('a governed document is attached, sent, received and downloaded — and refused to everyone else', async ({ browser, baseURL, request }) => {
  test.setTimeout(300_000);
  test.skip(!apiAuthHeaders().Authorization, 'requires the Auth-ON local API');
  test.skip(!memberPassword(), 'needs a password to sign the sender, the recipient and the outsider in');
  const unavailable = await provisionedActorsUnavailable(request);
  test.skip(unavailable !== null, unavailable ?? '');

  const run = Date.now().toString().slice(-6);
  const title = `Riser schedule ${run}`;
  const subject = `Riser for pricing ${run}`;
  const pinned = `Riser schedule ${run} — revision two`;

  // The Document Controller's OWN document, created with their own token, so ownership is real.
  const doccon = { Authorization: `Bearer ${await tokenFor(request, 'u-e2e-doccon')}`, 'content-type': 'application/json' };
  const created = await request.post(`${API}/documents`, {
    headers: doccon,
    data: { kind: 'report', title, aggregateType: 'project', aggregateId: '00000000-0000-4000-8000-0000000000f9', content: `Riser schedule ${run} — revision one`, fileName: 'riser-schedule.txt', contentType: 'text/plain' },
  });
  expect(created.ok(), await created.text()).toBe(true);
  const documentId = ((await created.json()) as { document: { id: string } }).document.id;
  const revised = await request.post(`${API}/documents/${documentId}/versions`, { headers: doccon, data: { content: pinned, fileName: 'riser-schedule.txt', contentType: 'text/plain' } });
  expect(revised.ok(), await revised.text()).toBe(true);

  const sender = await seat(browser, baseURL!, 'u-e2e-doccon');
  const recipient = await seat(browser, baseURL!, 'u-e2e-qs');
  const outsider = await seat(browser, baseURL!, 'u-e2e-sales');
  try {
    // ── Compose, to a colleague by user, with the document attached ─────────────────────────────
    await sender.goto(EMAIL, { waitUntil: 'domcontentloaded' });
    await expect(sender.getByTestId('email-workspace')).toBeVisible({ timeout: 60_000 });
    await sender.getByTestId('mail-compose').click();
    // Who is sending, from the session — /workspace/me is refused to every shipped role.
    await expect(sender.getByTestId('mail-composer')).toContainText('Signed in as u-e2e-doccon.');
    const colleague = sender.getByTestId('mail-colleague-select');
    await expect(colleague.locator('option[value="u-e2e-qs"]')).toHaveCount(1, { timeout: 30_000 });
    await colleague.selectOption('u-e2e-qs');
    await expect(sender.getByTestId('mail-colleague-u-e2e-qs')).toBeVisible();
    await sender.getByTestId('mail-subject').fill(subject);
    await sender.getByTestId('mail-body').fill('The current riser schedule, for pricing.');

    await sender.getByTestId('mail-attach-open').click();
    await sender.getByTestId('mail-doc-search').fill(title);
    await sender.getByTestId(`mail-doc-attach-${documentId}`).click();
    await expect(sender.getByTestId(`mail-attachment-${documentId}`)).toContainText('riser-schedule.txt · rev 2', { timeout: 30_000 });

    // ── The mail grants nothing: the colleague cannot open it, so it will not go ────────────────
    const warning = sender.getByTestId('mail-access-warning');
    await expect(warning).toContainText('u-e2e-qs cannot open “riser-schedule.txt”', { timeout: 30_000 });
    await expect(sender.getByTestId('mail-send-now')).toBeDisabled();
    // The DMS lets the owner share, so the composer offers the DMS's own share — and only that.
    await sender.getByTestId('mail-give-access-u-e2e-qs').click();
    await expect(warning).toHaveCount(0, { timeout: 30_000 });

    await sender.getByTestId('mail-send-now').click();
    await expect(sender.getByRole('status')).toContainText('Queued to send', { timeout: 30_000 });

    // Delivered through the internal provider: the dispatch worker takes it to Sent.
    let sent: { id: string; state: string; attachments: Array<{ id: string; documentId: string; version: number }> } | undefined;
    await expect.poll(async () => {
      const folder = await request.get(`${API}/comms/mailbox/folder/sent`, { headers: doccon });
      sent = ((await folder.json()) as Array<typeof sent & { subject: string }>).find((m) => m?.subject === subject);
      return sent?.state;
    }, { timeout: 60_000, message: 'the dispatch worker sends it' }).toBe('sent');
    expect(sent!.attachments).toEqual([expect.objectContaining({ documentId, version: 2 })]);
    const attachmentId = sent!.attachments[0].id;

    // A newer revision after sending does not change what was sent.
    const third = await request.post(`${API}/documents/${documentId}/versions`, { headers: doccon, data: { content: 'revision three', fileName: 'riser-schedule.txt', contentType: 'text/plain' } });
    expect(third.ok(), await third.text()).toBe(true);

    // ── Received, opened, downloaded ────────────────────────────────────────────────────────────
    await recipient.goto(EMAIL, { waitUntil: 'domcontentloaded' });
    await expect(recipient.getByTestId('email-workspace')).toBeVisible({ timeout: 60_000 });
    await recipient.getByTestId('mail-row').filter({ hasText: subject }).click();
    const link = recipient.getByTestId(`mail-attachment-link-${documentId}`);
    await expect(link).toBeVisible({ timeout: 30_000 });
    await expect(recipient.getByTestId('mail-attachment-list')).toContainText('rev 2');
    const [download] = await Promise.all([recipient.waitForEvent('download'), link.click()]);
    expect(download.suggestedFilename()).toBe('riser-schedule.txt');
    expect(await readFile((await download.path())!, 'utf8')).toBe(pinned);

    // ── Refused ─────────────────────────────────────────────────────────────────────────────────
    const href = `/api/comms/mail-attachment/${sent!.id}/${attachmentId}`;
    expect((await outsider.request.get(href)).status(), 'off the envelope, the message is not there').toBe(404);

    const permissions = await request.get(`${API}/documents/${documentId}/permissions`, { headers: doccon });
    const grant = ((await permissions.json()) as Array<{ id: string; subjectId: string }>).find((p) => p.subjectId === 'u-e2e-qs')!;
    const revoked = await request.delete(`${API}/documents/${documentId}/permissions/${grant.id}`, { headers: doccon });
    expect(revoked.ok(), await revoked.text()).toBe(true);
    expect((await recipient.request.get(href)).status(), 'the share revoked, the attachment closes with it').toBe(403);
  } finally {
    await sender.context().close();
    await recipient.context().close();
    await outsider.context().close();
  }
});

import { expect, test, type Page } from '@playwright/test';

/**
 * Internal Chat (C2) — the journey, driven in a browser.
 *
 * Communication → Internal Chat → channel → read history → send → refresh → still there →
 * DM → deep link → and a third party refused someone else's DM.
 *
 * The persistence assertion is the point of the whole slice: before C1 the message lived in a
 * per-process Map, so a reload only "worked" while the same API process happened to be alive.
 */

const CHAT = '/my-work/communication?view=chat';

async function openChat(page: Page) {
  await page.goto(CHAT, { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('internal-chat')).toBeVisible();
}

/** Select the all-company channel, which every user in the tenant can see. */
async function openCompanyChannel(page: Page): Promise<string> {
  const company = page.getByTestId('chat-channel').filter({ hasText: 'All company' }).first();
  await expect(company).toBeVisible();
  const id = await company.getAttribute('data-channel-id');
  await company.click();
  await expect(page.getByTestId('chat-messages')).toBeVisible();
  return id ?? '';
}

test('Communication → Internal Chat → send → refresh → the message is still there', async ({ page }) => {
  // 1. Reached from Communication itself, not by typing the chat URL.
  await page.goto('/my-work/communication', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('my-communication-page')).toBeVisible();
  await page.getByTestId('comm-section-chat').click();
  await expect(page).toHaveURL(/view=chat/);
  await expect(page.getByTestId('internal-chat')).toBeVisible();

  // 2. Open the company channel.
  const channelId = await openCompanyChannel(page);
  expect(channelId).toBeTruthy();

  // 3. Send.
  const line = `c2-chat-proof-${Date.now()}`;
  await page.getByLabel('Message', { exact: true }).fill(line);
  await page.getByRole('button', { name: 'Send message' }).click();
  await expect(page.getByTestId('chat-message').filter({ hasText: line })).toBeVisible();

  // 4. Reload from the server — the message must come back from storage, not from React state.
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('internal-chat')).toBeVisible();
  await expect(page.getByTestId('chat-message').filter({ hasText: line })).toBeVisible();

  // Sender identity and a timestamp are rendered for the message.
  const message = page.getByTestId('chat-message').filter({ hasText: line });
  await expect(message.getByText('You')).toBeVisible();
  await expect(message.locator('time')).toBeVisible();
});

test('the channel rail searches, and a deep link reopens the exact conversation', async ({ page }) => {
  await openChat(page);
  const channelId = await openCompanyChannel(page);

  // Selecting a channel puts it in the URL, so the conversation is addressable.
  await expect(page).toHaveURL(new RegExp(`channel=${encodeURIComponent(channelId)}`));

  // 5. Search narrows the rail, and clearing it restores the list.
  const before = await page.getByTestId('chat-channel').count();
  await page.getByLabel('Search conversations').fill('all company');
  await expect(page.getByTestId('chat-channel')).toHaveCount(1);
  await page.getByLabel('Search conversations').fill('zzz-no-conversation-matches');
  await expect(page.getByTestId('chat-channel')).toHaveCount(0);
  await page.getByLabel('Search conversations').fill('');
  await expect(page.getByTestId('chat-channel')).toHaveCount(before);

  // 7. A cold deep link — no prior selection — lands on the same conversation.
  await page.goto(`/my-work/communication?view=chat&channel=${encodeURIComponent(channelId)}`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('internal-chat')).toBeVisible();
  await expect(page.getByTestId('chat-channel').filter({ hasText: 'All company' })).toHaveAttribute('aria-current', 'true');

  // ?channel= without ?view= still resolves to the chat section.
  await page.goto(`/my-work/communication?channel=${encodeURIComponent(channelId)}`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('internal-chat')).toBeVisible();
});

test('a direct message can be opened and used', async ({ page }) => {
  await openChat(page);

  // 6. Create/open a DM from the rail.
  await page.getByRole('button', { name: /New/ }).click();
  const picker = page.getByRole('group', { name: 'Start a direct message' });
  await expect(picker).toBeVisible();
  // Whoever the picker offers first is decided by the directory, not by this spec, and the
  // directory grows as other specs register users. Which teammate is irrelevant to what this
  // measures — but the conversation that opens must be with the one that was clicked, so the
  // name is captured and asserted rather than left to chance.
  const first = picker.getByRole('button').first();
  await expect(first).toBeVisible();
  const peerName = (await first.locator('strong').innerText()).trim();
  await first.click();

  await expect(page.getByRole('heading', { name: peerName, level: 3 })).toBeVisible();
  await expect(page.getByTestId('chat-messages')).toBeVisible();
  const line = `c2-dm-proof-${Date.now()}`;
  await page.getByLabel('Message', { exact: true }).fill(line);
  await page.getByRole('button', { name: 'Send message' }).click();
  await expect(page.getByTestId('chat-message').filter({ hasText: line })).toBeVisible();

  // The DM survives a reload too — it is a persisted channel, not a client-side one.
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('chat-message').filter({ hasText: line })).toBeVisible();

  // And it went ONLY to the DM. Opening a conversation used to wait for the channel rail before
  // switching the view, so a message sent in that window was posted to whatever was open before —
  // a private line landing in All company. Asserting the message is visible in the DM does not
  // catch that on its own; asserting it is absent from the channel it could have leaked into does.
  await openCompanyChannel(page);
  await expect(page.getByTestId('chat-message').filter({ hasText: line })).toHaveCount(0);
});

/**
 * The leak this exists to prevent, reproduced on purpose.
 *
 * Opening a conversation is a round trip. Until it lands, the composer on screen belongs to the
 * conversation being opened while the client still knows the previous one — and a message typed in
 * that window used to be posted to the previous conversation. It looked delivered, because the send
 * appends optimistically to whatever list is displayed; only a reload showed the truth. Against the
 * in-memory adapters the window is about a millisecond, so this never failed there. Against
 * PostgreSQL it is hundreds of milliseconds, and five consecutive runs put a line meant for a
 * private conversation into `ch-company`.
 *
 * Slowing the open makes the window enormous and the assertion deterministic on any backend.
 */
test('a message typed while a conversation is opening can never reach the previous one', async ({ page }) => {
  await openChat(page);
  await openCompanyChannel(page); // All company is what the composer would fall back to

  await page.route('**/api/comms/dm', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 3_000));
    await route.continue();
  });

  const line = `c2-race-proof-${Date.now()}`;
  await page.getByRole('button', { name: /New/ }).click();
  const picker = page.getByRole('group', { name: 'Start a direct message' });
  await expect(picker).toBeVisible();
  await picker.getByRole('button').first().click();

  // While the conversation is opening there is nothing to type into: the composer addresses no
  // settled conversation, so it refuses input rather than defaulting to the last one.
  await expect(page.getByLabel('Message', { exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Send message' })).toBeDisabled();

  // Then do exactly what a user does — type the moment it lets you, and send.
  await page.getByLabel('Message', { exact: true }).fill(line);
  await page.getByRole('button', { name: 'Send message' }).click();
  await expect(page.getByTestId('chat-message').filter({ hasText: line })).toBeVisible();

  // The screen can lie about delivery; a reload cannot.
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('internal-chat')).toBeVisible();
  await expect(page.getByTestId('chat-message').filter({ hasText: line })).toBeVisible();

  // And the channel it could have leaked into does not have it.
  await openCompanyChannel(page);
  await expect(page.getByTestId('chat-message').filter({ hasText: line })).toHaveCount(0);
});

/**
 * The same message must never render twice, however the two copies arrive.
 *
 * The conversation refetches on a 4s timer. If that poll reads a message the server has already
 * committed but whose POST response has not come back yet, the client then appends it a second
 * time — the same id in the list twice. Against the in-memory adapters the gap between commit and
 * append is about a millisecond, so it effectively never fires; against PostgreSQL it is hundreds
 * of milliseconds and it fired on the first clean-database run.
 *
 * The assertion is on React's duplicate-key warning rather than on a rendered count, because the
 * duplicate is TRANSIENT: the next poll replaces the list from the server and washes it away, so
 * `toHaveCount(1)` merely waits for the cleanup and passes either way — verified, by removing the
 * fix and watching a count-based version of this test still pass. The warning is emitted at the
 * moment of the bad render and cannot be undone by a later one.
 */
test('a message the poll already fetched is not appended a second time', async ({ page }) => {
  const duplicateKeys: string[] = [];
  page.on('console', (message) => {
    if (/two children with the same key/i.test(message.text())) duplicateKeys.push(message.text());
  });

  await openChat(page);
  await openCompanyChannel(page);

  const line = `c2-dedupe-proof-${Date.now()}`;

  await page.route('**/api/comms/channels/*/messages', async (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    // Let the server finish — the message is committed and visible to the next poll — then sit on
    // the response for longer than POLL_MS before handing it back to the client.
    const response = await route.fetch();
    await new Promise((resolve) => setTimeout(resolve, 6_000));
    await route.fulfill({ response });
  });

  await page.getByLabel('Message', { exact: true }).fill(line);
  await page.getByRole('button', { name: 'Send message' }).click();

  // Wait past the held response, so the append has definitely happened.
  await expect(page.getByTestId('chat-message').filter({ hasText: line })).toHaveCount(1);
  await page.waitForTimeout(8_000);

  expect(duplicateKeys, 'the same message id was rendered twice').toEqual([]);
  await expect(page.getByTestId('chat-message').filter({ hasText: line })).toHaveCount(1);

  // And exactly one survives a reload, so nothing was written twice either.
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('internal-chat')).toBeVisible();
  await expect(page.getByTestId('chat-message').filter({ hasText: line })).toHaveCount(1);
});

test('the chat is usable on a phone', async ({ page }) => {
  // 8. Single column at 390px: the rail collapses above the conversation, and both stay usable.
  await page.setViewportSize({ width: 390, height: 844 });
  await openChat(page);
  await openCompanyChannel(page);
  await expect(page.getByLabel('Search conversations')).toBeVisible();
  await expect(page.getByTestId('chat-messages')).toBeVisible();
  await expect(page.getByLabel('Message', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Send message' })).toBeVisible();
});

test('a third party cannot read a DM between two other people', async ({ page, browser, baseURL }) => {
  // 9. The session user opens a DM with someone, and posts into it.
  const peer = 'u-carol';
  const opened = await page.request.post('/api/comms/dm', { data: { peer } });
  expect(opened.ok()).toBe(true);
  const dm = await opened.json() as { id: string };
  const secret = `c2-private-${Date.now()}`;
  const posted = await page.request.post(`/api/comms/channels/${encodeURIComponent(dm.id)}/messages`, {
    data: { kind: 'text', text: secret },
  });
  expect(posted.ok()).toBe(true);

  // A different, authenticated user — not a participant — asks for the same channel by id.
  const other = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const login = await other.request.post('/api/auth/login', {
    data: {
      username: process.env.E2E_ALT_USERNAME ?? 'u-approver',
      password: process.env.E2E_PASSWORD ?? 'e2e-password',
    },
  });
  expect(login.ok()).toBe(true);

  const refused = await other.request.get(`/api/comms/channels/${encodeURIComponent(dm.id)}/messages`);
  // Concealed as not-found rather than forbidden: a 403 would confirm the DM exists.
  expect(refused.status()).toBe(404);
  expect(await refused.text()).not.toContain(secret);

  // And it is absent from their channel rail, so the UI never offers it either.
  const rail = await other.request.get('/api/comms/channels');
  expect(rail.ok()).toBe(true);
  expect(await rail.text()).not.toContain(dm.id);

  const otherPage = await other.newPage();
  await otherPage.goto(`${baseURL}/my-work/communication?view=chat&channel=${encodeURIComponent(dm.id)}`, { waitUntil: 'domcontentloaded' });
  await expect(otherPage.getByTestId('chat-forbidden')).toBeVisible();
  await expect(otherPage.getByText(secret)).toHaveCount(0);
  await other.close();
});

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
  const first = picker.getByRole('button').first();
  await expect(first).toBeVisible();
  await first.click();

  await expect(page.getByTestId('chat-messages')).toBeVisible();
  const line = `c2-dm-proof-${Date.now()}`;
  await page.getByLabel('Message', { exact: true }).fill(line);
  await page.getByRole('button', { name: 'Send message' }).click();
  await expect(page.getByTestId('chat-message').filter({ hasText: line })).toBeVisible();

  // The DM survives a reload too — it is a persisted channel, not a client-side one.
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('chat-message').filter({ hasText: line })).toBeVisible();
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

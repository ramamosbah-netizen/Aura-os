import { expect, test } from '@playwright/test';

// My Work is a PERSONAL EXECUTION center, not a launcher for links the sidebar already carries.
// Contacts (`/crm/contacts`, a Customers entry), Files (`/documents/control`, a module register) and
// Communication (now a sidebar center of its own) were removed as duplicates. Communication went
// only AFTER it gained that sidebar entry — before it, this tile was one of the few ways to reach
// the page at all, so removing it first would have orphaned it.
const SHORTCUTS = {
  Tasks: '/my-work/tasks',
  'Approvals & shared documents': '/my-work/approvals',
  'My Day': '/my-work/my-day',
  Favorites: '/my-work/favorites',
} as const;

/** Removed as duplicates — asserted absent so they cannot quietly return. */
const RETIRED_SHORTCUTS = ['Contacts', 'Files', 'Communication'] as const;

test('My Work aggregates attention and keeps domain records at their source', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => window.localStorage.removeItem('aura.record-tabs'));
  await page.goto('/my-work', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('my-work-dashboard')).toBeVisible();
  const auraTabs = page.getByRole('tablist', { name: 'Open AURA tabs' }).getByRole('tab');
  await expect(auraTabs).toHaveCount(1);
  await expect(auraTabs.nth(0)).toContainText('My Work');
  await expect(page.getByRole('heading', { name: /Good (morning|afternoon|evening)/ })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Ask AURA' })).toHaveAttribute('href', '/ai');
  await expect(page.getByText('Unread communication · chat · mail · WhatsApp')).toBeVisible();

  const shortcuts = page.getByTestId('my-work-shortcut');
  await expect(shortcuts).toHaveCount(4);
  for (const [label, href] of Object.entries(SHORTCUTS)) {
    const shortcut = shortcuts.filter({ has: page.getByText(label, { exact: true }) });
    await expect(shortcut).toHaveAttribute('href', href);
    await expect(shortcut).not.toHaveAttribute('target', '_blank');
  }
  for (const gone of RETIRED_SHORTCUTS) {
    await expect(shortcuts.filter({ has: page.getByText(gone, { exact: true }) })).toHaveCount(0);
  }
  // …and Communication is still REACHABLE, from the sidebar rather than from here. Removing a
  // duplicate must not remove the only route to a page.
  await expect(page.getByRole('link', { name: 'Communication', exact: true })).toHaveAttribute('href', '/my-work/communication');
  await expect(shortcuts.filter({ hasText: 'AURA' })).toHaveCount(0);

  const attentionItems = page.getByTestId('today-attention-item');
  for (let index = 0; index < await attentionItems.count(); index += 1) {
    const href = await attentionItems.nth(index).getAttribute('href');
    expect(href).toBeTruthy();
    expect(href).not.toBe('/my-work');
    await expect(attentionItems.nth(index)).not.toHaveAttribute('target', '_blank');
  }
  await expect(page.getByRole('link', { name: /Open My Day/ })).not.toHaveAttribute('target', '_blank');
  await expect(page.getByText('My Work owns attention.')).toBeVisible();

  const browserPageCount = page.context().pages().length;
  await shortcuts.filter({ has: page.getByText('Tasks', { exact: true }) }).click();
  await expect(page).toHaveURL('/my-work/tasks');
  expect(page.context().pages()).toHaveLength(browserPageCount);
  await expect(auraTabs).toHaveCount(2);
  await expect(auraTabs.nth(0)).toContainText('My Work');
  await expect(auraTabs.nth(1)).toContainText('Tasks');

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/my-work', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('my-work-dashboard')).toBeVisible();
  // The personal execution center keeps the same four owned shortcuts on mobile; responsive
  // layout changes presentation, not information architecture.
  await expect(page.getByTestId('my-work-shortcut')).toHaveCount(4);
});

test('My Work centers expose real sources and keep actions inside AURA tabs', async ({ page }) => {
  await page.goto('/my-work/tasks', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('my-tasks-page')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'All tasks' })).toBeVisible();
  const taskViews = page.getByRole('navigation', { name: 'Task views' });
  await expect(taskViews).toBeVisible();
  for (const view of ['All tasks', 'Assigned to me', 'Created by me', 'From system', 'From others', 'Upcoming', 'Overdue', 'Follow-ups', 'Completed']) {
    await expect(taskViews.getByRole('button', { name: new RegExp(view) })).toBeVisible();
  }
  await page.getByRole('button', { name: 'Filters', exact: true }).click();
  for (const filter of ['Filter by module', 'Filter by project', 'Filter by priority', 'Filter by status', 'Sort tasks']) {
    await expect(page.getByLabel(filter)).toBeVisible();
  }
  await expect(page.getByLabel('Search tasks')).toBeVisible();
  await expect(page.getByText('AURA PRIORITY BRIEF')).toBeVisible();
  await expect(page.getByText('Task source coverage')).toBeVisible();
  for (const link of await page.getByTestId('my-tasks-page').getByRole('link').all()) await expect(link).not.toHaveAttribute('target', '_blank');

  await taskViews.getByRole('button', { name: /Completed/ }).click();
  await expect(page.getByRole('heading', { name: 'Completed' })).toBeVisible();
  await page.getByLabel('Search tasks').fill('no-record-can-match-this-value');
  await expect(page.getByText('No matching work')).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('navigation', { name: 'Task views' })).toBeVisible();
  await expect(page.getByLabel('Search tasks')).toBeVisible();

  // Back to desktop: the mobile checks above leave a 390px viewport, where the approvals
  // filters deliberately collapse (`.filters select{display:none}` under 700px).
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/my-work/approvals', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('my-approvals-page')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Approvals & Reviews' })).toBeVisible();
  await expect(page.getByRole('complementary', { name: 'Approval views' })).toBeVisible();
  await expect(page.getByRole('table', { name: 'Approvals and reviews' }).or(page.getByText('No matching decisions')).or(page.getByText('Decision sources are unavailable'))).toBeVisible();
  for (const view of ['Inbox', 'To Review', 'To Approve', 'Sign-off / Decision', 'Returned', 'Waiting', 'Completed']) {
    await expect(page.getByRole('button', { name: new RegExp(view) })).toBeVisible();
  }
  await expect(page.getByLabel('Search decisions')).toBeVisible();
  await expect(page.getByLabel('Filter by domain')).toBeVisible();
  await expect(page.getByText('Tasks and My Day are not duplicated here')).toBeVisible();
  await page.getByRole('button', { name: /Waiting/ }).click();
  // Waiting/Returned/Completed are the "unavailable" views: AURA has no verified assignment state
  // for them, and says so rather than inventing a zero. The previous assertion demanded the string
  // 'Workflow projection not connected yet', which exists nowhere in the app, so it could never
  // pass. This asserts the empty state the product actually renders.
  await expect(
    page.getByRole('table', { name: 'Approvals and reviews' })
      .or(page.getByText('No verified items in this view')),
  ).toBeVisible();
  for (const link of await page.getByTestId('my-approvals-page').getByRole('link').all()) await expect(link).not.toHaveAttribute('target', '_blank');

  await page.goto('/my-work/communication', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('my-communication-page')).toBeVisible();
  // Anchored on the section entry rather than on loose page text: the old exact-text assertions
  // would break the moment the product legitimately shows the provider name in more than one
  // place, which is the test dictating the design instead of protecting it.
  const whatsapp = page.getByTestId('comm-section-whatsapp');
  await expect(whatsapp).toBeVisible();
  await expect(whatsapp).toContainText('WhatsApp');
  await expect(whatsapp).toContainText('Not connected');
  for (const link of await page.getByTestId('my-communication-page').getByRole('link').all()) await expect(link).not.toHaveAttribute('target', '_blank');

  await page.goto('/my-work/favorites', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('my-favorites-page')).toBeVisible();
  for (const link of await page.getByTestId('my-favorites-page').getByRole('link').all()) await expect(link).not.toHaveAttribute('target', '_blank');
});

test('My Day owns cross-module daily focus and legacy CRM route redirects', async ({ page }) => {
  await page.goto('/my-work/my-day', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('my-day-page')).toBeVisible();
  await expect(page.getByRole('heading', { name: /Good (morning|afternoon|evening)/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Today’s plan' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Appointments' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Accessible approvals' })).toBeVisible();
  await expect(page.getByText('My Day owns focus.')).toBeVisible();
  await expect(page.getByText('Daily source coverage')).toBeVisible();
  for (const link of await page.getByTestId('my-day-page').getByRole('link').all()) await expect(link).not.toHaveAttribute('target', '_blank');

  await page.goto('/crm/my-day?userId=rep-a&view=compact', { waitUntil: 'domcontentloaded' });
  await expect(page).toHaveURL('/my-work/my-day?userId=rep-a&view=compact');

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/my-work/my-day', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('my-day-page')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Today’s plan' })).toBeVisible();
});

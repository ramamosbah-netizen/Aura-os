import { expect, test } from '@playwright/test';

test.describe('Wave 1 representative role catalog UX', () => {
  test('explains job, scope and approval separation and exposes the complete operating roles', async ({ page }) => {
    await page.goto('/admin/access', { waitUntil: 'domcontentloaded' });

    await expect(page.getByRole('heading', { name: 'Role catalog' })).toBeVisible();
    await expect(page.getByText('1. Choose the job')).toBeVisible();
    await expect(page.getByText('2. Choose where it applies')).toBeVisible();
    await expect(page.getByText('3. Keep approvals separate')).toBeVisible();

    for (const roleId of [
      'r-sales',
      'r-pre-sales',
      'r-estimator',
      'r-technical-engineer',
      'r-planning-engineer',
      'r-project-engineer',
      'r-pm',
      'r-technical-manager',
      'r-commercial-manager',
      'r-procurement-manager',
      'r-commissioning-engineer',
      'r-handover-fm',
      'r-executive',
    ]) {
      await expect(page.getByTestId(`role-card-${roleId}`), roleId).toBeAttached();
    }

    await page.getByRole('textbox', { name: 'Find a role' }).fill('Planning');
    const planner = page.getByTestId('role-card-r-planning-engineer');
    await expect(planner).toBeVisible();
    await expect(planner).toContainText('Builds WBS and schedules');
    await expect(planner).toContainText('Assign inside a project');
    await expect(page.getByTestId('role-card-r-sales')).toHaveCount(0);

    await expect(page.getByRole('heading', { name: 'Advanced permission matrix' })).toBeVisible();
    await expect(page.getByText(/Use this grid for company-wide assignments/)).toBeVisible();
  });
});

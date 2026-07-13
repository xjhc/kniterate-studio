import { expect, test } from '@playwright/test';

test('creates, renames, recolors, autosaves, and recovers a customer project', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');

  await page.getByRole('button', { name: 'New project' }).first().click();
  const newProject = page.getByRole('dialog', { name: 'New project' });
  await newProject.getByLabel('Project name').fill('Harbor blanket');
  await newProject.getByLabel('Needles').fill('64');
  await newProject.getByLabel('Rows').fill('72');
  await newProject.getByRole('button', { name: '2', exact: true }).click();
  await newProject.getByRole('button', { name: 'Create' }).click();
  await expect(page.locator('.brand-copy small')).toContainText('Harbor blanket');

  await page.getByRole('button', { name: 'Project settings' }).click();
  const settings = page.getByRole('dialog', { name: 'Project settings' });
  await settings.getByLabel('Project name').fill('Harbor blanket v1');
  await settings.getByLabel('Palette color 1 name').fill('Ivory');
  await settings.locator('input[type="color"]').first().fill('#E8E1D2');
  await settings.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.locator('.brand-copy small')).toContainText('Harbor blanket v1');
  await expect(page.locator('.autosave-state.saved')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Export k-code' })).toBeEnabled({ timeout: 15_000 });

  await page.reload();
  await expect(page.locator('.brand-copy small')).toContainText('Harbor blanket v1');
  await expect(page.getByRole('button', { name: 'Use Ivory' })).toBeVisible();
  await expect(page.locator('.autosave-state.saved')).toBeVisible();
  expect(errors).toEqual([]);
});

import { expect, test } from '@playwright/test';
import { kcDownload, menu } from './menu';

test('creates, renames, recolors, autosaves, and recovers a customer project', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');

  // A first visit starts by choosing what to make.
  await expect(page.getByRole('heading', { name: 'What would you like to make?' })).toBeVisible();
  await page.getByRole('button', { name: /^Scarf or blanket/ }).click();
  const newProject = page.getByRole('dialog', { name: 'New project' });
  await newProject.getByRole('radio', { name: 'Colour chart' }).click();
  await newProject.getByLabel('Project name').fill('Harbor blanket');
  await newProject.getByLabel('Needles').fill('64');
  await newProject.getByLabel('Rows').fill('72');
  await newProject.getByRole('button', { name: '2', exact: true }).click();
  await newProject.getByRole('button', { name: 'Create' }).click();
  await expect(page.locator('.brand-copy small')).toContainText('Harbor blanket');

  await menu(page, 'Edit', 'Name and colours…');
  const settings = page.getByRole('dialog', { name: 'Project settings' });
  await settings.getByLabel('Project name').fill('Harbor blanket v1');
  await settings.getByLabel('Palette colour 1 name').fill('Ivory');
  await settings.locator('input[type="color"]').first().fill('#E8E1D2');
  await settings.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.locator('.brand-copy small')).toContainText('Harbor blanket v1');
  await expect(page.locator('.app-shell')).toHaveAttribute('data-autosave', 'saved');
  await expect(kcDownload(page)).toBeEnabled({ timeout: 15_000 });

  await page.reload();
  await expect(page.locator('.brand-copy small')).toContainText('Harbor blanket v1');
  await expect(page.getByRole('button', { name: 'Use Ivory' })).toBeVisible();
  await expect(page.locator('.app-shell')).toHaveAttribute('data-autosave', 'saved');
  expect(errors).toEqual([]);
});

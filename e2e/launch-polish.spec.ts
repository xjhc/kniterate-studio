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
  // Sized in cm, at a typical gauge until a swatch is measured.
  await newProject.getByLabel('Width (cm)').fill('25');
  await newProject.getByLabel('Length (cm)').fill('21');
  await expect(newProject.getByText(/^65 needles × 71 rows at a typical gauge/)).toBeVisible();
  await newProject.getByRole('button', { name: '2', exact: true }).click();
  await newProject.getByRole('button', { name: 'Create' }).click();
  await expect(page.locator('.brand-copy small')).toContainText('Harbor blanket');
  const size = page.getByRole('group', { name: 'Finished measurements' });
  await expect(size.locator('.measure-row').filter({ hasText: /^Width/ }).locator('.count')).toHaveText('65 st');
  await expect(size.locator('.measure-row').filter({ hasText: /^Length/ }).locator('.count')).toHaveText('71 rows');

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

test('starting another project keeps the first one on this device, to open again or remove', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/?theme=light');
  await page.getByRole('button', { name: /^Beanie/ }).click();
  const create = page.getByRole('dialog', { name: 'New project' });
  await create.getByLabel('Project name').fill('Ring toque');
  await create.getByRole('button', { name: 'Create beanie' }).click();
  await expect(page.locator('.brand-copy small')).toContainText('Ring toque');

  // A scarf started straight away: the hat is kept with its latest change, without waiting for the autosave.
  await menu(page, 'File', 'New project…');
  await create.getByRole('tab', { name: 'Scarf or blanket' }).click();
  await create.getByLabel('Project name').fill('Moss scarf');
  await create.getByRole('button', { name: 'Create' }).click();
  await expect(page.locator('.brand-copy small')).toContainText('Moss scarf');

  await menu(page, 'File', 'Open recent…');
  const recent = page.getByRole('dialog', { name: 'Recent projects' });
  await expect(recent.getByRole('button', { name: /^Moss scarf/ })).toBeDisabled();
  await expect(recent.getByRole('button', { name: /^Moss scarf/ })).toContainText('open now');
  await recent.getByRole('button', { name: /^Ring toque/ }).click();
  await expect(page.locator('.brand-copy small')).toContainText('Ring toque');
  await expect(page.getByTestId('readiness-headline')).toHaveText('Ready to knit, sizes not confirmed', { timeout: 30_000 });

  // Both survive a reload, and the open one comes back open.
  await expect(page.locator('.app-shell')).toHaveAttribute('data-autosave', 'saved');
  await page.reload();
  await expect(page.locator('.brand-copy small')).toContainText('Ring toque');
  await menu(page, 'File', 'Open recent…');
  await expect(recent.getByRole('listitem')).toHaveCount(2);
  // Removing asks twice.
  await recent.getByRole('button', { name: 'Remove Moss scarf' }).click();
  await recent.getByRole('button', { name: 'Remove for good' }).click();
  await expect(recent.getByRole('listitem')).toHaveCount(1);
  await expect(recent.getByRole('button', { name: /^Ring toque/ })).toContainText('open now');
  expect(errors).toEqual([]);
});

test('the same project open in two tabs: a change in either is taken up by the other, so neither saves over it', async ({ page, context }) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/?theme=light');
  await page.getByRole('button', { name: /^Beanie/ }).click();
  const create = page.getByRole('dialog', { name: 'New project' });
  await create.getByLabel('Project name').fill('Ring toque');
  await create.getByRole('button', { name: 'Create beanie' }).click();
  await expect(page.locator('.app-shell')).toHaveAttribute('data-autosave', 'saved');

  const other = await context.newPage();
  other.on('pageerror', (error) => errors.push(error.message));
  await other.goto('/?theme=light');
  await expect(other.locator('.brand-copy small')).toContainText('Ring toque');
  await expect(other.locator('.app-shell')).toHaveAttribute('data-autosave', 'saved');

  await page.getByLabel('Head circumference').fill('60');
  await page.getByLabel('Head circumference').press('Enter');
  await expect(other.getByLabel('Head circumference')).toHaveValue('60');
  await other.getByLabel('Cuff height').fill('9');
  await other.getByLabel('Cuff height').press('Enter');
  await expect(page.getByLabel('Cuff height')).toHaveValue('9');
  await expect(other.locator('.app-shell')).toHaveAttribute('data-autosave', 'saved');

  // Both changes are kept, in one project: there is no other to open.
  await page.reload();
  await expect(page.getByLabel('Head circumference')).toHaveValue('60');
  await expect(page.getByLabel('Cuff height')).toHaveValue('9');
  await page.getByRole('navigation', { name: 'Menu' }).getByRole('button', { name: 'File', exact: true }).click();
  await expect(page.getByRole('menu', { name: 'File' }).getByRole('menuitem', { name: 'Open recent…' })).toBeDisabled();
  expect(errors).toEqual([]);
});

import { expect, test } from '@playwright/test';
import { kcDownload, menu } from './menu';

test('every project has one layout: a menu bar, Design / Schematic / Machine file, and status with the files', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await page.locator('input[accept=".json,application/json"]').setInputFiles('fixtures/colorwork-chart-v1/four-color-checker.json');

  // One menu bar; no developer columns.
  await expect(page.getByRole('navigation', { name: 'Menu' })).toBeVisible();
  for (const name of ['Design', 'Schematic', 'Machine file']) await expect(page.getByRole('tab', { name, exact: true })).toBeVisible();
  for (const jargon of ['Machine truth', 'Compiler intent', 'Design intent']) await expect(page.getByText(jargon)).toHaveCount(0);

  // What you are making on the left; its backings are the two Customist-matched ones.
  await expect(page.locator('.strategy-segments button')).toHaveCount(2);
  await page.getByRole('button', { name: /^Fairisle/ }).click();
  await page.getByRole('button', { name: /^Birdseye/ }).click();
  await expect(kcDownload(page)).toBeEnabled({ timeout: 20_000 });
  await expect(page.getByRole('button', { name: 'Download knitting package' })).toBeEnabled();

  // The schematic is the whole run: waste yarn, draw thread, the piece and its finish.
  await page.getByRole('tab', { name: 'Schematic', exact: true }).click();
  const schematic = page.getByTestId('schematic');
  for (const label of ['Waste yarn', 'Draw thread', 'Cast-on', 'Pattern', 'Waste yarn on top']) await expect(schematic).toContainText(label);

  // The machine file, read back; stepping through it shows the exact machine movement.
  await page.getByRole('tab', { name: 'Machine file', exact: true }).click();
  await expect(page.locator('.knitfile-sections li').first()).toContainText('Waste yarn');
  await expect(page.locator('.knitfile-source')).toContainText('FRNT:');
  await page.getByRole('tab', { name: 'Step through', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Exact machine movement' })).toBeVisible();
  await expect(page.getByText('KCode coordinates; physical needle labels unverified.')).toBeVisible();

  // The knitting sheet keeps focus inside and gives it back to the menu.
  await menu(page, 'File', 'Print knitting sheet');
  await expect(page.getByRole('button', { name: 'Close', exact: true })).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(page.getByRole('button', { name: 'Print', exact: true })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Close', exact: true })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('navigation', { name: 'Menu' }).getByRole('button', { name: 'File', exact: true })).toBeFocused();

  // On a phone the same layout stacks, without sideways scrolling.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('tab', { name: 'Design', exact: true }).click();
  await expect(page.locator('canvas.chart-canvas').first()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  expect(errors).toEqual([]);
});

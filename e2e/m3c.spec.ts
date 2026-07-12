import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

test('blanket setup persists intent and the Worker owns live compile verdicts', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await page.locator('input[accept=".json,application/json"]').setInputFiles('fixtures/colorwork-chart-v1/four-color-checker.json');
  await expect(page.locator('.compile-verdict')).toContainText('Surface-proven', { timeout: 15_000 });

  await page.getByRole('button', { name: 'Complement', exact: true }).click();
  await expect(page.locator('.compile-verdict')).toContainText('Blocked');
  await expect(page.locator('.setup-error')).toContainText('exactly two used colors');
  await page.getByRole('button', { name: 'Birdseye', exact: true }).click();

  await page.getByLabel('Needles', { exact: true }).fill('6');
  await page.getByLabel('Needles', { exact: true }).press('Tab');
  await page.getByLabel('Rows', { exact: true }).fill('5');
  await page.getByLabel('Rows', { exact: true }).press('Tab');
  await page.getByLabel('Waste rows', { exact: true }).fill('24');
  await page.getByLabel('Waste rows', { exact: true }).press('Tab');
  await expect(page.locator('.compile-verdict')).toContainText('Surface-proven', { timeout: 15_000 });
  await expect(page.locator('.compile-stats')).toContainText('Passes');

  const downloadEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save project', exact: true }).click();
  const path = testInfo.outputPath('configured-blanket.json');
  await (await downloadEvent).saveAs(path);
  const project = JSON.parse(await readFile(path, 'utf8'));
  expect(project.history.entries.map((entry: { edit: { kind: string } }) => entry.edit.kind)).toEqual([
    'set-strategy', 'set-strategy', 'set-width', 'set-height', 'set-frame',
  ]);
  expect(project.history.cursor).toBe(5);
  expect(errors).toEqual([]);
});

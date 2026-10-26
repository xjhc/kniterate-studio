import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { menu } from './menu';

test('blanket setup persists intent and the Worker owns live compile verdicts', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await page.locator('input[accept=".json,application/json"]').setInputFiles('fixtures/colorwork-chart-v1/four-color-checker.json');
  await expect(page.getByLabel('Verdict: File checks passed')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('button', { name: /Fairisle/ })).not.toContainText('Calculating', { timeout: 15_000 });
  // Only backings with a Customist-matched reference program are offered.
  await expect(page.locator('.strategy-segments button')).toHaveCount(2);

  await page.getByRole('button', { name: /Fairisle/ }).click();
  await page.getByLabel('Longest float', { exact: true }).fill('7');
  await page.getByLabel('Longest float', { exact: true }).press('Tab');

  await page.getByRole('button', { name: /Birdseye/ }).click();

  await page.getByLabel('Needles', { exact: true }).fill('6');
  await page.getByLabel('Needles', { exact: true }).press('Tab');
  await page.getByLabel('Rows', { exact: true }).fill('5');
  await page.getByLabel('Rows', { exact: true }).press('Tab');
  await expect(page.getByLabel('Verdict: File checks passed')).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('.strategy-segments button.active')).toContainText(/\d+ min/);

  const downloadEvent = page.waitForEvent('download');
  await menu(page, 'File', 'Save project');
  const path = testInfo.outputPath('configured-blanket.json');
  await (await downloadEvent).saveAs(path);
  const project = JSON.parse(await readFile(path, 'utf8'));
  expect(project.history.entries.map((entry: { edit: { kind: string } }) => entry.edit.kind)).toEqual([
    'set-strategy', 'set-strategy', 'set-strategy', 'set-width', 'set-height',
  ]);
  expect(project.history.entries[1].edit.strategy.floatLimit).toBe(7);
  expect(project.history.cursor).toBe(5);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('tab', { name: 'Machine file', exact: true }).click();
  await expect(page.locator('.knitfile-sections li').filter({ hasText: 'Pattern' })).toContainText('rows 1–5');
  await expect(page.getByLabel('Verdict: File checks passed')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  expect(errors).toEqual([]);
});

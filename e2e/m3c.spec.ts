import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

test('blanket setup persists intent and the Worker owns live compile verdicts', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await page.locator('input[accept=".json,application/json"]').setInputFiles('fixtures/colorwork-chart-v1/four-color-checker.json');
  await expect(page.locator('.compile-verdict')).toContainText('Surface-proven', { timeout: 15_000 });
  await expect(page.getByRole('button', { name: /Fairisle/ })).not.toContainText('Calculating', { timeout: 15_000 });
  await expect(page.getByRole('button', { name: /Complement/ })).toContainText('Blocked');

  await page.getByRole('button', { name: /Fairisle/ }).click();
  await page.getByLabel('Float budget', { exact: true }).fill('7');
  await page.getByLabel('Float budget', { exact: true }).press('Tab');

  const canvasBox = await page.locator('canvas.chart-canvas').first().boundingBox();
  if (!canvasBox) throw new Error('Chart canvas has no browser geometry');
  await page.mouse.move(canvasBox.x + 78, canvasBox.y + 8);
  await page.getByRole('button', { name: 'Open machine', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Predicted pass grid' })).toBeVisible();
  await expect(page.locator('.pass-row.selected')).toContainText('R3');
  await page.getByRole('button', { name: 'Open chart', exact: true }).click();

  await page.getByRole('button', { name: /Complement/ }).click();
  await expect(page.locator('.compile-verdict')).toContainText('Blocked');
  await expect(page.locator('.setup-error')).toContainText('exactly two used colors');
  await page.getByRole('button', { name: /Birdseye/ }).click();

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
    'set-strategy', 'set-strategy', 'set-strategy', 'set-strategy', 'set-width', 'set-height', 'set-frame',
  ]);
  expect(project.history.entries[1].edit.strategy.floatLimit).toBe(7);
  expect(project.history.cursor).toBe(7);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Open machine', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Predicted pass grid' })).toBeVisible();
  await expect(page.getByLabel('Verdict: Surface-proven')).toBeVisible();
  const visibleHeaders = await page.locator('.pass-head span:visible').evaluateAll((elements) => elements.map((element) => {
    const box = element.getBoundingClientRect();
    return { left: box.left, right: box.right };
  }));
  for (let index = 1; index < visibleHeaders.length; index += 1) expect(visibleHeaders[index]!.left).toBeGreaterThanOrEqual(visibleHeaders[index - 1]!.right);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  expect(errors).toEqual([]);
});

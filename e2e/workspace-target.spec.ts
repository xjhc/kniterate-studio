import { expect, test } from '@playwright/test';

test('keeps chart, strategy, machine truth, source, and refusal state in one V1 workspace', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await page.locator('input[accept=".json,application/json"]').setInputFiles('fixtures/colorwork-chart-v1/four-color-checker.json');

  await expect(page.locator('.authored-chart')).toBeVisible();
  await expect(page.locator('.blanket-setup')).toBeVisible();
  await expect(page.locator('.authored-machine')).toBeVisible();
  for (const region of ['Waste yarn', 'Draw thread', 'Blanket body', 'Finish']) await expect(page.getByRole('button', { name: new RegExp(`^${region}`) })).toBeVisible();

  await page.getByRole('button', { name: /^Complement/ }).click();
  await expect(page.getByLabel('Verdict: Blocked')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Export k-code' })).toBeDisabled();
  await page.getByRole('button', { name: /^Birdseye/ }).click();
  await expect(page.getByRole('button', { name: 'Export k-code' })).toBeEnabled({ timeout: 20_000 });

  await page.getByRole('tab', { name: 'K-code .kc' }).click();
  await expect(page.locator('.generated-source-content')).toContainText('FRNT:');
  await page.getByRole('button', { name: /^Hide/ }).click();
  await expect(page.locator('.generated-source')).toHaveClass(/collapsed/);
  await expect(page).toHaveURL(/dock=closed/);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('tab', { name: 'machine' }).click();
  await expect(page.locator('.authored-machine')).toBeVisible();
  await expect(page.locator('.blanket-setup')).not.toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);

  const runButton = page.getByRole('button', { name: 'Open run sheet' });
  await runButton.click();
  await expect(page.getByRole('button', { name: 'Close' })).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(page.getByRole('button', { name: 'Print' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Close' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(runButton).toBeFocused();
  expect(errors).toEqual([]);
});

import { stat, writeFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

test('opens, navigates, diffs, prints, and blocks foreign machine files', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  const machineInput = page.locator('input[accept=".kc,.k,text/plain"]');
  await machineInput.setInputFiles('packages/machine-lib/reference/fairisle.kc');
  await expect(page.getByRole('heading', { name: 'Pass grid' })).toBeVisible();
  await expect(page.getByText('Surface-proven (imported)', { exact: true })).toBeVisible();
  const selectedBefore = await page.locator('.pass-row.selected .pass-number').innerText();
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('.pass-row.selected .pass-number')).not.toHaveText(selectedBefore);

  await page.getByRole('button', { name: 'Open run sheet', exact: true }).click();
  await expect(page.locator('.run-sheet')).toContainText('fairisle.kc');
  const pdfPath = testInfo.outputPath('foreign-run-sheet.pdf');
  await page.pdf({ path: pdfPath, printBackground: true });
  expect((await stat(pdfPath)).size).toBeGreaterThan(5_000);
  await page.getByRole('button', { name: /Close/ }).click();

  await page.getByTitle('Pass diff').click();
  await page.locator('input[accept=".kc,text/plain"]').setInputFiles('packages/machine-lib/reference/fairisle.kc');
  await expect(page.getByText('Pass-identical', { exact: true })).toBeVisible();

  const refusal = testInfo.outputPath('refusal.k');
  await writeFile(refusal, [';!knitout-2', ';;Machine: kniterate', ';;Carriers: 7', 'in 7', 'knit + f40 7', ''].join('\n'));
  await machineInput.setInputFiles(refusal);
  await expect(page.getByText('Blocked', { exact: true })).toBeVisible();
  await expect(page.getByText('Invalid carrier ID', { exact: true }).first()).toBeVisible();
  expect(errors).toEqual([]);
});

import { readFile, stat, writeFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';

async function waitForExport(page: Page, timeout = 20_000) {
  const button = page.getByRole('button', { name: 'Export k-code', exact: true });
  await expect(button).toBeEnabled({ timeout });
  return button;
}

async function downloadFrom(page: Page, button: ReturnType<Page['getByRole']>, path: string) {
  const event = page.waitForEvent('download');
  await button.click();
  await (await event).saveAs(path);
}

test('exports validated k-code and reproduces it byte-identically after project reopen', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await page.locator('input[accept=".json,application/json"]').setInputFiles('fixtures/colorwork-chart-v1/four-color-checker.json');
  await expect(page.locator('.compile-verdict')).toContainText('Surface-proven', { timeout: 15_000 });

  await page.getByRole('button', { name: /Complement/ }).click();
  await expect(page.getByRole('button', { name: 'Export k-code', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: /Birdseye/ }).click();
  await page.getByLabel('Waste rows', { exact: true }).fill('24');
  await page.getByLabel('Waste rows', { exact: true }).press('Tab');

  const firstExport = await waitForExport(page);
  const firstKc = testInfo.outputPath('first.kc');
  await downloadFrom(page, firstExport, firstKc);
  const firstBytes = await readFile(firstKc);
  expect(firstBytes.toString('utf8')).toContain('FRNT:');
  expect(firstBytes.toString('utf8')).toContain('>>');

  await page.getByRole('tab', { name: 'K-code .kc', exact: true }).click();
  await expect(page.locator('.generated-source-content')).toContainText('FRNT:');
  await page.getByRole('button', { name: 'Open run sheet', exact: true }).click();
  await expect(page.locator('.run-sheet')).toContainText('C1');
  await expect(page.locator('.run-sheet')).toContainText('C6');
  if (testInfo.project.name === 'chromium') {
    const pdfPath = testInfo.outputPath('run-sheet.pdf');
    await page.pdf({ path: pdfPath, printBackground: true });
    expect((await stat(pdfPath)).size).toBeGreaterThan(5_000);
  }
  await page.getByRole('button', { name: /Close/ }).click();

  const projectDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save project', exact: true }).click();
  const projectPath = testInfo.outputPath('blanket-project.json');
  await (await projectDownload).saveAs(projectPath);
  await page.reload();
  await page.locator('input[accept=".json,application/json"]').setInputFiles(projectPath);
  const secondExport = await waitForExport(page);
  const secondKc = testInfo.outputPath('second.kc');
  await downloadFrom(page, secondExport, secondKc);
  expect(await readFile(secondKc)).toEqual(firstBytes);

  await page.locator('input[accept=".kc,.k,text/plain"]').first().setInputFiles(secondKc);
  await expect(page.getByText('Surface-proven (imported)', { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test('exports and reopens the canonical 200x300 four-color authored blanket', async ({ page }, testInfo) => {
  test.setTimeout(150_000);
  const errors: string[] = [];
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('pageerror', (error) => errors.push(error.message));
  const palette = [
    { id: 'natural', name: 'Natural', hex: '#F1EDE3' },
    { id: 'red', name: 'Red', hex: '#B4423A' },
    { id: 'gold', name: 'Gold', hex: '#C99A35' },
    { id: 'navy', name: 'Navy', hex: '#29445F' },
  ];
  const chart = {
    kind: 'knitlab-colorwork-chart', version: 1, title: 'Browser blanket benchmark', width: 200, height: 300,
    rowNumbering: 'bottom-up', palette,
    cells: Array.from({ length: 300 }, (_, row) => Array.from({ length: 200 }, (_, column) => (Math.floor(column / 8) + Math.floor(row / 6) + (column % 5 === 0 ? 1 : 0)) % 4)),
  };
  const chartPath = testInfo.outputPath('four-color-blanket.json');
  await writeFile(chartPath, JSON.stringify(chart));
  await page.goto('/');
  const started = Date.now();
  await page.locator('input[accept=".json,application/json"]').setInputFiles(chartPath);
  await page.getByRole('button', { name: 'Toggle theme', exact: true }).click();
  await expect(page.locator('.app-shell')).toHaveAttribute('data-theme', 'dark');
  const firstExport = await waitForExport(page, 60_000);
  const readyAfterMs = Date.now() - started;
  testInfo.annotations.push({ type: 'benchmark', description: `Canonical authored export ready after ${readyAfterMs} ms` });
  const firstKc = testInfo.outputPath('canonical-200x300-first.kc');
  await downloadFrom(page, firstExport, firstKc);
  const firstBytes = await readFile(firstKc);
  expect(firstBytes.length).toBeGreaterThan(1_000_000);
  expect(firstBytes.toString('utf8')).toContain('FRNT:');
  await expect(page.locator('.compile-stats')).toContainText('5,032');

  const projectDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save project', exact: true }).click();
  const projectPath = testInfo.outputPath('canonical-200x300.kniterate-studio.json');
  await (await projectDownload).saveAs(projectPath);
  await page.reload();
  await page.locator('input[accept=".json,application/json"]').setInputFiles(projectPath);
  const secondExport = await waitForExport(page, 60_000);
  const secondKc = testInfo.outputPath('canonical-200x300-second.kc');
  await downloadFrom(page, secondExport, secondKc);
  expect(await readFile(secondKc)).toEqual(firstBytes);

  await page.locator('input[accept=".kc,.k,text/plain"]').first().setInputFiles(secondKc);
  await expect(page.getByText('Surface-proven (imported)', { exact: true })).toBeVisible({ timeout: 30_000 });
  expect(errors).toEqual([]);
});

test('refuses an oversized authored Birdseye project before compiler allocation', async ({ page }, testInfo) => {
  test.setTimeout(45_000);
  const width = 252;
  const height = 300;
  const chart = {
    kind: 'knitlab-colorwork-chart', version: 1, title: 'Oversized authored blanket', width, height,
    rowNumbering: 'bottom-up',
    palette: [
      { id: 'natural', name: 'Natural', hex: '#F1EDE3' },
      { id: 'red', name: 'Red', hex: '#B4423A' },
      { id: 'gold', name: 'Gold', hex: '#C99A35' },
      { id: 'navy', name: 'Navy', hex: '#29445F' },
    ],
    cells: Array.from({ length: height }, (_, row) =>
      Array.from({ length: width }, (_, column) =>
        (Math.floor(column / 8) + Math.floor(row / 6) + (column % 5 === 0 ? 1 : 0)) % 4)),
  };
  const chartPath = testInfo.outputPath('oversized-authored-blanket.json');
  await writeFile(chartPath, JSON.stringify(chart));
  await page.goto('/');
  const started = Date.now();
  await page.locator('input[accept=".json,application/json"]').setInputFiles(chartPath);
  await expect(page.locator('.setup-error')).toContainText('authored V1 limit is 600,000', { timeout: 15_000 });
  const blockedAfterMs = Date.now() - started;
  expect(blockedAfterMs).toBeLessThan(15_000);
  testInfo.annotations.push({ type: 'benchmark', description: `Oversized authored refusal reported after ${blockedAfterMs} ms` });
  await expect(page.locator('.compile-verdict')).toContainText('Blocked');
  await expect(page.getByRole('button', { name: 'Export k-code', exact: true })).toBeDisabled();
  await expect(page.locator('.compile-stats')).toContainText('Operations0');
});

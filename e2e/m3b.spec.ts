import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';

const fixture = 'fixtures/colorwork-chart-v1/four-color-checker.json';

async function importProject(page: Page, path = fixture) {
  await page.locator('input[accept=".json,application/json"]').setInputFiles(path);
  await expect(page.getByRole('heading', { level: 1 })).not.toHaveText('Untitled colorwork');
}

async function canvasGeometry(page: Page, cell = 16) {
  const canvas = page.locator('canvas.chart-canvas').first();
  const box = await canvas.boundingBox();
  if (!box) throw new Error('Chart canvas has no browser geometry');
  return {
    canvas,
    point(column: number, row: number) {
      return { x: box.x + 42 + (column + 0.5) * cell, y: box.y + (row + 0.5) * cell };
    },
  };
}

async function drag(page: Page, start: { x: number; y: number }, end: { x: number; y: number }, steps = 4) {
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps });
  await page.mouse.up();
}

test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByText('Kniterate Studio', { exact: true })).toBeVisible();
  (page as Page & { browserErrors?: string[] }).browserErrors = errors;
});

test.afterEach(async ({ page }) => {
  expect((page as Page & { browserErrors?: string[] }).browserErrors).toEqual([]);
});

test('imports, edits with every tool, uses history and clipboard, then reopens exactly', async ({ page }, testInfo) => {
  await importProject(page);
  const { point } = await canvasGeometry(page);

  await page.getByRole('button', { name: 'Use Red', exact: true }).click();
  await page.getByRole('button', { name: 'Line', exact: true }).click();
  await drag(page, point(0, 0), point(3, 2));
  await page.getByRole('button', { name: 'Rectangle', exact: true }).click();
  await drag(page, point(0, 0), point(2, 1));
  await page.getByRole('button', { name: 'Flood fill', exact: true }).click();
  await page.mouse.click(point(3, 0).x, point(3, 0).y);
  await page.getByRole('button', { name: 'Eraser', exact: true }).click();
  await drag(page, point(0, 0), point(1, 0));
  await page.getByRole('button', { name: 'Select', exact: true }).click();
  await drag(page, point(1, 1), point(2, 2));
  await page.getByRole('button', { name: 'Copy selection', exact: true }).click();
  await page.getByRole('button', { name: 'Paste', exact: true }).click();
  await page.getByRole('button', { name: 'Cut selection', exact: true }).click();
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  await page.keyboard.press('p');
  await expect(page.getByRole('button', { name: 'Pen', exact: true })).toHaveClass(/active/);

  const firstDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save project', exact: true }).click();
  const firstPath = testInfo.outputPath('edited-project.json');
  await (await firstDownload).saveAs(firstPath);
  const saved = JSON.parse(await readFile(firstPath, 'utf8'));
  expect(saved.history.cursor).toBe(6);
  expect(saved.history.entries).toHaveLength(6);

  await page.locator('input[accept=".json,application/json"]').setInputFiles(firstPath);
  const secondDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save project', exact: true }).click();
  const secondPath = testInfo.outputPath('reopened-project.json');
  await (await secondDownload).saveAs(secondPath);
  expect(JSON.parse(await readFile(secondPath, 'utf8'))).toEqual(saved);
});

test('a 100-cell pen drag is continuous and creates one project edit', async ({ page }, testInfo) => {
  await page.getByRole('button', { name: 'Zoom out', exact: true }).click();
  await page.getByRole('button', { name: 'Zoom out', exact: true }).click();
  const { point } = await canvasGeometry(page, 16 / 1.2 / 1.2);
  await drag(page, point(0, 0), point(99, 0), 100);

  const downloadEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save project', exact: true }).click();
  const path = testInfo.outputPath('continuous-pen-project.json');
  await (await downloadEvent).saveAs(path);
  const saved = JSON.parse(await readFile(path, 'utf8'));
  expect(saved.history.entries).toHaveLength(1);
  expect(saved.history.entries[0].edit.cells).toHaveLength(100);
  expect(saved.history.entries[0].edit.cells.map((cell: { column: number }) => cell.column)).toEqual(
    Array.from({ length: 100 }, (_, index) => index),
  );
});

test('wheel zoom, drag pan, and the mobile dark canvas remain usable', async ({ page }) => {
  const shell = page.locator('.chart-canvas-shell');
  await shell.evaluate((element) => { element.scrollLeft = 600; element.scrollTop = 600; });
  const before = await shell.evaluate((element) => ({ width: element.scrollWidth, left: element.scrollLeft, top: element.scrollTop }));
  await shell.dispatchEvent('wheel', { deltaY: -100, ctrlKey: true, clientX: 300, clientY: 300 });
  await expect.poll(() => shell.evaluate((element) => element.scrollWidth)).toBeGreaterThan(before.width);

  const { canvas } = await canvasGeometry(page);
  const box = await canvas.boundingBox();
  if (!box) throw new Error('Chart canvas has no browser geometry');
  await page.keyboard.down('Alt');
  await drag(page, { x: box.x + 300, y: box.y + 220 }, { x: box.x + 240, y: box.y + 160 });
  await page.keyboard.up('Alt');
  const afterPan = await shell.evaluate((element) => ({ left: element.scrollLeft, top: element.scrollTop }));
  expect(afterPan.left).toBeGreaterThan(before.left);
  expect(afterPan.top).toBeGreaterThan(before.top);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Toggle theme', exact: true }).click();
  await expect(page.locator('.app-shell')).toHaveAttribute('data-theme', 'dark');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  await expect(page.locator('canvas.chart-canvas').first()).toBeVisible();
});

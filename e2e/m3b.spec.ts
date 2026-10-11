import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { menu } from './menu';

const fixture = 'fixtures/colorwork-chart-v1/four-color-checker.json';

async function importProject(page: Page, path = fixture) {
  await page.locator('input[accept=".json,application/json"]').setInputFiles(path);
  await expect(page.locator('.brand-copy small')).not.toContainText('Untitled colourwork');
}

async function canvasGeometry(page: Page, expectedCell?: number) {
  const canvas = page.locator('canvas.chart-canvas').first();
  const box = await canvas.boundingBox();
  if (!box) throw new Error('Chart canvas has no browser geometry');
  const cell = Number(await canvas.getAttribute('data-cell-size'));
  if (expectedCell !== undefined) expect(cell).toBeCloseTo(expectedCell, 5);
  return {
    canvas,
    point(column: number, row: number) {
      return { x: box.x + 70 + (column + 0.5) * cell, y: box.y + (row + 0.5) * cell };
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
  await page.getByRole('button', { name: 'Start with a blank chart' }).click();
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
  await menu(page, 'Edit', 'Undo');
  await menu(page, 'Edit', 'Redo');
  await page.keyboard.press('p');
  await expect(page.getByRole('button', { name: 'Pen', exact: true })).toHaveClass(/active/);

  const firstDownload = page.waitForEvent('download');
  await menu(page, 'File', 'Save project');
  const firstPath = testInfo.outputPath('edited-project.json');
  await (await firstDownload).saveAs(firstPath);
  const saved = JSON.parse(await readFile(firstPath, 'utf8'));
  expect(saved.history.cursor).toBe(6);
  expect(saved.history.entries).toHaveLength(6);

  await page.locator('input[accept=".json,application/json"]').setInputFiles(firstPath);
  const secondDownload = page.waitForEvent('download');
  await menu(page, 'File', 'Save project');
  const secondPath = testInfo.outputPath('reopened-project.json');
  await (await secondDownload).saveAs(secondPath);
  expect(JSON.parse(await readFile(secondPath, 'utf8'))).toEqual(saved);
});

test('a 100-cell pen drag is continuous and creates one project edit', async ({ page }, testInfo) => {
  // Wide enough that all 100 cells are on screen beside the design and status panels.
  await page.setViewportSize({ width: 1800, height: 900 });
  await expect.poll(async () => (await page.locator('canvas.chart-canvas').first().boundingBox())?.width ?? 0).toBeGreaterThan(900);
  await page.getByRole('button', { name: 'Zoom out', exact: true }).click();
  await page.getByRole('button', { name: 'Zoom out', exact: true }).click();
  const { point } = await canvasGeometry(page, 16 / 1.2 / 1.2);
  await drag(page, point(0, 0), point(99, 0), 100);

  const downloadEvent = page.waitForEvent('download');
  await menu(page, 'File', 'Save project');
  const path = testInfo.outputPath('continuous-pen-project.json');
  await (await downloadEvent).saveAs(path);
  const saved = JSON.parse(await readFile(path, 'utf8'));
  expect(saved.history.entries).toHaveLength(1);
  expect(saved.history.entries[0].edit.cells).toHaveLength(100);
  expect(saved.history.entries[0].edit.cells.map((cell: { column: number }) => cell.column)).toEqual(
    Array.from({ length: 100 }, (_, index) => index),
  );
});

test('draws freehand: a round brush, a circle and a mirror, each as one edit', async ({ page }, testInfo) => {
  const { point } = await canvasGeometry(page);
  await page.getByRole('button', { name: 'Use Red', exact: true }).click();
  // A 3-stitch brush, mirrored left and right: one click paints a dot on each side.
  await page.getByRole('button', { name: 'Brush size 3', exact: true }).click();
  await page.getByRole('button', { name: 'Mirror left and right', exact: true }).click();
  await page.mouse.click(point(10, 5).x, point(10, 5).y);
  // Keys: C for the circle, [ for a smaller brush; then the mirror off.
  await page.locator('canvas.chart-canvas').first().focus();
  await page.keyboard.press('c');
  await expect(page.getByRole('button', { name: 'Circle', exact: true })).toHaveClass(/active/);
  await page.keyboard.press('[');
  await page.keyboard.press('[');
  await expect(page.getByRole('button', { name: 'Brush size 1', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Mirror left and right', exact: true }).click();
  await drag(page, point(20, 10), point(28, 16));

  const download = page.waitForEvent('download');
  await menu(page, 'File', 'Save project');
  const path = testInfo.outputPath('drawn-project.json');
  await (await download).saveAs(path);
  const saved = JSON.parse(await readFile(path, 'utf8'));
  expect(saved.history.entries).toHaveLength(2);
  const [dot, circle] = saved.history.entries.map((entry: { edit: { cells: { rowId: string; column: number }[] } }) => entry.edit.cells);
  // The chart is 200 needles: column 10 reflects onto 189.
  expect([...new Set(dot.map((cell: { column: number }) => cell.column))].sort((a, b) => (a as number) - (b as number))).toEqual([9, 10, 11, 188, 189, 190]);
  expect(dot).toHaveLength(18);
  const columns = circle.map((cell: { column: number }) => cell.column);
  expect(Math.min(...columns)).toBe(20);
  expect(Math.max(...columns)).toBe(28);
  expect(new Set(circle.map((cell: { rowId: string }) => cell.rowId)).size).toBe(7);
  // An outline: the middle stays empty, and the box's corners are not on the circle.
  expect(circle.some((cell: { column: number }) => cell.column === 24)).toBe(true);
  expect(circle.length).toBeLessThan(9 * 7);
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
  await menu(page, 'View', 'Dark mode');
  await expect(page.locator('.app-shell')).toHaveAttribute('data-theme', 'dark');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  await expect(page.locator('canvas.chart-canvas').first()).toBeVisible();
});

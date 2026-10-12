import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { knitoutToKCodeWithTrace } from '../packages/machine-lib/src/knitout/kniterate/to-kcode';

const smallKnitout = [
  ';!knitout-2', ';;Machine: kniterate', ';;Carriers: 1 2 3 4 5 6',
  'x-stitch-number 6', 'x-xfer-stitch-number 5', 'x-speed-number 300', 'x-roller-advance 450',
  'in 2', 'tuck + f40 2', 'tuck + f41 2', 'knit - f41 2', 'knit - f40 2',
  'knit + f40 2', 'knit + f41 2', 'out 2', '',
].join('\n');

test('keeps the execution cursor, breakpoint, loop source, and all carrier stops linked across topology', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const sourceLines = readFileSync('packages/machine-lib/reference/fairisle.kc', 'utf8').split('\n');
  await page.goto('/');
  await page.locator('input[accept=".kc,.k,text/plain"]').setInputFiles('packages/machine-lib/reference/fairisle.kc');
  const controls = page.getByRole('region', { name: 'Execution controls' });
  // The strict import (parse, replay, scene) takes a few seconds while the whole suite runs.
  await expect(controls).toBeVisible({ timeout: 30_000 });
  await controls.getByRole('button', { name: 'Next event', exact: true }).click();
  await expect(controls).toContainText('Pass 1 · action 1 · knit');
  await expect(page.getByRole('region', { name: 'Machine state at cursor' })).toContainText('1 modeled loops');
  const carriers = page.getByLabel('Last known carrier stops');
  await expect(carriers.locator(':scope > span')).toHaveCount(6);
  for (const carrier of ['1', '2', '3', '4', '5']) await expect(carriers).toContainText(`C${carrier}Unknown`);
  await expect(carriers).toContainText('C6K');

  const breakpoint = await controls.getByRole('slider', { name: 'Execution event' }).inputValue();
  await controls.getByRole('button', { name: 'Set breakpoint', exact: true }).click();
  await page.getByTitle('Schematic topology', { exact: true }).click();
  const topology = page.getByRole('region', { name: 'Schematic loop topology preview' });
  await expect(topology).toBeVisible();
  await topology.getByRole('button', { name: /^Loop 65:/ }).click();
  await expect(topology.getByRole('region', { name: 'Selected loop lineage' })).toContainText('Creation: P2, action 1');
  await page.getByTitle('Machine passes', { exact: true }).click();
  await expect(controls).toContainText('Pass 2 · action 1 · knit');
  const lineText = await controls.getByText(/^KCode line \d+$/).innerText();
  const line = Number(lineText.match(/\d+/)![0]);
  const highlighted = page.locator('.source-dock .source-line.highlighted');
  await expect(highlighted).toHaveCount(1);
  await expect(highlighted.locator('i')).toHaveText(String(line));
  await expect(highlighted.locator('code')).toHaveText(sourceLines[line - 1]!);

  await controls.getByLabel('Breakpoints').getByRole('button', { name: `Event ${Number(breakpoint) + 1}`, exact: true }).click();
  await expect(controls.getByRole('slider', { name: 'Execution event' })).toHaveValue(breakpoint);
  await expect(controls.getByRole('button', { name: 'Remove breakpoint', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await controls.getByRole('button', { name: 'Previous event', exact: true }).click();
  await controls.getByRole('button', { name: 'Play programmed sequence', exact: true }).click();
  await expect(controls.getByRole('button', { name: 'Play programmed sequence', exact: true })).toBeVisible();
  await expect(controls.getByRole('slider', { name: 'Execution event' })).toHaveValue(breakpoint);

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(controls.getByRole('button', { name: 'Next event', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  expect(errors).toEqual([]);
});

test('shows exact emitted KCode for a Knitout event and preserves access to original source', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const converted = knitoutToKCodeWithTrace(smallKnitout, 'inspector.k');
  if (!converted.ok) throw new Error(converted.error);
  const emittedLines = converted.kcode.split('\n');
  await page.goto('/');
  await page.locator('input[accept=".kc,.k,text/plain"]').setInputFiles({ name: 'inspector.k', mimeType: 'text/plain', buffer: Buffer.from(smallKnitout) });
  await expect(page.getByLabel('Verdict: Ready to knit')).toBeVisible();
  const controls = page.getByRole('region', { name: 'Execution controls' });
  await controls.getByRole('button', { name: 'Next event', exact: true }).click();
  await expect(controls).toContainText('Pass 1 · action 1 · tuck');
  const line = Number((await controls.getByText(/^KCode line \d+$/).innerText()).match(/\d+/)![0]);
  const source = page.locator('.source-dock');
  await expect(source).toContainText('Emitted KCode');
  await expect(source.locator('.source-line.highlighted i')).toHaveText(String(line));
  await expect(source.locator('.source-line.highlighted code')).toHaveText(emittedLines[line - 1]!);
  expect(emittedLines[line - 1]).toMatch(/^FRNT:/);
  await source.getByRole('button', { name: 'Show original Knitout', exact: true }).click();
  await expect(source).not.toContainText('Emitted KCode');
  await expect(source).toContainText('tuck + f40 2');
  await expect(controls).toContainText('Pass 1 · action 1 · tuck');
  expect(errors).toEqual([]);
});

test('restores an inspection checkpoint only against identical KCode and recomputes state', async ({ page }) => {
  await page.goto('/');
  const importer = page.locator('input[accept=".kc,.k,text/plain"]');
  const fixture = 'packages/machine-lib/reference/fairisle.kc';
  await importer.setInputFiles(fixture);
  const controls = page.getByRole('region', { name: 'Execution controls' });
  await controls.getByRole('button', { name: 'Next event', exact: true }).click();
  await expect(controls).toContainText('Pass 1 · action 1 · knit');
  await controls.getByRole('button', { name: 'Set breakpoint', exact: true }).click();
  const value = await controls.getByRole('slider', { name: 'Execution event' }).inputValue();
  const download = page.waitForEvent('download');
  await controls.getByRole('button', { name: 'Save inspection', exact: true }).click();
  const file = await download;
  const checkpoint = readFileSync((await file.path())!);
  const load = () => controls.getByLabel('Inspection checkpoint file').setInputFiles({ name: 'inspection.checkpoint.json', mimeType: 'application/json', buffer: checkpoint });
  await importer.setInputFiles(fixture);
  await expect(controls).toContainText('Pass 1 · before actions');
  await load();
  await expect(controls).toContainText('Inspection restored from the exact KCode.');
  await expect(controls.getByRole('slider', { name: 'Execution event' })).toHaveValue(value);
  await expect(controls.getByRole('button', { name: 'Remove breakpoint', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('region', { name: 'Machine state at cursor' })).toContainText('1 modeled loops');
  await importer.setInputFiles({ name: 'comment-changed.kc', mimeType: 'text/plain', buffer: Buffer.concat([readFileSync(fixture), Buffer.from('\n// changed bytes\n')]) });
  await expect(controls).toContainText('Pass 1 · before actions');
  await load();
  await expect(controls).toContainText('Inspection checkpoint does not match the exact KCode bytes.');
  await expect(controls).toContainText('Pass 1 · before actions');
  await expect(controls.getByLabel('Breakpoints')).toHaveCount(0);
});

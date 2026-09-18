import { stat, writeFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

test('opens, navigates, diffs, prints, and blocks foreign machine files', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  const machineInput = page.locator('input[accept=".kc,.k,text/plain"]');
  await machineInput.setInputFiles('packages/machine-lib/reference/fairisle.kc');
  await expect(page.getByRole('dialog', { name: 'How was this KCode produced?' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Pass grid' })).toBeVisible();
  await expect(page.getByText('Surface-proven (imported)', { exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Exact machine movement' })).toBeVisible();
  await expect(page.getByText('KCode coordinates; physical needle labels unverified.')).toBeVisible();
  const selectedBefore = await page.locator('.pass-row.selected .pass-number').innerText();
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('.pass-row.selected .pass-number')).not.toHaveText(selectedBefore);

  await page.getByRole('button', { name: 'Open run sheet', exact: true }).click();
  await expect(page.locator('.run-sheet')).toContainText('fairisle.kc');
  if (testInfo.project.name === 'chromium') {
    const pdfPath = testInfo.outputPath('foreign-run-sheet.pdf');
    await page.pdf({ path: pdfPath, printBackground: true });
    expect((await stat(pdfPath)).size).toBeGreaterThan(5_000);
  }
  await page.getByRole('button', { name: /Close/ }).click();

  await page.getByTitle('Pass diff').click();
  await page.locator('input[accept=".kc,text/plain"]').setInputFiles('packages/machine-lib/reference/fairisle.kc');
  await expect(page.getByText('Machine-trace identical', { exact: true })).toBeVisible();

  const refusal = testInfo.outputPath('refusal.k');
  await writeFile(refusal, [';!knitout-2', ';;Machine: kniterate', ';;Carriers: 7', 'in 7', 'knit + f40 7', ''].join('\n'));
  await machineInput.setInputFiles(refusal);
  await expect(page.getByText('Blocked', { exact: true })).toBeVisible();
  await expect(page.getByText('Invalid carrier ID', { exact: true }).first()).toBeVisible();
  expect(errors).toEqual([]);
});

test('opens the two 150k-selection corpus files without overflow or page errors', async ({ page }, testInfo) => {
  test.setTimeout(60_000);
  const errors: string[] = [];
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(() => {
    const audit = { maximumGapMs: 0, liveWorkers: 0, imported: 0, terminated: 0, timer: 0 };
    (window as unknown as { inspectionAudit: typeof audit }).inspectionAudit = audit;
    const NativeWorker = window.Worker;
    window.Worker = class extends NativeWorker {
      private closed = false;
      private imported = false;
      postMessage(message: unknown, options?: Transferable[] | StructuredSerializeOptions) {
        if (!this.imported && (message as { kind?: string })?.kind === 'open') {
          this.imported = true; audit.liveWorkers++; audit.imported++;
        }
        if (Array.isArray(options)) super.postMessage(message, options);
        else super.postMessage(message, options);
      }
      terminate() {
        if (!this.closed && this.imported) { this.closed = true; audit.liveWorkers--; audit.terminated++; }
        super.terminate();
      }
    };
    let last = performance.now();
    audit.timer = window.setInterval(() => {
      const now = performance.now(); audit.maximumGapMs = Math.max(audit.maximumGapMs, now - last); last = now;
    }, 50);
  });
  await page.goto('/');
  const machineInput = page.locator('input[accept=".kc,.k,text/plain"]');

  await machineInput.setInputFiles('packages/machine-lib/reference/back.kc');
  // Imports now yield to the browser while compiling in a Worker. Allow the
  // unoptimized development build bounded compilation time for these fixtures.
  await expect(page.locator('.brand-copy small')).toHaveText('back.kc', { timeout: 30_000 });
  await expect(page.getByRole('heading', { name: 'Pass grid' })).toBeVisible();
  await expect(page.locator('.stat-strip')).toContainText('2,108');
  await expect(page.locator('.diagnostics-panel')).toContainText('0 errors · 0 warnings · 82 notes');

  await machineInput.setInputFiles('packages/machine-lib/reference/front.kc');
  await expect(page.locator('.brand-copy small')).toHaveText('front.kc', { timeout: 30_000 });
  await expect(page.locator('.stat-strip')).toContainText('2,544');
  await expect(page.locator('.diagnostics-panel')).toContainText('0 errors · 0 warnings · 64 notes');
  const audit = await page.evaluate(() => {
    const value = (window as unknown as { inspectionAudit: { maximumGapMs: number; liveWorkers: number; imported: number; terminated: number; timer: number } }).inspectionAudit;
    window.clearInterval(value.timer); return value;
  });
  // A transport regression previously stalled this heartbeat for over 13 seconds.
  // This is a generous responsiveness bound, independent of worker compilation time.
  await testInfo.attach('import-responsiveness', { body: JSON.stringify(audit), contentType: 'application/json' });
  expect(audit.maximumGapMs).toBeLessThan(2000);
  expect(audit.imported).toBe(2);
  expect(audit.terminated).toBe(1);
  expect(audit.liveWorkers).toBe(1);
  expect(errors).toEqual([]);
});

import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { encodePng } from '../scripts/lib/png';

/** A dark ring on a light ground with a margin: an image with a thin motif. */
function ringPng(): Buffer {
  const width = 60; const height = 46;
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    const inside = x >= 6 && x < 54 && y >= 6 && y < 40 && (x < 12 || x >= 48 || y < 12 || y >= 34);
    data.set(inside ? [20, 20, 20, 255] : [245, 245, 245, 255], (y * width + x) * 4);
  }
  return Buffer.from(encodePng({ width, height, data }));
}

async function createBeanie(page: Page) {
  await page.goto('/?theme=light');
  await page.getByRole('button', { name: 'New project' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'New project' });
  await dialog.getByRole('tab', { name: 'Beanie' }).click();
  await dialog.getByLabel('Project name').fill('Ring toque');
  await dialog.getByRole('button', { name: 'Create beanie' }).click();
  await expect(page.getByTestId('readiness-headline')).toHaveText('Fit needs measurements', { timeout: 30_000 });
}

async function placeImage(page: Page, heightCm: string) {
  await page.getByRole('button', { name: 'Add image' }).click();
  const intake = page.getByRole('dialog', { name: 'Place an image' });
  await intake.getByLabel('Image file').setInputFiles({ name: 'ring.png', mimeType: 'image/png', buffer: ringPng() });
  await intake.getByLabel('Visible height (cm)').fill(heightCm);
  await expect(intake.getByText(/stitches · background left out/)).toBeVisible();
  await intake.getByRole('button', { name: 'Place' }).click();
  await expect(intake).toBeHidden();
}

const derived = (page: Page, text: RegExp) => page.locator('.garment-derived').filter({ hasText: text });

test('a beanie is edited as a garment: fit, motifs, readiness, package and measurements', async ({ page }) => {
  test.setTimeout(180_000);
  await createBeanie(page);
  await expect(page.getByTestId('readiness-evidence')).toHaveText('Software checks passed · Surface-proven · physical knit pending');
  await expect(derived(page, /^134 needles · ≈50.8 cm finished around$/)).toBeVisible();

  // Motifs are objects: placed and listed.
  await placeImage(page, '6');
  await expect(page.getByRole('button', { name: /^motif-1/ })).toBeVisible();

  // An out-of-range value is shown as not applied, and the design is unchanged.
  const headField = page.locator('#fit\\.head');
  await headField.fill('100'); await headField.press('Enter');
  await expect(page.getByRole('alert').filter({ hasText: 'Not applied: enter 30–80 cm' })).toBeVisible();
  await expect(derived(page, /^134 needles/)).toBeVisible();
  await page.getByRole('button', { name: 'Restore' }).click();

  // "Leave the ground" for the motif's color keeps it placed (nothing drawn), never "does not fit".
  await page.getByLabel('Image color 1').selectOption({ label: 'Leave the ground' });
  await expect(page.getByRole('button', { name: /^motif-1 \d+ × \d+ st/ })).toBeVisible({ timeout: 30_000 });
  await page.getByLabel('Image color 1').selectOption({ label: 'White' });

  // A fit change is one operation; one undo restores it.
  const head = page.locator('#fit\\.head');
  await head.fill('52'); await head.press('Enter');
  await expect(derived(page, /^122 needles/)).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(derived(page, /^134 needles/)).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Redo' }).click();
  await expect(derived(page, /^122 needles/)).toBeVisible({ timeout: 30_000 });

  // A stitch-gauge change marks the motif stale; refresh re-converts it.
  await page.getByLabel(/^Body .* stitches per 10 cm$/).fill('30');
  await page.getByLabel(/^Body .* rows per 10 cm$/).focus();
  await page.getByLabel(/^Body .* rows per 10 cm$/).fill('34');
  await page.getByLabel(/^Body .* rows per 10 cm$/).blur();
  await expect(page.getByText('needs refresh')).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: /^motif-1/ }).click();
  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  await expect(page.getByText('needs refresh')).toHaveCount(0, { timeout: 30_000 });

  // A second motif gets its own id; removing the first and adding again never replaces the second.
  await placeImage(page, '3');
  await page.getByRole('button', { name: /^motif-1/ }).click();
  await page.getByRole('button', { name: 'Remove', exact: true }).click();
  await placeImage(page, '3');
  await expect(page.getByRole('button', { name: /^motif-2/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /^motif-3/ })).toBeVisible();

  // Too large: a visible conflict that blocks export, recovered by resizing the motif.
  await page.getByRole('button', { name: /^motif-3/ }).click();
  const height = page.locator('.motif-inspector input[type="number"]').first();
  await height.fill('40'); await height.press('Enter');
  await expect(page.getByRole('button', { name: /^motif-3.*Does not fit/ })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('button', { name: 'Export package' })).toBeDisabled({ timeout: 30_000 });
  const again = page.locator('.motif-inspector input[type="number"]').first();
  await again.fill('3'); await again.press('Enter');
  await expect(page.getByRole('button', { name: /^motif-3 \d+ × \d+ st/ })).toBeVisible({ timeout: 30_000 });

  // Measured gauges make it ready.
  await page.getByLabel(/^Body .* source$/).selectOption('measured');
  await page.getByLabel('Cuff (2x2 rib) source').selectOption('measured');
  await expect(page.getByTestId('readiness-headline')).toHaveText('Ready to knit', { timeout: 30_000 });

  // The package carries the project, the exact program and the measurement form.
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export package' }).click();
  const zip = readFileSync(await (await download).path()!);
  for (const name of ['project.kniterate-studio.json', 'program.kc', 'instructions.md', 'schematic.svg', 'measurement-form.md', 'measurements.json', 'manifest.json', 'chart.png']) expect(zip.includes(Buffer.from(name))).toBe(true);

  // Synthetic measurements revise the candidate in one labelled operation.
  await page.getByRole('button', { name: 'Record measurements' }).click();
  const measure = page.getByRole('dialog', { name: 'Record measurements' });
  await measure.getByLabel('Synthetic: made up to test the software').check();
  await measure.getByLabel('Outcome').selectOption('clean');
  await measure.locator('fieldset', { hasText: 'Body gauge' }).getByLabel('Stitches').fill('24');
  await measure.locator('fieldset', { hasText: 'Body gauge' }).getByLabel('Rows').fill('30');
  await expect(measure.getByText(/Body gauge 30\/34 \(measured\) → 24\/30 \(synthetic, counted as assumed\)/)).toBeVisible();
  await measure.getByRole('button', { name: 'Record and revise' }).click();
  await expect(page.getByText(/SYNTHETIC · clean/)).toBeVisible();
  // Synthetic values never satisfy the real-measurement requirement, and readiness says why.
  await expect(page.getByTestId('readiness-headline')).toHaveText('Fit needs measurements', { timeout: 30_000 });
  await expect(page.getByRole('note').filter({ hasText: 'SYNTHETIC' })).toBeVisible();

  // The changes panel lists the operations, newest first.
  await page.getByRole('button', { name: 'Changes' }).click();
  await expect(page.getByRole('complementary', { name: 'Changes' }).getByText(/Record SYNTHETIC measurements/)).toBeVisible();

  // The schematic explains the finished object.
  await page.getByRole('tab', { name: 'Schematic' }).click();
  await expect(page.getByTestId('schematic')).toBeVisible();
});

/** White ground with a black block and a red block: three image colors. */
function twoShapesPng(): Buffer {
  const width = 40; const height = 20;
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    data.set(x >= 4 && x < 16 && y >= 4 && y < 16 ? [0, 0, 0, 255] : x >= 24 && x < 36 && y >= 4 && y < 16 ? [220, 0, 0, 255] : [255, 255, 255, 255], (y * width + x) * 4);
  }
  return Buffer.from(encodePng({ width, height, data }));
}

test('edits made while a motif refresh is decoding are never lost, and colors are never dropped silently', async ({ page }) => {
  test.setTimeout(120_000);
  // Let the test hold image decoding, as a slow device would.
  await page.addInitScript(() => {
    const original = window.createImageBitmap.bind(window);
    (window as unknown as { createImageBitmap: unknown }).createImageBitmap = async (...args: Parameters<typeof createImageBitmap>) => {
      const delay = (window as unknown as { __decodeDelay?: number }).__decodeDelay ?? 0;
      if (delay) await new Promise((done) => setTimeout(done, delay));
      return original(...args);
    };
  });
  await createBeanie(page);
  await placeImage(page, '6');
  await page.evaluate(() => { (window as unknown as { __decodeDelay: number }).__decodeDelay = 1500; });
  await page.getByRole('button', { name: /^motif-1/ }).click();
  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  await page.getByRole('button', { name: 'Remove', exact: true }).click();
  await page.waitForTimeout(2500);
  await expect(page.getByRole('button', { name: /^motif-1/ })).toHaveCount(0);
  await page.getByRole('button', { name: 'Changes' }).click();
  await expect(page.getByRole('complementary', { name: 'Changes' }).getByText('Remove motif-1')).toBeVisible();
  await page.getByRole('button', { name: 'Close changes' }).click();
  await page.evaluate(() => { (window as unknown as { __decodeDelay: number }).__decodeDelay = 0; });

  // Three image colors on a two-yarn hat: placing waits for a decision on the unmatched color.
  await page.getByRole('button', { name: 'Add image' }).click();
  const intake = page.getByRole('dialog', { name: 'Place an image' });
  await intake.getByLabel('Image file').setInputFiles({ name: 'two-shapes.png', mimeType: 'image/png', buffer: twoShapesPng() });
  await intake.getByLabel('Visible height (cm)').fill('4');
  await intake.getByLabel('Colors').selectOption('3');
  await expect(intake.getByRole('alert').filter({ hasText: /Image color 2 \(\d+ stitches\) has no matching yarn/ })).toBeVisible();
  await expect(intake.getByRole('button', { name: 'Place' })).toBeDisabled();
  await intake.getByLabel('Image color 2').selectOption({ label: 'Black' });
  await expect(intake.getByRole('button', { name: 'Place' })).toBeEnabled();
  await intake.getByRole('button', { name: 'Place' }).click();
  await expect(page.getByRole('button', { name: /^motif-\d+ \d+ × \d+ st/ })).toBeVisible();
});

test('a loaded form keeps its predictions only for its own candidate, and fit drafts do not leak between projects', async ({ page }) => {
  test.setTimeout(120_000);
  await createBeanie(page);
  // An invalid draft in this project...
  const head = page.locator('#fit\\.head');
  await head.fill('100'); await head.press('Enter');
  await expect(page.getByRole('alert').filter({ hasText: 'Not applied' })).toBeVisible();
  // ...does not survive opening another project.
  await page.getByRole('button', { name: 'New project' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'New project' });
  await dialog.getByRole('tab', { name: 'Beanie' }).click();
  await dialog.getByLabel('Head circumference (cm)').fill('60');
  await dialog.getByRole('button', { name: 'Create beanie' }).click();
  await expect(page.locator('#fit\\.head')).toHaveValue('60', { timeout: 30_000 });
  await expect(page.getByRole('alert').filter({ hasText: 'Not applied' })).toHaveCount(0);

  await page.getByRole('button', { name: 'Record measurements' }).click();
  const measure = page.getByRole('dialog', { name: 'Record measurements' });
  const form = { kind: 'kniterate-studio-measurements', schemaVersion: 1, candidate: { kcodeSha256: 'a'.repeat(64), label: 'Other', predictedCm: { circumference: 50, cuffVisible: 7, body: 25.9, crown: 9, total: 42 } }, synthetic: true, outcome: 'clean', bodyGauge: { stitchesPer10cm: null, rowsPer10cm: null }, ribGauge: { stitchesPer10cm: null, rowsPer10cm: null }, finishedCm: { circumference: null, cuffVisible: null, body: 12.9, crown: null, total: null }, notes: '' };
  await measure.getByLabel('Load measurements.json').setInputFiles({ name: 'measurements.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(form)) });
  await expect(measure.getByText(/Predictions from the loaded form for candidate aaaaaaaaaaaa/)).toBeVisible();
  await expect(measure.getByText('Compared with what the knitted candidate predicted (from its form).')).toBeVisible();
  await measure.getByLabel(/Candidate \(KCode SHA-256/).fill('b'.repeat(64));
  await expect(measure.getByText(/Predictions from the loaded form/)).toHaveCount(0);
  await expect(measure.getByText(/predictions are not known here/)).toBeVisible();
});

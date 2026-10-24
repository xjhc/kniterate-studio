import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { menu } from './menu';
import { materializeColorworkProject, type ColorworkProjectV1 } from '../packages/project-contract/src/index';
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
  await page.getByRole('button', { name: /^Beanie/ }).click();
  const dialog = page.getByRole('dialog', { name: 'New project' });
  await expect(dialog.getByRole('tab', { name: 'Beanie' })).toHaveAttribute('aria-selected', 'true');
  await dialog.getByLabel('Project name').fill('Ring toque');
  await dialog.getByRole('button', { name: 'Create beanie' }).click();
  await expect(page.getByTestId('readiness-headline')).toHaveText('Ready to knit, sizes not confirmed', { timeout: 30_000 });
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

/** The Head row of the size table: the knitted circumference, and the needles it takes. */
const headRow = (page: Page) => page.getByRole('group', { name: 'Finished measurements' }).locator('.measure-row').filter({ hasText: /^Head/ });
const needles = (page: Page, count: number) => headRow(page).locator('.count').filter({ hasText: new RegExp(`^${count} st$`) });

test('the whole hat is drawn as worn, flat: the motif on the front and the seam at the back; clicking it opens the chart', async ({ page }) => {
  test.setTimeout(120_000);
  await createBeanie(page);
  await placeImage(page, '6');
  const pieces = page.getByRole('navigation', { name: 'Pieces' });
  await pieces.getByRole('button', { name: 'Whole hat' }).click();
  const front = page.getByRole('img', { name: 'The hat as worn, from the front' });
  await expect(front).toBeVisible();
  // The ring is centred, so it faces front: its colour is drawn there.
  await expect(front.locator('rect[fill="#F2F2F2"]').first()).toBeAttached();
  await page.getByRole('tab', { name: 'Back' }).click();
  await expect(page.getByRole('img', { name: 'The hat as worn, from the back' }).locator('.beanie-seam')).toBeAttached();
  await page.getByRole('button', { name: 'Open the chart' }).click();
  await expect(pieces.getByRole('button', { name: 'Beanie' })).toHaveClass(/active/);
  await expect(page.locator('.chart-toolbar')).toBeVisible();
});

test('a measured gauge belongs to its backing: another keeps the numbers, not as measured', async ({ page }) => {
  test.setTimeout(120_000);
  await createBeanie(page);
  // A new hat's body is one yarn: a double layer, or a single one.
  await page.getByLabel('Body (double-layer fabric) measured').check();
  await page.locator('#backing').getByRole('button', { name: /^Single layer/ }).click();
  await expect(page.getByLabel('Body (single-layer fabric) measured')).not.toBeChecked();
  await expect(page.getByLabel('Body (single-layer fabric) stitches per 10 cm')).toHaveValue('26');
  await expect(page.locator('#swatch')).toContainText('Measured on double-layer fabric. Measure a swatch of single-layer fabric for true sizes.');
  await page.locator('#backing').getByRole('button', { name: /^Double layer/ }).click();
  await expect(page.getByLabel('Body (double-layer fabric) measured')).toBeChecked();
});

test('the waste yarn at the start is your own: shorter knits fewer passes, and one too short for the rollers is refused', async ({ page }) => {
  test.setTimeout(120_000);
  await createBeanie(page);
  const file = page.locator('.status-pieces .piece-facts');
  await expect(file).toContainText(/\d+ passes/, { timeout: 30_000 });
  // While the file is rewritten it has no pass count yet: wait for it.
  const passes = async () => { const found = /([\d,]+) passes/.exec((await file.textContent()) ?? ''); return found ? Number(found[1]!.replace(/,/g, '')) : null; };
  const standard = await passes();
  await page.getByRole('button', { name: /^Machine settings/ }).click();
  const machine = page.locator('#machine');
  await expect(machine).toContainText('Standard: 81 rows');
  await machine.getByLabel('Waste yarn rows').fill('71');
  await machine.getByLabel('Waste yarn rows').press('Enter');
  await expect.poll(passes, { timeout: 30_000 }).toBe(standard - 10);
  // Below 70 the rollers may not grip the fabric: the input never applies it.
  await machine.getByLabel('Waste yarn rows').fill('41');
  await machine.getByLabel('Waste yarn rows').press('Enter');
  await expect(machine.getByLabel('Waste yarn rows')).toHaveValue('71');
  await expect.poll(passes, { timeout: 30_000 }).toBe(standard - 10);
  await machine.getByRole('button', { name: 'Use the standard 81' }).click();
  await expect.poll(passes, { timeout: 30_000 }).toBe(standard);
});

test('long floats are one thing to check, however many there are', async ({ page }) => {
  test.setTimeout(120_000);
  await createBeanie(page);
  // The ring's empty middle, on a fairisle back, floats the yarn behind it on many rows.
  await placeImage(page, '6');
  await page.locator('#backing').getByRole('button', { name: /^Fairisle/ }).click();
  await expect(page.locator('#backing .section-aside')).toHaveText('Fairisle', { timeout: 30_000 });
  await expect(page.locator('.status-notes:not(.operator) > li').filter({ hasText: 'Body colourwork' })).toHaveCount(1, { timeout: 30_000 });
  await expect(page.getByTestId('readiness-headline')).toHaveText(/^[12] things? to check$/);
});

test('the status panel walks the steps: the swatch is next, then the download, each ticked when done', async ({ page }) => {
  test.setTimeout(120_000);
  await createBeanie(page);
  const steps = page.getByRole('list', { name: 'Steps' });
  const next = steps.locator('[aria-current="step"] > .step-body > h3');
  await expect(next).toHaveText('Measure a swatch');
  // The swatch is its own checked machine file, in the hat's yarns, backing and gauge.
  const swatch = page.waitForEvent('download');
  await steps.getByRole('button', { name: 'Download swatch file' }).click();
  expect((await swatch).suggestedFilename()).toMatch(/-swatch\.kc$/);
  await steps.getByRole('button', { name: 'Enter your swatch' }).click();
  await expect(page.getByLabel(/^Body \(.+ fabric\) stitches per 10 cm$/)).toBeFocused();
  // Measured gauges tick the swatch step; the download is next until this design is downloaded.
  await page.getByLabel(/^Body \(.+ fabric\) measured$/).check();
  await page.getByLabel('Cuff (2x2 rib) measured').check();
  await expect(next).toHaveText('Download', { timeout: 30_000 });
  const download = page.waitForEvent('download');
  await steps.getByRole('button', { name: 'Download knitting package' }).click();
  await download;
  // The steps end with the download: nothing is left to do but knit it.
  await expect(steps.locator('.step-done h3', { hasText: 'Download' })).toBeVisible();
  await expect(steps.locator('[aria-current="step"]')).toHaveCount(0);
  await expect(steps.locator('h3', { hasText: /^Knit/ })).toHaveCount(0);
});

test('a one-yarn beanie is one layer or two; adding a colour and painting it makes it colourwork', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/?theme=light');
  await page.getByRole('button', { name: /^Beanie/ }).click();
  const dialog = page.getByRole('dialog', { name: 'New project' });
  await dialog.getByRole('button', { name: 'Remove' }).click();
  // With one yarn the body is one layer or two.
  await expect(dialog.getByRole('group', { name: 'Body fabric' })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Double layer' })).toHaveAttribute('aria-pressed', 'true');
  await dialog.getByRole('button', { name: 'Create beanie' }).click();
  await expect(page.getByTestId('readiness-headline')).toHaveText('Ready to knit, sizes not confirmed', { timeout: 30_000 });
  const backing = page.locator('#backing .section-aside');
  await expect(backing).toHaveText('Double layer');

  // A second colour, with its own yarn, then a stroke of it in the body.
  await page.getByRole('button', { name: 'Add a colour' }).click();
  await page.getByLabel('New colour name').fill('Snow');
  await page.getByRole('form', { name: 'New colour' }).getByRole('button', { name: 'Add' }).click();
  await expect(page.getByRole('button', { name: 'Use Snow' })).toHaveClass(/active/);
  await expect(page.getByRole('combobox', { name: 'Snow carrier' })).toHaveValue('4');
  await page.getByRole('button', { name: 'Brush size 5', exact: true }).click();
  const canvas = page.locator('canvas.chart-canvas').first();
  const cell = Number(await canvas.getAttribute('data-cell-size'));
  const rowH = Number(await canvas.getAttribute('data-row-size'));
  const box = (await canvas.boundingBox())!;
  // The body's first rows sit just below the crown (30 rows at this size).
  const y = box.y + 32 * rowH;
  await page.mouse.move(box.x + 70 + 20 * cell, y);
  await page.mouse.down();
  await page.mouse.move(box.x + 70 + 60 * cell, y, { steps: 8 });
  await page.mouse.up();
  await expect(backing).toHaveText('Birdseye', { timeout: 30_000 });
  await expect(page.getByTestId('readiness-headline')).toHaveText('Ready to knit, sizes not confirmed', { timeout: 30_000 });
});

test('a beanie is edited as a garment: fit, motifs, readiness, package and measurements', async ({ page }) => {
  test.setTimeout(180_000);
  await createBeanie(page);
  await expect(page.getByLabel('Verdict: Ready to knit')).toBeVisible();
  await expect(needles(page, 134)).toBeVisible();
  await expect(headRow(page).locator('.knitted').first()).toHaveText('50.8');

  // Motifs are objects: placed and listed.
  await placeImage(page, '6');
  await expect(page.getByRole('button', { name: /^motif-1/ })).toBeVisible();

  // An out-of-range value is shown as not applied, and the design is unchanged.
  const headField = page.locator('#fit\\.head');
  await headField.fill('100'); await headField.press('Enter');
  await expect(page.getByRole('alert').filter({ hasText: 'Not applied: enter 30–80 cm' })).toBeVisible();
  await expect(needles(page, 134)).toBeVisible();
  await page.getByRole('button', { name: 'Restore' }).click();

  // "Leave the ground" for the motif's color keeps it placed (nothing drawn), never "does not fit".
  await page.getByLabel('Image colour 1').selectOption({ label: 'Leave the ground' });
  await expect(page.getByRole('button', { name: /^motif-1 \d+ × \d+ st/ })).toBeVisible({ timeout: 30_000 });
  await page.getByLabel('Image colour 1').selectOption({ label: 'White' });

  // A fit change is one operation; one undo restores it.
  const head = page.locator('#fit\\.head');
  await head.fill('52'); await head.press('Enter');
  await expect(needles(page, 122)).toBeVisible({ timeout: 30_000 });
  await menu(page, 'Edit', 'Undo');
  await expect(needles(page, 134)).toBeVisible({ timeout: 30_000 });
  await menu(page, 'Edit', 'Redo');
  await expect(needles(page, 122)).toBeVisible({ timeout: 30_000 });

  // Your swatch's gauge resizes the whole hat and its motif in one change.
  const motifSize = await page.getByRole('button', { name: /^motif-1/ }).innerText();
  await page.getByLabel(/^Body .* stitches per 10 cm$/).fill('30');
  await page.getByLabel(/^Body .* rows per 10 cm$/).focus();
  await page.getByLabel(/^Body .* rows per 10 cm$/).fill('34');
  await page.getByLabel(/^Body .* rows per 10 cm$/).blur();
  await expect(page.getByRole('status').filter({ hasText: /^Resized: 122 → \d+ needles/ })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('button', { name: /^motif-1/ })).not.toHaveText(motifSize, { timeout: 30_000 });
  await expect(page.getByText('needs refresh')).toHaveCount(0);

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
  await expect(page.getByRole('button', { name: 'Download knitting package' })).toBeDisabled({ timeout: 30_000 });
  const again = page.locator('.motif-inspector input[type="number"]').first();
  await again.fill('3'); await again.press('Enter');
  await expect(page.getByRole('button', { name: /^motif-3 \d+ × \d+ st/ })).toBeVisible({ timeout: 30_000 });

  // Measured gauges make it ready.
  await page.getByLabel(/^Body .* measured$/).check();
  await page.getByLabel('Cuff (2x2 rib) measured').check();
  await expect(page.getByTestId('readiness-headline')).toHaveText('Ready to knit', { timeout: 30_000 });

  // The package carries the project, the exact program and the measurement form.
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download knitting package' }).click();
  const zip = readFileSync(await (await download).path()!);
  for (const name of ['project.kniterate-studio.json', 'program.kc', 'instructions.md', 'schematic.svg', 'measurement-form.md', 'measurements.json', 'manifest.json', 'chart.png']) expect(zip.includes(Buffer.from(name))).toBe(true);

  // Synthetic measurements revise the candidate in one labelled operation.
  await menu(page, 'File', 'Record a finished hat…');
  const measure = page.getByRole('dialog', { name: 'Record a finished hat' });
  await measure.getByLabel('Synthetic: made up to test the software').check();
  await measure.getByLabel('Outcome').selectOption('clean');
  await measure.locator('fieldset', { hasText: 'Body gauge' }).getByLabel('Stitches').fill('24');
  await measure.locator('fieldset', { hasText: 'Body gauge' }).getByLabel('Rows').fill('30');
  await expect(measure.getByText(/Body gauge 30\/34 \(measured\) → 24\/30 \(synthetic, counted as assumed\)/)).toBeVisible();
  await measure.getByRole('button', { name: 'Record and revise' }).click();
  await expect(measure).toBeHidden();
  // The form lists the hats recorded before.
  await menu(page, 'File', 'Record a finished hat…');
  await expect(measure.getByRole('list', { name: 'Recorded hats' })).toContainText(/clean .*\(test data\)/);
  await measure.getByRole('button', { name: 'Cancel' }).click();
  // Synthetic values never satisfy the real-measurement requirement, and readiness says why.
  await expect(page.getByTestId('readiness-headline')).toHaveText('Ready to knit, sizes not confirmed', { timeout: 30_000 });
  await expect(page.getByRole('note').filter({ hasText: 'test data' })).toBeVisible();

  // The changes panel lists the operations, newest first.
  await menu(page, 'View', 'History');
  await expect(page.getByRole('complementary', { name: 'Changes' }).getByText('Enter test-data measurements')).toBeVisible();

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

/** A small red detail appears only when mode sampling has enough stitches. */
function refreshColorsPng(): Buffer {
  const width = 40; const height = 40;
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    const color = x >= 10 && x < 30 && y >= 10 && y < 30
      ? x >= 18 && x < 22 && y >= 18 && y < 22 ? [255, 0, 0, 255] : [0, 0, 0, 255]
      : [255, 255, 255, 255];
    data.set(color, (y * width + x) * 4);
  }
  return Buffer.from(encodePng({ width, height, data }));
}

test('refreshing a motif reviews newly visible colors before changing its source or history', async ({ page }) => {
  test.setTimeout(120_000);
  const savedProject = async (): Promise<ColorworkProjectV1> => {
    const download = page.waitForEvent('download');
    await menu(page, 'File', 'Save project');
    return JSON.parse(readFileSync((await (await download).path())!, 'utf8'));
  };
  const placementOf = (project: ColorworkProjectV1) => materializeColorworkProject(project).state.placements![0];
  const setBodyGauge = async (value: string) => {
    await page.getByLabel(/^Body .* stitches per 10 cm$/).fill(value);
    const rows = page.getByLabel(/^Body .* rows per 10 cm$/);
    await rows.focus(); await rows.fill(value); await rows.blur();
  };
  await createBeanie(page);
  await setBodyGauge('30');
  await expect(needles(page, 154)).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Add image' }).click();
  const intake = page.getByRole('dialog', { name: 'Place an image' });
  await intake.getByLabel('Image file').setInputFiles({ name: 'refresh-colors.png', mimeType: 'image/png', buffer: refreshColorsPng() });
  await intake.getByLabel('Visible height (cm)').fill('4');
  await intake.getByLabel('Colours').selectOption('3');
  await intake.getByLabel('Sampling').selectOption('mode');
  await expect(intake.getByRole('button', { name: 'Place', exact: true })).toBeEnabled();
  await intake.getByRole('button', { name: 'Place', exact: true }).click();
  await expect(intake).toBeHidden();
  const original = placementOf(await savedProject());
  expect(new Set(original.motif.cells.flat())).toEqual(new Set([1]));
  expect(original.source?.gauge).toEqual({ stitchesPer10cm: 30, rowsPer10cm: 30 });

  await setBodyGauge('40');
  await expect(needles(page, 202)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('needs refresh')).toBeVisible();
  await page.getByRole('button', { name: /^motif-1/ }).click();
  const beforeRefresh = await savedProject();
  const review = page.getByRole('dialog', { name: 'Review colours for motif-1' });
  const openReview = async () => {
    await page.getByRole('button', { name: 'Refresh', exact: true }).click();
    // The saved PNG is loaded automatically; no replacement file is supplied.
    await expect(review.getByRole('img', { name: 'The supplied image' })).toBeVisible();
    await expect(review.getByRole('alert').filter({ hasText: 'Image colour 2 (9 stitches) has no matching yarn' })).toBeVisible();
    await expect(review.getByRole('button', { name: 'Apply refresh' })).toBeDisabled();
  };
  await openReview();
  await review.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(review).toBeHidden();
  expect(await savedProject()).toEqual(beforeRefresh);
  await expect(page.getByText('needs refresh')).toBeVisible();

  await openReview();
  await review.getByLabel('Image colour 2').selectOption({ label: 'White' });
  await expect(review.getByRole('button', { name: 'Apply refresh' })).toBeEnabled();
  await review.getByRole('button', { name: 'Apply refresh' }).click();
  await expect(review).toBeHidden();
  await expect(page.getByText('needs refresh')).toHaveCount(0, { timeout: 30_000 });
  const refreshed = await savedProject();
  const placement = placementOf(refreshed);
  expect(placement.motif.cells.flat().filter((color) => color === 2)).toHaveLength(9);
  expect(placement.colors).toEqual({ ...original.colors, '2': 'accent' });
  expect(placement.source).toEqual({ ...original.source, gauge: { stitchesPer10cm: 40, rowsPer10cm: 40 } });
  expect(refreshed.history.cursor).toBe(beforeRefresh.history.cursor + 1);

  await menu(page, 'Edit', 'Undo');
  await expect(page.getByText('needs refresh')).toBeVisible();
  const undone = await savedProject();
  expect(placementOf(undone)).toEqual(original);
  expect(materializeColorworkProject(undone).state.gauge).toMatchObject({ stitchesPer10cm: 40, rowsPer10cm: 40 });
  expect(undone.history.cursor).toBe(beforeRefresh.history.cursor);
});

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
  await menu(page, 'View', 'History');
  await expect(page.getByRole('complementary', { name: 'Changes' }).getByText('Remove motif-1')).toBeVisible();
  await page.getByRole('button', { name: 'Close changes' }).click();
  await page.evaluate(() => { (window as unknown as { __decodeDelay: number }).__decodeDelay = 0; });

  // Three image colors on a two-yarn hat: placing waits for a decision on the unmatched color.
  await page.getByRole('button', { name: 'Add image' }).click();
  const intake = page.getByRole('dialog', { name: 'Place an image' });
  await intake.getByLabel('Image file').setInputFiles({ name: 'two-shapes.png', mimeType: 'image/png', buffer: twoShapesPng() });
  await intake.getByLabel('Visible height (cm)').fill('4');
  await intake.getByLabel('Colours').selectOption('3');
  await expect(intake.getByRole('alert').filter({ hasText: /Image colour 2 \(\d+ stitches\) has no matching yarn/ })).toBeVisible();
  await expect(intake.getByRole('button', { name: 'Place' })).toBeDisabled();
  await intake.getByLabel('Image colour 2').selectOption({ label: 'Black' });
  await expect(intake.getByRole('button', { name: 'Place' })).toBeEnabled();
  await intake.getByRole('button', { name: 'Place' }).click();
  await expect(page.getByRole('button', { name: /^motif-\d+ \d+ × \d+ st/ })).toBeVisible();
});

for (const sameId of [false, true]) {
  test(`a pending motif resize is cancelled when opening ${sameId ? 'the same project again' : 'another project with an identical motif'}`, async ({ page }) => {
    test.setTimeout(120_000);
    // Hold one real bitmap decode until after another file is open.
    await page.addInitScript(() => {
      const control = window as unknown as { __holdDecode?: boolean; __releaseDecode?: () => Promise<void> };
      const original = window.createImageBitmap.bind(window);
      (window as unknown as { createImageBitmap: unknown }).createImageBitmap = (...args: Parameters<typeof createImageBitmap>) => control.__holdDecode
        ? new Promise<ImageBitmap>((resolve, reject) => {
            control.__releaseDecode = async () => {
              control.__holdDecode = false;
              try { resolve(await original(...args)); } catch (error) { reject(error); }
            };
          })
        : original(...args);
    });
    const savedProject = async () => {
      const download = page.waitForEvent('download');
      await menu(page, 'File', 'Save project');
      return JSON.parse(readFileSync((await (await download).path())!, 'utf8'));
    };

    await createBeanie(page);
    await placeImage(page, '4');
    const saved = await savedProject();
    const reopened = { ...saved, id: sameId ? saved.id : `${saved.id}-other`, title: sameId ? 'Reopened ring toque' : 'Other ring toque' };

    await page.evaluate(() => { (window as unknown as { __holdDecode: boolean }).__holdDecode = true; });
    const height = page.getByRole('spinbutton', { name: 'Visible height cm', exact: true });
    await height.fill('6'); await height.press('Enter');
    await expect(height).toBeDisabled();
    await page.waitForFunction(() => typeof (window as unknown as { __releaseDecode?: unknown }).__releaseDecode === 'function');

    const chooser = page.waitForEvent('filechooser');
    await menu(page, 'File', 'Open project…');
    await (await chooser).setFiles({ name: 'reopened.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(reopened)) });
    await expect(page.locator('.brand-copy small')).toHaveText(reopened.title);
    await page.evaluate(async () => {
      await (window as unknown as { __releaseDecode: () => Promise<void> }).__releaseDecode();
      await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    });

    // No operation from the closed document may enter the reopened document's history.
    expect(await savedProject()).toEqual(reopened);
    await page.getByRole('button', { name: /^motif-1/ }).click();
    const reopenedHeight = page.getByRole('spinbutton', { name: 'Visible height cm', exact: true });
    await expect(reopenedHeight).toHaveValue('4');
    await expect(reopenedHeight).toBeEnabled();
    await reopenedHeight.fill('5'); await reopenedHeight.press('Enter');
    await expect(page.getByRole('spinbutton', { name: 'Visible height cm', exact: true })).toHaveValue('5');
    await expect(page.getByRole('button', { name: 'Refresh', exact: true })).toBeEnabled();
    const resized = await savedProject();
    expect(resized.history.entries).toHaveLength(reopened.history.entries.length + 1);
    expect(resized.history.entries.at(-1).label).toBe('Resize motif-1 to 5 cm');
  });
}

test('a loaded form keeps its predictions only for its own candidate, and fit drafts do not leak between projects', async ({ page }) => {
  test.setTimeout(120_000);
  await createBeanie(page);
  // An invalid draft in this project...
  const head = page.locator('#fit\\.head');
  await head.fill('100'); await head.press('Enter');
  await expect(page.getByRole('alert').filter({ hasText: 'Not applied' })).toBeVisible();
  // ...does not survive opening another project.
  await menu(page, 'File', 'New project…');
  const dialog = page.getByRole('dialog', { name: 'New project' });
  await dialog.getByRole('tab', { name: 'Beanie' }).click();
  await dialog.getByLabel('Head circumference (cm)').fill('60');
  await dialog.getByRole('button', { name: 'Create beanie' }).click();
  await expect(page.locator('#fit\\.head')).toHaveValue('60', { timeout: 30_000 });
  await expect(page.getByRole('alert').filter({ hasText: 'Not applied' })).toHaveCount(0);

  await menu(page, 'File', 'Record a finished hat…');
  const measure = page.getByRole('dialog', { name: 'Record a finished hat' });
  // The knitted file is filled in with this design's (the fold-out starts open while there is none); it is opened to load a form or name another file.
  const knittedFile = measure.locator('details.measure-file');
  if (await knittedFile.getAttribute('open') === null) await knittedFile.locator('summary').click();
  await expect(knittedFile).toHaveAttribute('open', '');
  const form = { kind: 'kniterate-studio-measurements', schemaVersion: 1, candidate: { kcodeSha256: 'a'.repeat(64), label: 'Other', predictedCm: { circumference: 50, cuffVisible: 7, body: 25.9, crown: 9, total: 42 } }, synthetic: true, outcome: 'clean', bodyGauge: { stitchesPer10cm: null, rowsPer10cm: null }, ribGauge: { stitchesPer10cm: null, rowsPer10cm: null }, finishedCm: { circumference: null, cuffVisible: null, body: 12.9, crown: null, total: null }, notes: '' };
  await measure.getByLabel('Load measurements.json').setInputFiles({ name: 'measurements.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(form)) });
  await expect(measure.getByText(/Predictions from the loaded form for candidate aaaaaaaaaaaa/)).toBeVisible();
  await expect(measure.getByText('Compared with what the knitted candidate predicted (from its form).')).toBeVisible();
  await measure.getByLabel(/Candidate \(KCode SHA-256/).fill('b'.repeat(64));
  await expect(measure.getByText(/Predictions from the loaded form/)).toHaveCount(0);
  await expect(measure.getByText(/predictions are not known here/)).toBeVisible();
});

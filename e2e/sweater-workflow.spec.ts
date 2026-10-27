import { expect, test, type Page } from '@playwright/test';
import { menu, openStatusDisclosure, statusDisclosure, settledHeadline, settledStatus } from './menu';

async function createSweater(page: Page, style: 'Drop shoulder' | 'J-sleeve' | 'Set-in sleeve', stitch: string) {
  await page.goto('/?theme=light');
  await page.getByRole('button', { name: /^Sweater/ }).click();
  const dialog = page.getByRole('dialog', { name: 'New project' });
  await expect(dialog.getByRole('tab', { name: 'Sweater' })).toHaveAttribute('aria-selected', 'true');
  await dialog.getByLabel('Project name').fill('Weekend sweater');
  await dialog.getByRole('button', { name: style }).click();
  await dialog.getByLabel('Stitch').selectOption({ label: stitch });
  await dialog.getByRole('button', { name: 'Create sweater' }).click();
  await expect(dialog).toBeHidden();
}

const status = (page: Page) => settledStatus(page).locator('.status-card');

const knitted = (page: Page, label: string) => page.locator('.measure-row').filter({ has: page.getByLabel(label, { exact: true }) }).locator('.knitted');

test('a sweater is designed from size, style and stitch, checked piece by piece and packaged', async ({ page }) => {
  test.setTimeout(240_000);
  await createSweater(page, 'J-sleeve', 'Seed stitch');

  // Every piece compiles to a checked program; with assumed gauges the sizes are not confirmed.
  await expect(status(page)).toContainText('File checks passed, sizes not confirmed', { timeout: 90_000 });
  await expect(statusDisclosure(page, 'Files and printing')).toHaveJSProperty('open', false);
  await expect(page.getByRole('region', { name: 'Machine files' })).toBeHidden();
  await openStatusDisclosure(page, 'Files and printing');
  const pieces = page.locator('.status-pieces .piece-row');
  await expect(pieces).toHaveCount(4);
  await expect(pieces.first()).toBeVisible();
  await expect(page.locator('.status-pieces .piece-ok')).toHaveCount(4);
  await expect(page.getByRole('radio', { name: 'J-sleeve' })).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByRole('radio', { name: /Seed stitch/ })).toHaveAttribute('aria-checked', 'true');

  // A measurement is one undoable change; the knitted value follows it.
  const chest = page.getByLabel('Chest', { exact: true });
  await chest.fill('120');
  await chest.press('Enter');
  await expect(knitted(page, 'Chest')).toHaveText(/^1(19|20|21)(\.\d)?$/);
  await expect(page.locator('.section-aside').filter({ hasText: 'Custom' })).toBeVisible();
  await menu(page, 'Edit', 'Undo');
  await expect(chest).toHaveValue('110');
  await menu(page, 'Edit', 'Redo');
  await expect(chest).toHaveValue('120');

  // A boat neck has no neckband: the piece goes away and the top gets a rib edge.
  await page.getByRole('radio', { name: 'Boat neck' }).click();
  await expect(page.getByRole('navigation', { name: 'Pieces' }).getByRole('button', { name: 'Neckband' })).toHaveCount(0);
  await expect(pieces).toHaveCount(3);
  await page.getByRole('radio', { name: 'Crew neck' }).click();
  await expect(pieces).toHaveCount(4);
  // A V dips further than a crew: the standard depth moves with it, and every piece still knits.
  const neckDepth = page.getByLabel('Front neck depth', { exact: true });
  const crewDepth = await neckDepth.inputValue();
  await page.getByRole('radio', { name: 'V-neck' }).click();
  await expect(pieces).toHaveCount(4);
  await expect(neckDepth).not.toHaveValue(crewDepth);
  expect(Number(await neckDepth.inputValue())).toBeGreaterThan(2 * Number(crewDepth));
  await expect(status(page)).toContainText(/File checks passed/, { timeout: 90_000 });
  await expect(page.locator('.status-pieces .piece-ok')).toHaveCount(4);
  await page.getByRole('radio', { name: 'Crew neck' }).click();
  await expect(pieces).toHaveCount(4);
  await expect(neckDepth).toHaveValue(crewDepth);

  // A piece opens stitch by stitch; hovering names the row and what the machine does there.
  await page.getByRole('navigation', { name: 'Pieces' }).getByRole('button', { name: 'Front' }).click();
  const canvas = page.getByRole('img', { name: /^Front: \d+ rows, \d+ stitches cast on$/ });
  await expect(canvas).toBeVisible();
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height - 2);
  await expect(page.locator('.piece-tooltip')).toContainText(/^Row [12] · \d+ stitches · rib/);
  await expect(page.locator('.piece-rhythm li').first()).toContainText(/^Rows? \d+/);
  await page.getByRole('navigation', { name: 'Pieces' }).getByRole('button', { name: 'Whole sweater' }).click();

  // An unknittable custom stitch is explained and blocks; a fix unblocks.
  await page.getByRole('radio', { name: /Make your own/ }).click();
  // The top row becomes tuck + knit on the front bed, which one carriage pass cannot do.
  await page.getByRole('button', { name: /^Row 2, stitch 1: Purl/ }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'knits and tucks on the front bed' })).toBeVisible();
  await expect(status(page)).toContainText("Can't knit yet", { timeout: 30_000 });
  await expect(page.getByRole('complementary', { name: 'Status' }).locator('.status-reason')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Download knitting package' })).toBeDisabled();
  await page.getByRole('radio', { name: /Seed stitch/ }).click();
  await expect(status(page)).toContainText('File checks passed, sizes not confirmed', { timeout: 90_000 });

  // Measured gauges confirm sizes; the software verdict remains file checks passed.
  for (const label of ['Seed stitch gauge', 'Rib gauge']) await page.getByRole('group', { name: label }).getByLabel('measured').check();
  await expect(settledHeadline(page)).toHaveText('File checks passed', { timeout: 90_000 });
  await expect(page.getByLabel('Status: File checks passed', { exact: true })).toBeVisible();

  // A swatch measures one stitch: another keeps its numbers, but not as measured.
  const swatch = page.locator('#swatch');
  await page.getByRole('radio', { name: /1×1 rib/ }).click();
  await expect(page.getByRole('group', { name: '1×1 rib gauge' }).getByLabel('measured')).not.toBeChecked();
  await expect(page.getByLabel('1×1 rib gauge stitches per 10 cm')).toHaveValue('25');
  await expect(swatch).toContainText('Measured on Seed stitch. Measure a swatch of 1×1 rib for true sizes.');
  await expect(settledHeadline(page)).toHaveText('File checks passed, sizes not confirmed', { timeout: 90_000 });
  await expect(page.getByLabel('Status: File checks passed, sizes not confirmed')).toBeVisible();
  // Back on the stitch it was measured on, it is measured again.
  await page.getByRole('radio', { name: /Seed stitch/ }).click();
  await expect(page.getByRole('group', { name: 'Seed stitch gauge' }).getByLabel('measured')).toBeChecked();
  await expect(swatch).toContainText('From your swatch.');
  await expect(settledHeadline(page)).toHaveText('File checks passed', { timeout: 90_000 });

  // So with the hem rib the rib gauge was measured on, and the stitch size: each is part of the fabric.
  await page.getByRole('radiogroup', { name: 'Hem rib' }).getByRole('radio', { name: '1×1' }).click();
  await expect(page.getByRole('group', { name: 'Rib gauge' }).getByLabel('measured')).not.toBeChecked();
  await expect(swatch).toContainText('Measured on 2×2 rib. Measure a swatch of 1×1 rib for true sizes.');
  await expect(settledHeadline(page)).toHaveText('File checks passed, sizes not confirmed', { timeout: 90_000 });
  await page.getByRole('radiogroup', { name: 'Hem rib' }).getByRole('radio', { name: '2×2' }).click();
  await expect(page.getByRole('group', { name: 'Rib gauge' }).getByLabel('measured')).toBeChecked();
  await page.getByRole('button', { name: /^Machine settings/ }).click();
  await page.getByText('Speed, roller and stitch size').click();
  await page.getByLabel('Body stitch size').fill('11');
  await page.getByLabel('Body stitch size').press('Enter');
  await expect(page.getByRole('group', { name: 'Seed stitch gauge' }).getByLabel('measured')).not.toBeChecked();
  await expect(swatch).toContainText('Measured on Seed stitch. Measure a swatch of Seed stitch at stitch size 11 for true sizes.');
  await expect(settledHeadline(page)).toHaveText('File checks passed, sizes not confirmed', { timeout: 90_000 });
  await page.locator('#machine\\.body').getByRole('button', { name: 'Use the standard' }).click();
  await expect(page.getByRole('group', { name: 'Seed stitch gauge' }).getByLabel('measured')).toBeChecked();
  await expect(settledHeadline(page)).toHaveText('File checks passed', { timeout: 90_000 });

  // The package holds every piece's program.
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download knitting package' }).click();
  expect((await download).suggestedFilename()).toMatch(/^weekend-sweater-[0-9a-f]{8}-sweater\.zip$/);
  const sleeve = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download sleeve.kc' }).click();
  expect((await sleeve).suggestedFilename()).toMatch(/-sleeve\.kc$/);

  // The written pattern says how to knit and sew it.
  await page.getByRole('button', { name: 'Print knitting sheet' }).click();
  const sheet = page.getByRole('dialog', { name: 'Knitting instructions' });
  await expect(sheet).toContainText('Sleeve — knit 2');
  await expect(sheet).toContainText('Bind off the centre');
  await expect(sheet).toContainText('Assembly');
  await sheet.getByRole('button', { name: 'Close' }).click();
});

test('each sleeve style keeps every piece knittable', async ({ page }) => {
  test.setTimeout(240_000);
  await createSweater(page, 'Set-in sleeve', 'Stockinette');
  await expect(status(page)).toContainText('File checks passed, sizes not confirmed', { timeout: 90_000 });
  for (const style of ['Drop shoulder', 'J-sleeve'] as const) {
    await page.getByRole('radio', { name: style }).click();
    await expect(page.getByRole('radio', { name: style })).toHaveAttribute('aria-checked', 'true');
    await expect(status(page)).toContainText('File checks passed, sizes not confirmed', { timeout: 90_000 });
    await expect(page.locator('.status-pieces .piece-ok')).toHaveCount(4);
  }
});

test('a piece is shaped by hand like a garment-shaping machine: drag, add a waist, type a point, reset', async ({ page }) => {
  test.setTimeout(240_000);
  await createSweater(page, 'Set-in sleeve', 'Stockinette');
  await expect(status(page)).toContainText('File checks passed, sizes not confirmed', { timeout: 90_000 });
  await page.getByRole('navigation', { name: 'Pieces' }).getByRole('button', { name: 'Front' }).click();
  await page.getByRole('tab', { name: 'Shape' }).click();
  await expect(page.locator('.shape-source')).toHaveText('Drawn from your measurements — dragging makes it your own');

  // Drag the hem point out: an A-line. The measurements it replaces now say so.
  const hem = page.getByRole('button', { name: /^Hem: 55 cm wide, 0 cm up/ });
  const box = (await hem.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 40, box.y + box.height / 2, { steps: 8 });
  await page.mouse.up();
  await expect(page.getByRole('button', { name: /^Hem: 6\d(\.5)? cm wide, 0 cm up/ })).toBeVisible();
  await expect(page.locator('.shape-source')).toHaveText('Your shape — the measurements no longer draw it');
  await expect(page.locator('.measure-row.locked')).toHaveCount(4);
  await expect(page.locator('.piece-rhythm')).toContainText(/decrease 1 every/);

  // Add a waist between the hem and the underarm, and type its width.
  await page.getByRole('button', { name: 'Add a point between the hem and the underarm' }).click();
  const width = page.getByLabel('Point width (cm)');
  await width.fill('48');
  await width.press('Enter');
  await expect(page.getByRole('button', { name: /^Point 2: 48 cm wide/ })).toBeVisible();
  await expect(page.locator('.piece-rhythm')).toContainText(/increase 1 every/);

  // Every piece still compiles; the back shares the edge.
  await expect(status(page)).toContainText('File checks passed, sizes not confirmed', { timeout: 90_000 });
  await expect(page.locator('.status-pieces .piece-ok')).toHaveCount(4);
  await page.getByRole('navigation', { name: 'Pieces' }).getByRole('button', { name: 'Back' }).click();
  await expect(page.getByRole('button', { name: /^Point 2: 48 cm wide/ })).toBeVisible();

  // Back to the measurements, as one undoable change.
  await page.getByRole('button', { name: 'Back to measurements' }).click();
  await expect(page.getByRole('button', { name: /^Hem: 55 cm wide, 0 cm up/ })).toBeVisible();
  await expect(page.locator('.measure-row.locked')).toHaveCount(0);
  await menu(page, 'Edit', 'Undo');
  await expect(page.getByRole('button', { name: /^Point 2: 48 cm wide/ })).toBeVisible();
});

test('each machine file shows exactly what it knits: the fabric, its sections, and every pass in words and as written', async ({ page }) => {
  test.setTimeout(180_000);
  await createSweater(page, 'Set-in sleeve', 'Seed stitch');
  await expect(status(page)).toContainText('File checks passed, sizes not confirmed', { timeout: 90_000 });

  // The panel lists the files the machine runs; one opens straight into what it knits.
  await openStatusDisclosure(page, 'Files and printing');
  await page.locator('.status-pieces').getByRole('button', { name: /^front\.kc Front/ }).click();
  await expect(page.getByRole('tab', { name: 'Machine file' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('img', { name: /^front\.kc: \d+ courses of fabric from \d+ passes, needles \d+–\d+$/ })).toBeVisible();
  const sections = page.locator('.knitfile-sections li');
  await expect(sections.first()).toContainText('Waste yarn');
  await expect(sections.filter({ hasText: 'Draw thread' }).first()).toContainText('C1');
  await expect(sections.filter({ hasText: 'Hem rib' })).toContainText('rows 1–');
  await expect(sections.filter({ hasText: 'Neck split: left shoulder on C3, right on C4' })).toHaveCount(1);
  await expect(sections.last()).toContainText('Carriers out');

  // It opens on the cast-on, and reads each pass in words and as written in the file.
  const says = page.locator('.knitfile-says');
  await expect(says).toContainText(/with C3 \(your yarn\) and knits/);
  await expect(page.locator('.knitfile-source .highlighted').last()).toContainText(/^\d+(<<|>>) Kn-Kn 3 \d+ \d+$/);
  await page.getByRole('button', { name: 'Next pass', exact: true }).click();
  await expect(page.locator('.knitfile-nav b')).toContainText(/^Pass \d+/);

  // Jumping to the neck split, the right shoulder's own cone appears.
  await sections.filter({ hasText: 'Neck split' }).getByRole('button').click();
  for (let step = 0; step < 60 && !/C4/.test(await says.innerText()); step++) await page.getByRole('button', { name: 'Next pass', exact: true }).click();
  await expect(says).toContainText('C4 (your yarn, second cone)');

  // Another piece's file, and back to its stitches.
  await page.getByRole('navigation', { name: 'Pieces' }).getByRole('button', { name: 'Sleeve ×2' }).click();
  await expect(page.locator('.knitfile-head')).toContainText('sleeve.kc');
  await expect(page.locator('.knitfile-head')).toContainText('run it 2 times');
  await expect(sections.filter({ hasText: 'Cuff rib' })).toHaveCount(1);
  // The whole sweater's files, in the order the machine runs them.
  await page.getByRole('navigation', { name: 'Pieces' }).getByRole('button', { name: 'Whole sweater' }).click();
  await expect(page.getByRole('heading', { name: '5 runs on the machine' })).toBeVisible();
  await page.getByRole('button', { name: /^sleeve\.kc Sleeve/ }).first().click();
  await page.getByRole('tab', { name: 'Design' }).click();
  await page.getByRole('tab', { name: 'Stitches' }).click();
  await expect(page.getByRole('img', { name: /^Sleeve: \d+ rows/ })).toBeVisible();
});

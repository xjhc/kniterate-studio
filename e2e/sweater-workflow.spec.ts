import { expect, test, type Page } from '@playwright/test';

async function createSweater(page: Page, style: 'Drop shoulder' | 'J-sleeve' | 'Set-in sleeve', stitch: string) {
  await page.goto('/?theme=light');
  await page.getByRole('button', { name: 'New project' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'New project' });
  await dialog.getByRole('tab', { name: 'Sweater' }).click();
  await dialog.getByLabel('Project name').fill('Weekend sweater');
  await dialog.getByRole('button', { name: style }).click();
  await dialog.getByLabel('Stitch').selectOption({ label: stitch });
  await dialog.getByRole('button', { name: 'Create sweater' }).click();
  await expect(dialog).toBeHidden();
}

const status = (page: Page) => page.locator('.status-card');
const knitted = (page: Page, label: string) => page.locator('.measure-row').filter({ has: page.getByLabel(label, { exact: true }) }).locator('.knitted');

test('a sweater is designed from size, style and stitch, checked piece by piece and packaged', async ({ page }) => {
  test.setTimeout(240_000);
  await createSweater(page, 'J-sleeve', 'Seed stitch');

  // Every piece compiles to a checked program; with assumed gauges the sizes are not confirmed.
  await expect(status(page)).toContainText('Knittable — sizes not confirmed', { timeout: 90_000 });
  const pieces = page.locator('.status-pieces .piece-row');
  await expect(pieces).toHaveCount(4);
  await expect(page.locator('.status-pieces .piece-ok')).toHaveCount(4);
  await expect(page.getByRole('radio', { name: 'J-sleeve' })).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByRole('radio', { name: /Seed stitch/ })).toHaveAttribute('aria-checked', 'true');

  // A measurement is one undoable change; the knitted value follows it.
  const chest = page.getByLabel('Chest', { exact: true });
  await chest.fill('120');
  await chest.press('Enter');
  await expect(knitted(page, 'Chest')).toHaveText(/^1(19|20|21)(\.\d)?$/);
  await expect(page.locator('.section-aside').filter({ hasText: 'Custom' })).toBeVisible();
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(chest).toHaveValue('110');
  await page.getByRole('button', { name: 'Redo' }).click();
  await expect(chest).toHaveValue('120');

  // A boat neck has no neckband: the piece goes away and the top gets a rib edge.
  await page.getByRole('radio', { name: 'Boat neck' }).click();
  await expect(page.getByRole('navigation', { name: 'Pieces' }).getByRole('button', { name: 'Neckband' })).toHaveCount(0);
  await expect(pieces).toHaveCount(3);
  await page.getByRole('radio', { name: 'Crew neck' }).click();
  await expect(pieces).toHaveCount(4);

  // A piece opens stitch by stitch; hovering names the row and what the machine does there.
  await page.getByRole('navigation', { name: 'Pieces' }).getByRole('button', { name: 'Front' }).click();
  const canvas = page.getByRole('img', { name: /^Front: \d+ rows, \d+ stitches cast on$/ });
  await expect(canvas).toBeVisible();
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height - 2);
  await expect(page.locator('.piece-tooltip')).toContainText(/^Row [12] · \d+ stitches · rib/);
  await expect(page.locator('.piece-events li').first()).toBeVisible();
  await page.getByRole('navigation', { name: 'Pieces' }).getByRole('button', { name: 'Whole sweater' }).click();

  // An unknittable custom stitch is explained and blocks; a fix unblocks.
  await page.getByRole('radio', { name: /Make your own/ }).click();
  // The top row becomes tuck + knit on the front bed, which one carriage pass cannot do.
  await page.getByRole('button', { name: /^Row 2, stitch 1: Purl/ }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'knits and tucks on the front bed' })).toBeVisible();
  await expect(status(page)).toContainText('Not knittable yet', { timeout: 30_000 });
  await page.getByRole('radio', { name: /Seed stitch/ }).click();
  await expect(status(page)).toContainText('Knittable — sizes not confirmed', { timeout: 90_000 });

  // Measured gauges make every size real: ready to knit.
  for (const label of ['Seed stitch gauge', 'Rib gauge']) await page.getByRole('group', { name: label }).getByLabel('measured').check();
  await expect(status(page)).toContainText('Ready to knit', { timeout: 90_000 });

  // The package holds every piece's program.
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download knitting package' }).click();
  expect((await download).suggestedFilename()).toMatch(/^weekend-sweater-[0-9a-f]{8}-sweater\.zip$/);
  const sleeve = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download Sleeve program' }).click();
  expect((await sleeve).suggestedFilename()).toMatch(/-sleeve\.kc$/);

  // The written pattern says how to knit and sew it.
  await page.getByRole('button', { name: 'Pattern & assembly' }).click();
  const sheet = page.getByRole('dialog', { name: 'Knitting instructions' });
  await expect(sheet).toContainText('Sleeve — knit 2');
  await expect(sheet).toContainText('Bind off the centre');
  await expect(sheet).toContainText('Assembly');
  await sheet.getByRole('button', { name: 'Close' }).click();
});

test('each sleeve style keeps every piece knittable', async ({ page }) => {
  test.setTimeout(240_000);
  await createSweater(page, 'Set-in sleeve', 'Stockinette');
  await expect(status(page)).toContainText('Knittable — sizes not confirmed', { timeout: 90_000 });
  for (const style of ['Drop shoulder', 'J-sleeve'] as const) {
    await page.getByRole('radio', { name: style }).click();
    await expect(page.getByRole('radio', { name: style })).toHaveAttribute('aria-checked', 'true');
    await expect(status(page)).toContainText('Knittable — sizes not confirmed', { timeout: 90_000 });
    await expect(page.locator('.status-pieces .piece-ok')).toHaveCount(4);
  }
});

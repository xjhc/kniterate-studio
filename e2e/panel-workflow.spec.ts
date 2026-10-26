import { expect, test } from '@playwright/test';
import { menu, openStatusDisclosure, statusDisclosure } from './menu';

test('a one-colour scarf in any stitch: sized in cm, rib ends, the whole run in its schematic, one machine file', async ({ page }) => {
  test.setTimeout(180_000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/?theme=light');
  await page.getByRole('button', { name: /^Scarf or blanket/ }).click();
  const dialog = page.getByRole('dialog', { name: 'New project' });
  await expect(dialog.getByRole('radio', { name: 'One colour, any stitch' })).toHaveAttribute('aria-checked', 'true');
  await dialog.getByLabel('Project name').fill('Moss scarf');
  await dialog.getByLabel('Width (cm)').fill('22');
  await dialog.getByLabel('Length (cm)').fill('120');
  await dialog.getByLabel('Stitch').selectOption({ label: 'Seed stitch' });
  await dialog.getByRole('button', { name: 'Create' }).click();

  const status = page.locator('.status-card');
  await expect(status).toContainText('File checks passed, sizes not confirmed', { timeout: 90_000 });
  await expect(statusDisclosure(page, 'Files and printing')).toHaveJSProperty('open', false);
  await expect(page.getByRole('region', { name: 'Machine files' })).toBeHidden();
  await openStatusDisclosure(page, 'Files and printing');
  await expect(page.locator('.status-pieces .piece-ok')).toHaveCount(1);
  await expect(page.locator('.status-pieces .piece-ok')).toBeVisible();
  await expect(page.locator('.status-pieces')).toContainText('scarf.kc');
  // What no file can check, at the machine before every run.
  await expect(statusDisclosure(page, 'Before knitting')).toHaveJSProperty('open', false);
  await openStatusDisclosure(page, 'Before knitting');
  const atTheMachine = page.getByRole('region', { name: 'At the machine' });
  await expect(atTheMachine).toBeVisible();
  for (const check of ['every check assumes an empty bed', 'Park every yarn feeder at home', 'Knit a swatch to try the stitch size']) await expect(atTheMachine).toContainText(check);

  // Size in cm, wanted and knitted; a change is one undoable step.
  const width = page.getByLabel('Width', { exact: true });
  await width.fill('30'); await width.press('Enter');
  await expect(page.locator('.piece-summary')).toContainText(/^Scarf\d+ stitches/);
  await menu(page, 'Edit', 'Undo');
  await expect(width).toHaveValue('22');

  // Another stitch, and rib ends off.
  await page.getByRole('radio', { name: /^Garter stitch/ }).click();
  const ends = page.getByLabel('End rib height', { exact: true });
  await ends.fill('0'); await ends.press('Enter');
  await expect(status).toContainText(/File checks passed/, { timeout: 90_000 });

  // The schematic is the whole run; the machine file reads back from waste yarn to bind-off.
  await page.getByRole('tab', { name: 'Schematic', exact: true }).click();
  const schematic = page.getByTestId('schematic');
  for (const label of ['Waste yarn', 'Draw thread', 'Cast-on', 'Pattern', 'Bind-off']) await expect(schematic).toContainText(label);
  await expect(schematic).not.toContainText('Rib ·');
  await page.getByRole('tab', { name: 'Machine file', exact: true }).click();
  await expect(page.locator('.knitfile-head')).toContainText('scarf.kc');
  await expect(page.locator('.knitfile-sections li').filter({ hasText: 'Pattern' })).toContainText('C3');

  // The knitting sheet and the package.
  await page.getByRole('button', { name: 'Print knitting sheet' }).click();
  const sheet = page.getByRole('dialog', { name: 'Knitting instructions' });
  await expect(sheet).toContainText('Cast on');
  await expect(sheet).toContainText('Pull the draw thread');
  await sheet.getByRole('button', { name: 'Close' }).click();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download knitting package' }).click();
  expect((await download).suggestedFilename()).toMatch(/^moss-scarf-[0-9a-f]{8}-panel\.zip$/);
  expect(errors).toEqual([]);
});

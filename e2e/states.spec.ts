import { mkdir } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { menu } from './menu';
import { encodePng } from '../scripts/lib/png';

/**
 * The workspace in the states that have gone wrong before, at a laptop's
 * size: each kind of project, a typical or measured gauge, can't knit yet,
 * a problem in many places, a light yarn. Each is checked for what a
 * reviewer kept finding, and photographed to output/states/ for a look.
 */

test.use({ viewport: { width: 1280, height: 800 } });
test.skip(({ browserName }) => browserName !== 'chromium', 'The states are the same in every browser; once is enough.');

/** Words kept out of the workspace; the Machine file view may be technical. */
const NOT_SAID = ['≈', 'palette 0', 'Machine truth', 'trials'];

async function settled(page: Page) {
  await expect(page.locator('.verdict-pending')).toHaveCount(0, { timeout: 120_000 });
  await expect(page.getByTestId('readiness-headline')).not.toHaveText(/^Checking/, { timeout: 120_000 });
}

/** What every state must hold, then its photograph. */
async function check(page: Page, name: string, expected: string | RegExp) {
  await settled(page);
  const headline = page.getByTestId('readiness-headline');
  await expect(headline).toHaveText(expected);
  const title = (await headline.textContent())!.trim();

  // The badge says what the panel says. "N things to check" can still be knitted.
  const badge = (await page.locator('.authored-verdict').textContent())!.trim();
  if (/things? to check$/.test(title)) expect(badge).toMatch(/^Ready to knit(, sizes not confirmed)?$/);
  else expect(badge).toBe(title);

  // One note per thing to check, and as many as the headline counts.
  // A note's own words, without its buttons.
  const notes = await page.locator('.status-notes:not(.operator) > li').evaluateAll((items) => items.map((item) => item.firstChild?.textContent?.trim() ?? ''));
  expect(new Set(notes).size, `repeated notes: ${notes.join(' | ')}`).toBe(notes.length);
  const counted = /^(\d+) things? to check$/.exec(title);
  if (counted) expect(notes).toHaveLength(Number(counted[1]));
  // Nor is a note repeated elsewhere in the panel, under the files or as the headline's detail.
  const panel = await page.getByRole('complementary', { name: 'Status' }).innerText();
  for (const note of notes) expect(panel.split(note).length - 1, `said more than once: ${note}`).toBe(1);

  // Nothing scrolls sideways, and the views are all in reach.
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
  await expect(page.getByRole('tab', { name: 'Machine file' })).toBeInViewport();

  // Nothing still loading once the state has settled.
  await expect(page.locator('.app-shell')).not.toContainText('…', { timeout: 60_000 });

  // Plain words.
  const text = await page.locator('.app-shell').innerText();
  for (const word of NOT_SAID) expect(text, `says "${word}"`).not.toContain(word);

  await mkdir('output/states', { recursive: true });
  await page.screenshot({ path: `output/states/${name}.png` });
}

async function start(page: Page, card: RegExp) {
  await page.goto('/?theme=light');
  await page.getByRole('button', { name: card }).click();
  return page.getByRole('dialog', { name: 'New project' });
}

async function sweater(page: Page, stitch = 'Stockinette') {
  const dialog = await start(page, /^Sweater/);
  await dialog.getByLabel('Project name').fill('Weekend sweater');
  await dialog.getByRole('button', { name: 'Set-in sleeve' }).click();
  await dialog.getByLabel('Stitch').selectOption({ label: stitch });
  await dialog.getByRole('button', { name: 'Create sweater' }).click();
  await expect(dialog).toBeHidden();
}

async function beanie(page: Page) {
  const dialog = await start(page, /^Beanie/);
  await dialog.getByLabel('Project name').fill('Ring toque');
  await dialog.getByRole('button', { name: 'Create beanie' }).click();
  await expect(dialog).toBeHidden();
}

/** A dark ring with an empty middle: on a fairisle back, its yarn floats across the middle. */
function ringPng(): Buffer {
  const width = 60; const height = 46;
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    const inside = x >= 6 && x < 54 && y >= 6 && y < 40 && (x < 12 || x >= 48 || y < 12 || y >= 34);
    data.set(inside ? [20, 20, 20, 255] : [245, 245, 245, 255], (y * width + x) * 4);
  }
  return Buffer.from(encodePng({ width, height, data }));
}

test.describe('the workspace in each state', () => {
  test.describe.configure({ timeout: 180_000 });

  test('a new sweater', async ({ page }) => {
    await sweater(page);
    await check(page, 'sweater-typical', 'Ready to knit, sizes not confirmed');
  });

  test('a sweater with measured gauges', async ({ page }) => {
    await sweater(page);
    await settled(page);
    for (const label of ['Stockinette gauge', 'Rib gauge']) await page.getByRole('group', { name: label }).getByLabel('measured').check();
    await check(page, 'sweater-measured', 'Ready to knit');
  });

  test("a sweater that can't be knitted", async ({ page }) => {
    await sweater(page, 'Seed stitch');
    await page.getByRole('radio', { name: /Make your own/ }).click();
    // The top row becomes tuck + knit on the front bed, which one carriage pass cannot do.
    await page.getByRole('button', { name: /^Row 2, stitch 1: Purl/ }).click();
    await check(page, 'sweater-blocked', "Can't knit yet");
  });

  test('a new scarf', async ({ page }) => {
    const dialog = await start(page, /^Scarf or blanket/);
    await dialog.getByLabel('Project name').fill('Moss scarf');
    await dialog.getByRole('button', { name: 'Create' }).click();
    await check(page, 'scarf-typical', 'Ready to knit, sizes not confirmed');
  });

  test('a new beanie', async ({ page }) => {
    await beanie(page);
    await check(page, 'beanie-typical', 'Ready to knit, sizes not confirmed');
  });

  test('a beanie whose motif floats in many places', async ({ page }) => {
    await beanie(page);
    await page.getByRole('button', { name: 'Add image' }).click();
    const intake = page.getByRole('dialog', { name: 'Place an image' });
    await intake.getByLabel('Image file').setInputFiles({ name: 'ring.png', mimeType: 'image/png', buffer: ringPng() });
    await intake.getByLabel('Visible height (cm)').fill('6');
    await intake.getByRole('button', { name: 'Place' }).click();
    await expect(intake).toBeHidden();
    await page.locator('#backing').getByRole('button', { name: /^Fairisle/ }).click();
    await expect(page.locator('#backing .section-aside')).toHaveText('Fairisle', { timeout: 30_000 });
    await check(page, 'beanie-floats', /things? to check$/);
  });

  test('a beanie in a light yarn, drawn whole', async ({ page }) => {
    await beanie(page);
    await menu(page, 'Edit', 'Name and colours…');
    const settings = page.getByRole('dialog', { name: 'Project settings' });
    await settings.getByLabel('Black colour').fill('#e8dcc4');
    await settings.getByRole('button', { name: 'Save' }).click();
    await page.getByRole('navigation', { name: 'Pieces' }).getByRole('button', { name: 'Whole hat' }).click();
    await expect(page.getByRole('img', { name: 'The hat as worn, from the front' })).toBeVisible();
    await check(page, 'beanie-whole-hat-light', 'Ready to knit, sizes not confirmed');
  });

  test('a new colour chart', async ({ page }) => {
    const dialog = await start(page, /^Scarf or blanket/);
    await dialog.getByRole('radio', { name: 'Colour chart' }).click();
    await dialog.getByLabel('Project name').fill('Harbor blanket');
    await dialog.getByRole('button', { name: 'Create' }).click();
    await check(page, 'chart-typical', /^Ready to knit/);
  });
});

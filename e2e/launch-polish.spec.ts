import { expect, test } from '@playwright/test';
import { kcDownload, menu, openStatusDisclosure, settledHeadline } from './menu';

test('creates, renames, recolors, autosaves, and recovers a customer project', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');

  // A first visit starts by choosing what to make.
  await expect(page.getByRole('heading', { name: 'What would you like to make?' })).toBeVisible();
  await page.getByRole('button', { name: /^Scarf or blanket/ }).click();
  const newProject = page.getByRole('dialog', { name: 'New project' });
  await newProject.getByRole('radio', { name: 'Colour chart' }).click();
  await newProject.getByLabel('Project name').fill('Harbor blanket');
  // Sized in cm, at a typical gauge until a swatch is measured.
  await newProject.getByLabel('Width (cm)').fill('25');
  await newProject.getByLabel('Length (cm)').fill('21');
  await expect(newProject.getByText(/^65 needles × 71 rows at a typical gauge/)).toBeVisible();
  await newProject.getByRole('button', { name: '2', exact: true }).click();
  await newProject.getByRole('button', { name: 'Create' }).click();
  await expect(page.locator('.brand-copy small')).toContainText('Harbor blanket');
  const size = page.getByRole('group', { name: 'Finished measurements' });
  await expect(size.locator('.measure-row').filter({ hasText: /^Width/ }).locator('.count')).toHaveText('65 st');
  await expect(size.locator('.measure-row').filter({ hasText: /^Length/ }).locator('.count')).toHaveText('71 rows');

  await menu(page, 'Edit', 'Name and colours…');
  const settings = page.getByRole('dialog', { name: 'Project settings' });
  await settings.getByLabel('Project name').fill('Harbor blanket v1');
  await settings.getByLabel('Palette colour 1 name').fill('Ivory');
  await settings.locator('input[type="color"]').first().fill('#E8E1D2');
  await settings.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.locator('.brand-copy small')).toContainText('Harbor blanket v1');
  await expect(page.locator('.app-shell')).toHaveAttribute('data-autosave', 'saved');
  await openStatusDisclosure(page, 'Files and printing');
  await expect(kcDownload(page)).toBeEnabled({ timeout: 15_000 });

  await page.reload();
  await expect(page.locator('.brand-copy small')).toContainText('Harbor blanket v1');
  await expect(page.getByRole('button', { name: 'Use Ivory' })).toBeVisible();
  await expect(page.locator('.app-shell')).toHaveAttribute('data-autosave', 'saved');
  expect(errors).toEqual([]);
});

test('starting another project keeps the first one on this device, to open again or remove', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/?theme=light');
  await page.getByRole('button', { name: /^Beanie/ }).click();
  const create = page.getByRole('dialog', { name: 'New project' });
  await create.getByLabel('Project name').fill('Ring toque');
  await create.getByRole('button', { name: 'Create beanie' }).click();
  await expect(page.locator('.brand-copy small')).toContainText('Ring toque');

  // A scarf started straight away: the hat is kept with its latest change, without waiting for the autosave.
  await menu(page, 'File', 'New project…');
  await create.getByRole('tab', { name: 'Scarf or blanket' }).click();
  await create.getByLabel('Project name').fill('Moss scarf');
  await create.getByRole('button', { name: 'Create' }).click();
  await expect(page.locator('.brand-copy small')).toContainText('Moss scarf');

  await menu(page, 'File', 'Open recent…');
  const recent = page.getByRole('dialog', { name: 'Recent projects' });
  await expect(recent.getByRole('button', { name: /^Moss scarf/ })).toBeDisabled();
  await expect(recent.getByRole('button', { name: /^Moss scarf/ })).toContainText('open now');
  await recent.getByRole('button', { name: /^Ring toque/ }).click();
  await expect(page.locator('.brand-copy small')).toContainText('Ring toque');
  await expect(settledHeadline(page)).toHaveText('File checks passed, sizes not confirmed', { timeout: 30_000 });

  // Both survive a reload, and the open one comes back open.
  await expect(page.locator('.app-shell')).toHaveAttribute('data-autosave', 'saved');
  await page.reload();
  await expect(page.locator('.brand-copy small')).toContainText('Ring toque');
  await menu(page, 'File', 'Open recent…');
  await expect(recent.getByRole('listitem')).toHaveCount(2);
  // Removing asks twice.
  await recent.getByRole('button', { name: 'Remove Moss scarf' }).click();
  await recent.getByRole('button', { name: 'Remove for good' }).click();
  await expect(recent.getByRole('listitem')).toHaveCount(1);
  await expect(recent.getByRole('button', { name: /^Ring toque/ })).toContainText('open now');
  expect(errors).toEqual([]);
});

test('a file that is not a project says so on the start screen, with another try one click away', async ({ page }) => {
  await page.goto('/?theme=light');
  await page.getByLabel('Project file', { exact: true }).setInputFiles({ name: 'package.json', mimeType: 'application/json', buffer: Buffer.from('{"name": "package"}') });
  const alert = page.locator('.start-screen').getByRole('alert');
  await expect(alert).toContainText('“package.json” isn\'t a Studio project.');
  const chooser = page.waitForEvent('filechooser');
  await alert.getByRole('button', { name: 'Choose another file' }).click();
  await (await chooser).setFiles({ name: 'chart.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ kind: 'knitlab-colorwork-chart', version: 1, title: 'Opened chart', width: 4, height: 4, rowNumbering: 'bottom-up', palette: [{ id: 'a', name: 'A', hex: '#FFFFFF' }, { id: 'b', name: 'B', hex: '#000000' }], cells: Array.from({ length: 4 }, (_, row) => Array.from({ length: 4 }, (_, column) => (row + column) % 2)) })) });
  await expect(page.locator('.start-screen')).toHaveCount(0);
  await expect(page.locator('.brand-copy small')).toContainText('Opened chart');
});

test('the same project open in two tabs: a change in either is taken up by the other, so neither saves over it', async ({ page, context }) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/?theme=light');
  await page.getByRole('button', { name: /^Beanie/ }).click();
  const create = page.getByRole('dialog', { name: 'New project' });
  await create.getByLabel('Project name').fill('Ring toque');
  await create.getByRole('button', { name: 'Create beanie' }).click();
  await expect(page.locator('.app-shell')).toHaveAttribute('data-autosave', 'saved');

  const other = await context.newPage();
  other.on('pageerror', (error) => errors.push(error.message));
  await other.goto('/?theme=light');
  await expect(other.locator('.brand-copy small')).toContainText('Ring toque');
  await expect(other.locator('.app-shell')).toHaveAttribute('data-autosave', 'saved');

  await page.getByLabel('Head circumference').fill('60');
  await page.getByLabel('Head circumference').press('Enter');
  await expect(other.getByLabel('Head circumference')).toHaveValue('60');
  await other.getByLabel('Cuff height').fill('9');
  await other.getByLabel('Cuff height').press('Enter');
  await expect(page.getByLabel('Cuff height')).toHaveValue('9');
  await expect(other.locator('.app-shell')).toHaveAttribute('data-autosave', 'saved');

  // Both changes are kept, in one project: there is no other to open.
  await page.reload();
  await expect(page.getByLabel('Head circumference')).toHaveValue('60');
  await expect(page.getByLabel('Cuff height')).toHaveValue('9');
  await page.getByRole('navigation', { name: 'Menu' }).getByRole('button', { name: 'File', exact: true }).click();
  await expect(page.getByRole('menu', { name: 'File' }).getByRole('menuitem', { name: 'Open recent…' })).toBeDisabled();
  expect(errors).toEqual([]);
});

test('the same project changed in two tabs at once: both versions are kept, each as it was made', async ({ page, context }) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/?theme=light');
  await page.getByRole('button', { name: /^Beanie/ }).click();
  const create = page.getByRole('dialog', { name: 'New project' });
  await create.getByLabel('Project name').fill('Crossed toque');
  await create.getByRole('button', { name: 'Create beanie' }).click();
  await expect(page.locator('.app-shell')).toHaveAttribute('data-autosave', 'saved');
  const other = await context.newPage();
  other.on('pageerror', (error) => errors.push(error.message));
  await other.goto('/?theme=light');
  await expect(other.locator('.app-shell')).toHaveAttribute('data-autosave', 'saved');
  const head = await page.getByLabel('Head circumference').inputValue();
  const cuff = await page.getByLabel('Cuff height').inputValue();

  // Both edits within the same moment: their saves cross on the way.
  await Promise.all([page.getByLabel('Head circumference').fill('64'), other.getByLabel('Cuff height').fill('10')]);
  await Promise.all([page.getByLabel('Head circumference').press('Enter'), other.getByLabel('Cuff height').press('Enter')]);
  await expect(page.locator('.app-shell')).toHaveAttribute('data-autosave', 'saved');
  await expect(other.locator('.app-shell')).toHaveAttribute('data-autosave', 'saved');
  // A tab that kept its version as a copy says so.
  const copies = async () => (await page.getByRole('alert').filter({ hasText: 'kept as a copy' }).count()) + (await other.getByRole('alert').filter({ hasText: 'kept as a copy' }).count());
  await expect.poll(copies).toBeGreaterThan(0);

  // Every version under File → Open recent, as its latest beanie edit left it: each tab's own change is in one of them.
  const kept = () => page.evaluate(() => {
    const index = JSON.parse(localStorage.getItem('kniterate-studio:recent-projects:v1') ?? '[]') as { slot: string; title: string }[];
    return index.filter((item) => item.title === 'Crossed toque').map((item) => {
      const { project } = JSON.parse(localStorage.getItem(`kniterate-studio:recent-project:v1:${item.slot}`)!) as { project: { history: { cursor: number; entries: { edit: { kind: string; object?: { headCircumferenceCm: number; cuffTargetCm: number } } }[] } } };
      const object = project.history.entries.slice(0, project.history.cursor).filter((entry) => entry.edit.kind === 'set-object').at(-1)!.edit.object!;
      return `${object.headCircumferenceCm}/${object.cuffTargetCm}`;
    });
  });
  const both = expect.arrayContaining([`64/${cuff}`, `${head}/10`]);
  await expect.poll(kept).toEqual(both);

  // Two tabs that list their copies at once can each write the list without the other's: each tab puts its own back.
  await page.evaluate(() => localStorage.setItem('kniterate-studio:recent-projects:v1', '[]'));
  await expect.poll(kept).toEqual(both);
  expect(errors).toEqual([]);
});

import type { Page } from '@playwright/test';

/** Every action lives in the menu bar: File, Edit, View. */
export async function menu(page: Page, title: 'File' | 'Edit' | 'View', item: string | RegExp) {
  await page.getByRole('navigation', { name: 'Menu' }).getByRole('button', { name: title, exact: true }).click();
  await page.getByRole('menu', { name: title }).getByRole(typeof item === 'string' && ['Design', 'Schematic', 'Machine file', 'History', 'Dark mode', 'Passes', 'Fabric', 'Compare with another file'].includes(item) ? 'menuitemcheckbox' : 'menuitem', { name: item }).click();
}

/** A one-file project's machine file, downloaded from the status panel. */
export function kcDownload(page: Page) {
  return page.locator('.status-pieces').getByRole('button', { name: /^Download .+\.kc$/ });
}

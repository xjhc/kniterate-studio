import type { Page } from '@playwright/test';

/** Every action lives in the menu bar: File, Edit, View. */
export async function menu(page: Page, title: 'File' | 'Edit' | 'View', item: string | RegExp) {
  await page.getByRole('navigation', { name: 'Menu' }).getByRole('button', { name: title, exact: true }).click();
  await page.getByRole('menu', { name: title }).getByRole(typeof item === 'string' && ['Design', 'Schematic', 'Machine file', 'History', 'Dark mode', 'Passes', 'Fabric', 'Compare with another file'].includes(item) ? 'menuitemcheckbox' : 'menuitem', { name: item }).click();
}

/** The status panel once the latest change is checked: while a check runs it keeps showing its last result. */
export function settledStatus(page: Page) {
  return page.locator('aside[aria-label="Status"][aria-busy="false"]');
}

/** The status headline once the latest change is checked. */
export function settledHeadline(page: Page) {
  return settledStatus(page).getByTestId('readiness-headline');
}

export function statusDisclosure(page: Page, label: 'Why?' | 'Swatch' | 'Files and printing' | 'Before knitting') {
  return page.getByRole('complementary', { name: 'Status' }).locator('details').filter({
    has: page.locator('summary').filter({ hasText: label }),
  });
}

/** Open the native disclosure through its summary; repeated calls keep it open. */
export async function openStatusDisclosure(page: Page, label: Parameters<typeof statusDisclosure>[1]) {
  const disclosure = statusDisclosure(page, label);
  if (await disclosure.getAttribute('open') === null) await disclosure.locator('summary').click();
  return disclosure;
}

/** A one-file project's download, after opening Files and printing. */
export function kcDownload(page: Page) {
  return page.locator('.status-pieces').getByRole('button', { name: /^Download .+\.kc$/ });
}

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
export const vendorDirectory = resolve(scriptDirectory, '../src/knitout/vendor');

export function browserConverterSource(source: string): string {
  const javascriptStart = source.indexOf('"use strict";');
  const driverStart = source.indexOf('//driver code');
  if (javascriptStart < 0 || driverStart < javascriptStart) {
    throw new Error('Vendored converter markers changed; refusing to generate a partial browser module.');
  }
  const librarySource = source.slice(javascriptStart, driverStart).trimEnd();
  return `${librarySource}\n\nexport { knitoutToPasses, passesToKCode };\n`;
}

export function generateBrowserConverter(): void {
  const source = readFileSync(resolve(vendorDirectory, 'knitout-to-kcode.cjs'), 'utf8');
  writeFileSync(resolve(vendorDirectory, 'knitout-to-kcode.browser.js'), browserConverterSource(source));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) generateBrowserConverter();

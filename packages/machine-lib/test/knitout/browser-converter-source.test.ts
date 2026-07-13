import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { browserConverterSource, vendorDirectory } from '../../scripts/generate-browser-converter';

describe('browser converter source', () => {
  it('is regenerated from the canonical vendored CLI without its Node driver', () => {
    const canonical = readFileSync(resolve(vendorDirectory, 'knitout-to-kcode.cjs'), 'utf8');
    const browser = readFileSync(resolve(vendorDirectory, 'knitout-to-kcode.browser.js'), 'utf8');
    expect(browser).toBe(browserConverterSource(canonical));
    expect(browser).not.toContain("require('fs')");
  });
});

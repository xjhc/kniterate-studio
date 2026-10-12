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

  it('preserves the upstream MIT notice in source and Pages distribution input', () => {
    const license = readFileSync(
      resolve(vendorDirectory, 'LICENSE.knitout-backend-kniterate'),
      'utf8',
    ).trim();
    const notice = readFileSync(
      resolve(vendorDirectory, '../../../../../apps/studio/public/THIRD_PARTY_NOTICES.txt'),
      'utf8',
    );
    const studioIndex = readFileSync(
      resolve(vendorDirectory, '../../../../../apps/studio/index.html'),
      'utf8',
    );

    expect(license).toContain('Copyright (c) 2020 Carnegie Mellon Textiles Lab');
    expect(notice).toContain(license);
    expect(studioIndex).toContain('rel="license" href="./THIRD_PARTY_NOTICES.txt"');
  });
});

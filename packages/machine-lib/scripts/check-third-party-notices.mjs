#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const vendorLicense = readFileSync(
  resolve('src/knitout/vendor/LICENSE.knitout-backend-kniterate'),
  'utf8',
).trim();
const sourceNotice = readFileSync(
  resolve('../../apps/studio/public/THIRD_PARTY_NOTICES.txt'),
  'utf8',
);
const builtNotice = readFileSync(
  resolve('../../apps/studio/dist/THIRD_PARTY_NOTICES.txt'),
  'utf8',
);
const builtIndex = readFileSync(resolve('../../apps/studio/dist/index.html'), 'utf8');

if (!sourceNotice.includes(vendorLicense)) {
  throw new Error('Studio source notice does not include the exact vendored MIT license.');
}
if (builtNotice !== sourceNotice) {
  throw new Error('Built third-party notice is missing or differs from its source bytes.');
}
if (!builtIndex.includes('rel="license"') || !builtIndex.includes('./THIRD_PARTY_NOTICES.txt')) {
  throw new Error('Built Studio index does not expose the third-party notice through rel=license.');
}

process.stdout.write('third-party notice: exact license present in built Studio\n');

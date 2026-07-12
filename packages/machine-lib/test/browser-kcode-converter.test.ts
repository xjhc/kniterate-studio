import { describe, expect, it } from 'vitest';
import { browserKnitoutToKCode } from '../src/knitout/kniterate/browser-to-kcode';
import { knitoutToKCode } from '../src/knitout/kniterate/to-kcode';

const knitout = [
  ';!knitout-2',
  ';;Machine: kniterate',
  ';;Carriers: 1 2 3 4 5 6',
  'in 2',
  'knit + f40 2',
  'knit - f40 2',
  'out 2',
  '',
].join('\n');

describe('browser k-code adapter', () => {
  it('runs the same vendored converter byte-identically to the Node adapter', () => {
    const browser = browserKnitoutToKCode(knitout, 'command.k');
    const node = knitoutToKCode(knitout);
    expect(browser.ok).toBe(true);
    expect(node.ok).toBe(true);
    expect(browser.kcode).toBe(node.kcode);
  });
});

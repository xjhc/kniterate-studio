import { describe, expect, it, vi } from 'vitest';
import { browserKnitoutToKCode } from '../src/knitout/kniterate/browser-to-kcode';
import {
  knitoutToKCode,
  knitoutToKCodeWithTrace,
  nodeKCodeConverter,
} from '../src/knitout/kniterate/to-kcode';
import {
  knitoutToPasses,
  passesToKCode,
} from '../src/knitout/vendor/knitout-to-kcode.browser.js';

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

const alternatingCarrierSpacing = [
  ';!knitout-2',
  ';;Machine: kniterate',
  ';;Carriers: 1 2 3 4 5 6',
  'x-carrier-spacing 1.5',
  'x-carrier-stopping-distance 2.5',
  'x-stitch-number 6',
  'x-speed-number 300',
  'x-roller-advance 450',
  'in 1',
  'in 2',
  'in 3',
  'tuck + f40 1',
  'tuck - f40 2',
  'tuck + f40 3',
  'knit - f40 1',
  'knit + f40 2',
  'knit - f40 3',
  'out 1',
  'out 2',
  'out 3',
  '',
].join('\n');

function passExplosionSource(operationCount: number): string {
  return [
    ';!knitout-2',
    ';;Machine: kniterate',
    ';;Carriers: 1 2 3 4 5 6',
    'in 1',
    ...Array.from(
      { length: operationCount },
      (_, index) => `knit ${index % 2 === 0 ? '+' : '-'} f1 1`,
    ),
    'out 1',
    '',
  ].join('\n');
}

describe('browser k-code adapter', () => {
  it('runs the same vendored converter byte-identically to the Node adapter', () => {
    const browser = browserKnitoutToKCode(knitout, 'command.k');
    const node = knitoutToKCode(knitout);
    const nodeTrace = knitoutToKCodeWithTrace(knitout, 'command.k');
    expect(browser.ok).toBe(true);
    expect(node.ok).toBe(true);
    expect(nodeTrace.ok).toBe(true);
    expect(browser.kcode).toBe(node.kcode);
    expect(nodeTrace.ok && nodeTrace.kcode).toBe(node.kcode);
    expect(nodeTrace.ok && nodeTrace.scheduledPasses).toEqual(browser.scheduledPasses);
    if (!nodeTrace.ok) throw new Error(nodeTrace.error);
    expect(nodeTrace.scheduledPasses.map((pass) => pass.sourceLines)).toEqual([
      [5],
      [6, 7],
    ]);
  });

  it('is deterministic across repeated in-process conversions', () => {
    const results = Array.from(
      { length: 6 },
      () => browserKnitoutToKCode(alternatingCarrierSpacing, 'command.k'),
    );
    expect(results.every((result) => result.ok)).toBe(true);
    expect(new Set(results.map((result) => result.kcode)).size).toBe(1);
    expect(new Set(results.map((result) => JSON.stringify(result.scheduledPasses))).size).toBe(1);
  });

  it('does not leak one document\'s lowering settings into the next', () => {
    const before = browserKnitoutToKCode(knitout, 'command.k');
    const custom = browserKnitoutToKCode(alternatingCarrierSpacing, 'command.k');
    const after = browserKnitoutToKCode(knitout, 'command.k');
    expect(before.ok).toBe(true);
    expect(custom.ok).toBe(true);
    expect(after.ok).toBe(true);
    expect(after.kcode).toBe(before.kcode);
    expect(after.scheduledPasses).toEqual(before.scheduledPasses);
  });

  it('keeps two-stage parse results independent when emission order is interleaved', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const customParsed = knitoutToPasses(alternatingCarrierSpacing, 'command.k');
      const defaultParsed = knitoutToPasses(knitout, 'command.k');
      const interleavedCustom = passesToKCode(
        customParsed.headers,
        customParsed.passes,
        'command.kc',
      );
      const freshCustom = browserKnitoutToKCode(alternatingCarrierSpacing, 'command.k');
      expect(freshCustom.ok).toBe(true);
      expect(interleavedCustom).toBe(freshCustom.kcode);

      const interleavedDefault = passesToKCode(
        defaultParsed.headers,
        defaultParsed.passes,
        'command.kc',
      );
      const freshDefault = browserKnitoutToKCode(knitout, 'command.k');
      expect(freshDefault.ok).toBe(true);
      expect(interleavedDefault).toBe(freshDefault.kcode);
    } finally {
      log.mockRestore();
      warn.mockRestore();
    }
  });

  it('aborts pass explosion inside both in-process adapters before KCode emission', { timeout: 20_000 }, () => {
    const source = passExplosionSource(10_001);
    const browser = browserKnitoutToKCode(source, 'pass-explosion.k');
    const node = knitoutToKCodeWithTrace(source, 'pass-explosion.k');

    expect(browser).toMatchObject({
      ok: false,
      error: expect.stringContaining('lowering resource limit exceeded (4096 scheduled source passes)'),
    });
    expect(browser.kcode).toBeUndefined();
    expect(browser.scheduledPasses).toBeUndefined();
    expect(node).toMatchObject({
      ok: false,
      error: expect.stringContaining('lowering resource limit exceeded (4096 scheduled source passes)'),
    });
  });

  it('applies source preflight before subprocess or async Node conversion', async () => {
    const oversizedRecord = `;!knitout-2\n${'x'.repeat(16_385)}`;
    const direct = knitoutToKCode(oversizedRecord);
    const asyncResult = await nodeKCodeConverter(oversizedRecord);

    expect(direct).toMatchObject({
      ok: false,
      exitCode: 2,
      stderr: expect.stringContaining('16384-code-unit line limit'),
    });
    expect(asyncResult).toMatchObject({
      ok: false,
      error: expect.stringContaining('16384-code-unit line limit'),
    });
  });
});

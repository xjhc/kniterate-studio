import { describe, expect, it, vi } from 'vitest';
import {
  browserAuthoredKnitoutToKCode,
  browserKnitoutToKCode,
} from '../src/knitout/kniterate/browser-to-kcode';
import {
  authoredKnitoutToKCodeWithTrace,
  knitoutToKCode,
  knitoutToKCodeWithTrace,
  nodeKCodeConverter,
} from '../src/knitout/kniterate/to-kcode';
import {
  KNITOUT_RESOURCE_LIMITS_V1,
  checkKnitoutSourceResourceLimits,
  classifyKnitoutCapacityIssue,
} from '../src/knitout/parser';
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

function emittedPassExplosionSource(groupCount: number): string {
  const operations = Array.from(
    { length: groupCount },
    () => ['xfer f1 b1', 'xfer f2 b2', 'xfer b3 f3', 'xfer b4 f4', 'x-end-pass'],
  ).flat();
  return [
    ';!knitout-2',
    ';;Machine: kniterate',
    ';;Carriers: 1 2 3 4 5 6',
    'x-xfer-style four-pass',
    ...operations,
    '',
  ].join('\n');
}

function selectedCellExplosionSource(rowCount: number): string {
  const operations: string[] = [];
  for (let row = 0; row < rowCount; row++) {
    if (row % 2 === 0) {
      for (let needle = 1; needle <= 252; needle++) operations.push(`knit + f${needle} 1`);
    } else {
      for (let needle = 252; needle >= 1; needle--) operations.push(`knit - f${needle} 1`);
    }
  }
  return [
    ';!knitout-2',
    ';;Machine: kniterate',
    ';;Carriers: 1 2 3 4 5 6',
    'in 1',
    ...operations,
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
    expect(nodeTrace.ok && nodeTrace.coordinateMapping).toEqual(browser.coordinateMapping);
    expect(nodeTrace.warningCount).toBe(browser.warningCount);
    expect(nodeTrace.warnings).toEqual(browser.warnings);
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
    expect(new Set(results.map((result) => JSON.stringify(result.coordinateMapping))).size).toBe(1);
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
      capacityIssue: { profile: 'foreign-v1', metric: 'lowered-passes', limit: 4_096 },
    });
    expect(browser.kcode).toBeUndefined();
    expect(browser.scheduledPasses).toBeUndefined();
    expect(node).toMatchObject({
      ok: false,
      error: expect.stringContaining('lowering resource limit exceeded (4096 scheduled source passes)'),
      capacityIssue: { profile: 'foreign-v1', metric: 'lowered-passes', limit: 4_096 },
    });
  });

  it('uses named foreign and authored source/pass profiles without caller-selected numbers', { timeout: 20_000 }, () => {
    expect(Object.isFrozen(KNITOUT_RESOURCE_LIMITS_V1)).toBe(true);
    expect(Object.isFrozen(KNITOUT_RESOURCE_LIMITS_V1['foreign-v1'])).toBe(true);
    expect(Object.isFrozen(KNITOUT_RESOURCE_LIMITS_V1['authored-v1'])).toBe(true);
    expect(KNITOUT_RESOURCE_LIMITS_V1['foreign-v1'].kcodeRecords).toBe(50_000);
    expect(KNITOUT_RESOURCE_LIMITS_V1['authored-v1'].kcodeRecords).toBe(100_000);
    for (const limits of Object.values(KNITOUT_RESOURCE_LIMITS_V1)) {
      // The pinned serializer emits at most twelve records per lowered pass,
      // plus its three fixed header records.
      expect(limits.loweredPasses * 12 + 3).toBeLessThanOrEqual(limits.kcodeRecords);
    }
    const overForeignRecordLimit = '\n'.repeat(250_000);
    expect(checkKnitoutSourceResourceLimits(overForeignRecordLimit)).toMatchObject({
      line: 250_001,
      message: expect.stringContaining('250000-record intake limit'),
    });
    for (const result of [
      browserKnitoutToKCode(overForeignRecordLimit, 'foreign-record-limit.k'),
      knitoutToKCodeWithTrace(overForeignRecordLimit, 'foreign-record-limit.k'),
    ]) {
      expect(result).toMatchObject({
        ok: false,
        capacityIssue: {
          profile: 'foreign-v1',
          metric: 'knitout-records',
          limit: 250_000,
        },
      });
    }
    expect(checkKnitoutSourceResourceLimits(overForeignRecordLimit, 'authored-v1')).toBeNull();
    const overAuthoredRecordLimit = '\n'.repeat(600_000);
    expect(checkKnitoutSourceResourceLimits(overAuthoredRecordLimit, 'authored-v1')).toMatchObject({
      line: 600_001,
      message: expect.stringContaining('600000-record intake limit'),
    });
    for (const result of [
      browserAuthoredKnitoutToKCode(overAuthoredRecordLimit, 'authored-record-limit.k'),
      authoredKnitoutToKCodeWithTrace(overAuthoredRecordLimit, 'authored-record-limit.k'),
    ]) {
      expect(result).toMatchObject({
        ok: false,
        capacityIssue: {
          profile: 'authored-v1',
          metric: 'knitout-records',
          limit: 600_000,
        },
      });
    }

    const source = passExplosionSource(5_500);
    const foreign = browserKnitoutToKCode(source, 'profile.k');
    const authoredBrowser = browserAuthoredKnitoutToKCode(source, 'profile.k');
    const authoredNode = authoredKnitoutToKCodeWithTrace(source, 'profile.k');
    expect(foreign).toMatchObject({
      ok: false,
      capacityIssue: { profile: 'foreign-v1', metric: 'lowered-passes', limit: 4_096 },
    });
    expect(authoredBrowser).toMatchObject({ ok: true });
    expect(authoredNode).toMatchObject({ ok: true });
    expect(authoredBrowser.scheduledPasses).toHaveLength(5_500);
    expect(authoredNode.ok && authoredNode.scheduledPasses).toHaveLength(5_500);
    expect(authoredBrowser.kcode).toBe(authoredNode.ok ? authoredNode.kcode : undefined);
    expect(authoredBrowser.kcode?.split('\n')).toHaveLength(49_505);
  });

  it('guards the internal emitted-record append path and classifies named-profile refusals', () => {
    const parsed = knitoutToPasses(knitout, 'record-guard.k', {
      maxPasses: 4_096,
      maxSelections: 200_000,
      maxKCodeRecords: 3,
    });
    let thrown: unknown;
    try {
      passesToKCode(parsed.headers, parsed.passes, 'record-guard.kc');
    } catch (error) {
      thrown = error;
    }
    expect(String(thrown)).toContain('(3 emitted KCode records)');
    expect(classifyKnitoutCapacityIssue(
      'KCode lowering resource limit exceeded (100000 emitted KCode records); split the artifact.',
      'authored-v1',
    )).toMatchObject({
      profile: 'authored-v1',
      metric: 'kcode-records',
      limit: 100_000,
    });
  });

  it('aborts emitted-pass expansion in browser and Node for both named profiles', { timeout: 30_000 }, () => {
    const foreignSource = emittedPassExplosionSource(1_100);
    const authoredSource = emittedPassExplosionSource(2_200);
    const results = [
      browserKnitoutToKCode(foreignSource, 'foreign-emitted-pass-limit.k'),
      knitoutToKCodeWithTrace(foreignSource, 'foreign-emitted-pass-limit.k'),
      browserAuthoredKnitoutToKCode(authoredSource, 'authored-emitted-pass-limit.k'),
      authoredKnitoutToKCodeWithTrace(authoredSource, 'authored-emitted-pass-limit.k'),
    ];

    expect(results[0]).toMatchObject({
      ok: false,
      error: expect.stringContaining('(4096 emitted passes)'),
      capacityIssue: { profile: 'foreign-v1', metric: 'lowered-passes', limit: 4_096 },
    });
    expect(results[1]).toMatchObject({
      ok: false,
      error: expect.stringContaining('(4096 emitted passes)'),
      capacityIssue: { profile: 'foreign-v1', metric: 'lowered-passes', limit: 4_096 },
    });
    expect(results[2]).toMatchObject({
      ok: false,
      error: expect.stringContaining('(8192 emitted passes)'),
      capacityIssue: { profile: 'authored-v1', metric: 'lowered-passes', limit: 8_192 },
    });
    expect(results[3]).toMatchObject({
      ok: false,
      error: expect.stringContaining('(8192 emitted passes)'),
      capacityIssue: { profile: 'authored-v1', metric: 'lowered-passes', limit: 8_192 },
    });
  });

  it('aborts emitted-selection expansion in browser and Node for both named profiles', { timeout: 30_000 }, () => {
    const source = selectedCellExplosionSource(794);
    const results = [
      browserKnitoutToKCode(source, 'foreign-selection-limit.k'),
      knitoutToKCodeWithTrace(source, 'foreign-selection-limit.k'),
      browserAuthoredKnitoutToKCode(source, 'authored-selection-limit.k'),
      authoredKnitoutToKCodeWithTrace(source, 'authored-selection-limit.k'),
    ];

    for (const [index, result] of results.entries()) {
      expect(result).toMatchObject({
        ok: false,
        error: expect.stringContaining('(200000 selected raster cells)'),
        capacityIssue: {
          profile: index < 2 ? 'foreign-v1' : 'authored-v1',
          metric: 'selected-cells',
          limit: 200_000,
        },
      });
    }
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

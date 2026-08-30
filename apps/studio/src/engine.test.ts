import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  compareKcDocuments,
  openMachineDocument,
  resolveAuthoredVerdict,
  type AuthoredVerdictInput,
  type OpenKCodeDocumentOptions,
} from './engine';
import {
  createMachineCheckReceipt,
  formatMachineCheckReceipt,
} from './machineCheckContract';

const BASE_WIDTH = 283;
const NEEDLE_COLUMNS = 253;
const LEFT_PADDING = 15;
const RIGHT_PADDING = 15;

function markerFreeBed(selected: readonly number[]): string {
  const needles = Array.from({ length: NEEDLE_COLUMNS }, () => '_');
  for (const needle of selected) needles[needle] = '-';
  return '.'.repeat(LEFT_PADDING) + needles.join('') + '.'.repeat(RIGHT_PADDING);
}

function decorateBed(base: string, carrier: '0' | '2'): string {
  const markers: readonly [number, string][] = carrier === '0'
    ? [[10, '/'], [273, '\\']]
    : [[10, '/'], [45, carrier], [235, carrier], [273, '\\']];
  let output = '';
  let cursor = 0;
  for (const [offset, marker] of markers) {
    output += base.slice(cursor, offset) + marker;
    cursor = offset;
  }
  return output + base.slice(cursor);
}

function kcode(options: {
  readonly front?: readonly number[];
  readonly rear?: readonly number[];
  readonly carrier?: '0' | '2';
  readonly operation?: 'Kn-Kn' | 'Tr-Rr';
  readonly speed?: string;
  readonly roller?: string;
  readonly stitch?: string;
  readonly newline?: '\n' | '\r\n';
  readonly comment?: string;
} = {}): string {
  const carrier = options.carrier ?? '2';
  const newline = options.newline ?? '\n';
  const stitch = options.stitch ?? '6';
  return [
    'HOME',
    'RACK:0',
    `// ${options.comment ?? 'strict Studio fixture'}`,
    `FRNT:${decorateBed(markerFreeBed(options.front ?? [100]), carrier)}`,
    `STIF:${stitch.repeat(BASE_WIDTH)}`,
    `REAR:${decorateBed(markerFreeBed(options.rear ?? []), carrier)}`,
    `STIR:${stitch.repeat(BASE_WIDTH)}`,
    `>> ${options.operation ?? 'Kn-Kn'} ${carrier} ${options.speed ?? '300'} ${options.roller ?? '450'}`,
    '',
  ].join(newline);
}

function largeKCode(passCount: number): string {
  const selected = Array.from({ length: NEEDLE_COLUMNS }, (_, index) => index);
  const decorateFullBed = (base: string): string => {
    const markers: readonly [number, string][] = [[10, '/'], [15, '2'], [268, '2'], [273, '\\']];
    let output = '';
    let cursor = 0;
    for (const [offset, marker] of markers) {
      output += base.slice(cursor, offset) + marker;
      cursor = offset;
    }
    return output + base.slice(cursor);
  };
  const front = decorateFullBed(markerFreeBed(selected));
  const rear = decorateFullBed(markerFreeBed([]));
  const stitch = '6'.repeat(BASE_WIDTH);
  const lines = ['HOME', 'RACK:0', '// 150k-selection Studio regression'];
  for (let index = 0; index < passCount; index += 1) {
    lines.push(
      `FRNT:${front}`,
      `STIF:${stitch}`,
      `REAR:${rear}`,
      `STIR:${stitch}`,
      `${index % 2 === 0 ? '>>' : '<<'} Kn-Kn 2 300 450`,
    );
  }
  return `${lines.join('\n')}\n`;
}

function emptyFullBedDrops(passCount: number): string {
  const selected = Array.from({ length: NEEDLE_COLUMNS }, (_, index) => index);
  const front = decorateBed(markerFreeBed(selected), '0');
  const rear = decorateBed(markerFreeBed([]), '0');
  const stitch = '6'.repeat(BASE_WIDTH);
  const lines = ['HOME', 'RACK:0'];
  for (let index = 0; index < passCount; index += 1) {
    lines.push(
      `FRNT:${front}`,
      `STIF:${stitch}`,
      `REAR:${rear}`,
      `STIR:${stitch}`,
      `${index % 2 === 0 ? '>>' : '<<'} Kn-Kn 0 300 450`,
    );
  }
  return `${lines.join('\n')}\n`;
}

function passExplosionKnitout(operationCount: number): string {
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

const KC = kcode();

const K = [
  ';!knitout-2',
  ';;Carriers: 1 2 3 4 5 6',
  ';;Machine: kniterate',
  'in 2',
  'knit + f12 2',
  'out 2',
].join('\n');

describe('strict KCode machine document engine', () => {
  it('requires an explicit parser contract at the direct library boundary', () => {
    const runtimeFilename: string = 'sample.kc';
    const document = openMachineDocument(runtimeFilename, KC, null);

    expect(document.verdict.label).toBe('Blocked');
    expect(document.source).toBe(KC);
    expect(document.kcode).toMatchObject({
      dialect: null,
      document: null,
      trace: null,
      validation: null,
      scene: null,
    });
    expect(document.diagnostics).toContainEqual(expect.objectContaining({
      rule: 'kcode.dialect-required',
      severity: 'error',
      line: 1,
    }));

    if (false) {
      // @ts-expect-error A literal .kc call must supply OpenKCodeDocumentOptions.
      openMachineDocument('sample.kc', KC);
    }
  });

  it('opens strict KCode with exact source, pass spans, trace, validation, and scene', () => {
    const document = openMachineDocument('sample.kc', KC, {
      dialect: 'knitout-vendor',
    });

    expect(document.verdict.label).toBe('Surface-proven (imported)');
    expect(document.source).toBe(KC);
    expect(document.passes).toHaveLength(1);
    expect(document.passes[0]).toMatchObject({
      lineStart: 4,
      lineEnd: 8,
      direction: '>>',
      carriers: ['2'],
      beds: 'F',
      needleSpan: 'K-code 100',
    });
    expect(document.kcode?.document?.rawText).toBe(KC);
    expect(document.kcode?.document?.metadata.dialect).toBe('knitout-vendor');
    expect(document.kcode?.trace?.passes).toHaveLength(1);
    expect(document.kcode?.validation).toMatchObject({ ok: true, diagnostics: [] });
    expect(document.kcode?.scene?.passes).toHaveLength(1);
    expect(document.stats).toMatchObject({
      passCount: 1,
      loopFormingPassCount: 1,
      authoredRowCount: null,
      passMetricProvenance: 'strict-kcode-trace',
      authoredRowProvenance: 'unavailable-for-foreign-machine-file',
    });

    const selection = document.kcode?.trace?.passes[0]?.selections.front[0];
    expect(selection?.traceCoordinate).toBe(100);
    expect(KC.slice(
      selection!.sourceSpan.start.offset,
      selection!.sourceSpan.end.offset,
    )).toBe('-');
  });

  it('accepts bytes one-to-one and preserves CRLF plus the original byte stream', () => {
    const source = kcode({ newline: '\r\n' });
    const bytes = new TextEncoder().encode(source);
    const document = openMachineDocument('bytes.kc', bytes, { dialect: 'app' });

    expect(document.verdict.state).toBe('surface');
    expect(document.source).toBe(source);
    expect(document.kcode?.document?.rawText).toBe(source);
    expect(document.kcode?.document?.records.some((record) => record.lineEnding === '\r\n')).toBe(true);
    expect(document.kcode?.sourceBytes).toEqual(bytes);
    expect(document.kcode?.sourceBytes).not.toBe(bytes);
  });

  it('retains invalid source bytes and exact parser spans when import blocks', () => {
    const clean = new TextEncoder().encode(KC);
    const bad = new Uint8Array(clean.length + 1);
    bad.set(clean.subarray(0, 5), 0);
    bad[5] = 0xff;
    bad.set(clean.subarray(5), 6);

    const document = openMachineDocument('bad-byte.kc', bad, {
      dialect: 'knitout-vendor',
    });
    const finding = document.diagnostics.find((item) => item.rule === 'kcode.source-byte');
    expect(document.verdict.state).toBe('blocked');
    expect(document.source.charCodeAt(5)).toBe(0xff);
    expect(document.kcode?.sourceBytes).toEqual(bad);
    expect(finding).toMatchObject({ severity: 'error', line: 2 });
    expect(finding?.sourceSpan?.start.offset).toBe(5);
  });

  it.each([
    {
      name: 'footer-only historical false positive',
      source: 'HOME\nRACK:0\n>> Kn-Kn 2 999999 -999999\n',
      rules: ['kcode.orphan-footer', 'kcode.no-passes'],
    },
    {
      name: 'truncated raster historical false positive',
      source: KC.replace(`STIF:${'6'.repeat(BASE_WIDTH)}`, 'STIF:6'),
      rules: ['kcode.field-width'],
    },
    {
      name: 'unknown record',
      source: KC.replace('RACK:0\n', 'RACK:0\nMYSTERY:42\n'),
      rules: ['kcode.unknown-record'],
    },
  ])('blocks $name without legacy reconstruction', ({ source, rules }) => {
    const document = openMachineDocument('bad.kc', source, {
      dialect: 'knitout-vendor',
    });

    expect(document.verdict.label).toBe('Blocked');
    expect(document.kcode?.document?.rawText).toBe(source);
    expect(document.kcode?.trace).toBeNull();
    expect(document.kcode?.scene).toBeNull();
    expect(document.diagnostics.map((item) => item.rule)).toEqual(expect.arrayContaining(rules));
    expect(document.verdict.annotation).toContain('Machine-facing findings');
  });

  it('blocks a structurally valid transfer whose source loop is empty', () => {
    const source = kcode({
      carrier: '0',
      operation: 'Tr-Rr',
      front: [100],
      rear: [100],
      roller: '0',
    });
    const document = openMachineDocument('empty-xfer.kc', source, {
      dialect: 'knitout-vendor',
    });
    const finding = document.diagnostics.find(
      (item) => item.rule === 'machine-trace.transfer-source-empty',
    );

    expect(document.kcode?.trace?.passes).toHaveLength(1);
    expect(document.kcode?.scene?.passes).toHaveLength(1);
    expect(document.kcode?.validation?.ok).toBe(false);
    expect(document.verdict.state).toBe('blocked');
    expect(finding).toMatchObject({
      severity: 'error',
      classification: 'semantic',
      passIndex: 0,
      line: 4,
    });
    expect(source.slice(
      finding!.sourceSpan!.start.offset,
      finding!.sourceSpan!.end.offset,
    )).toBe('-');
  });

  it('shows warnings and conservatively blocks unresolved imported warnings', () => {
    const document = openMachineDocument('warning.kc', kcode({ speed: '801' }), {
      dialect: 'knitout-vendor',
    });

    expect(document.kcode?.validation?.ok).toBe(true);
    expect(document.stats).toMatchObject({ errorCount: 0, warningCount: 1 });
    expect(document.diagnostics).toContainEqual(expect.objectContaining({
      severity: 'warning',
      classification: 'operational-advisory',
      rule: 'machine-trace.setting-documented-range',
    }));
    expect(document.verdict).toMatchObject({
      state: 'blocked',
      label: 'Blocked',
    });
    expect(document.verdict.annotation).toContain('conservative V1 policy');
  });

  it('keeps exact programmed travel but withholds the time term for nonpositive speed', () => {
    const document = openMachineDocument('zero-speed.kc', kcode({ speed: '0' }), {
      dialect: 'knitout-vendor',
    });

    expect(document.stats.programmedMotion).toMatchObject({
      coordinateMetric: {
        programmedTravelUnits: 263,
        unit: 'encoded-stop-coordinate-unit',
        provenance: 'exact-machine-trace',
      },
      assumptionModel: {
        status: 'unavailable',
        assumedPitchMmPerCoordinateUnit: 3.63,
        idealizedSeconds: null,
        unavailableReason: {
          code: 'nonpositive-speed',
          firstPassIndex: 0,
          offendingPassCount: 1,
        },
      },
    });
  });

  it('opens more than 150k selections without whole-document argument spreading', { timeout: 20_000 }, () => {
    const source = largeKCode(594);
    const document = openMachineDocument(
      'full-bed-blanket.kc',
      new TextEncoder().encode(source),
      { dialect: 'knitout-vendor' },
    );
    const selectionCount = document.kcode?.trace?.passes.reduce(
      (count, pass) => count + pass.selections.front.length + pass.selections.rear.length,
      0,
    );

    expect(selectionCount).toBe(150_282);
    expect(document.passes).toHaveLength(594);
    expect(document.stats.loopFormingPassCount).toBe(594);
    expect(document.stats.needleSpan).toBe('K-code 0-252');
    expect(document.verdict.state).toBe('surface');
  });

  it('blocks an oversized exact-trace graph before projection materializes it', { timeout: 20_000 }, () => {
    const document = openMachineDocument('oversized-trace.kc', emptyFullBedDrops(791), {
      dialect: 'knitout-vendor',
    });

    expect(document.verdict.state).toBe('blocked');
    expect(document.kcode?.trace).toBeNull();
    expect(document.stats).toMatchObject({
      passCount: 0,
      loopFormingPassCount: null,
      passMetricProvenance: 'unavailable',
    });
    expect(document.kcode?.scene).toBeNull();
    expect(document.diagnostics).toContainEqual(expect.objectContaining({
      severity: 'error',
      rule: 'kcode.trace-projection',
      rawMessage: expect.stringContaining('software resource limit of 200,000'),
    }));
  });

  it('bounds MachineTrace diagnostic details while reporting exact warning totals', () => {
    const document = openMachineDocument('many-empty-drops.kc', emptyFullBedDrops(100), {
      dialect: 'knitout-vendor',
    });

    expect(document.kcode?.validation).toMatchObject({
      ok: true,
      errorCount: 0,
      warningCount: 25_300,
    });
    expect(document.stats).toMatchObject({ errorCount: 0, warningCount: 25_300 });
    expect(document.stats.loopFormingPassCount).toBe(0);
    expect(document.diagnostics.length).toBeLessThan(520);
    expect(document.diagnostics).toContainEqual(expect.objectContaining({
      severity: 'warning',
      rule: 'machine-trace.drop-empty',
      occurrences: 24_788,
      rawMessage: expect.stringContaining('omitted 24788 additional warning findings'),
    }));
  });

  it('keeps imported artifacts Surface-proven without a registry-derived verification seam', () => {
    const document = openMachineDocument('sample.kc', KC, {
      dialect: 'knitout-vendor',
    });
    expect(document.verdict).toMatchObject({
      state: 'surface',
      label: 'Surface-proven (imported)',
    });
    expect(document.verdict.annotation).toContain('physical knitting remain unproven');

    if (false) {
      const forgedOptions: OpenKCodeDocumentOptions = {
        dialect: 'knitout-vendor',
        // @ts-expect-error Physical proof IDs are not accepted from import callers.
        knitProvenEntryId: 'caller-forged-proof',
      };
      openMachineDocument('sample.kc', KC, forgedOptions);
    }
  });
});

describe('authoritative KCode MachineTrace diff', () => {
  it('detects raster/selection changes even when all footer tokens match', () => {
    const left = openMachineDocument('left.kc', kcode({ front: [100] }), {
      dialect: 'knitout-vendor',
    });
    const right = openMachineDocument('right.kc', kcode({ front: [101] }), {
      dialect: 'knitout-vendor',
    });
    const result = compareKcDocuments(left, right);

    expect(result.summary).toMatchObject({
      comparison: 'strict-machine-trace-v1',
      status: 'compared',
      identical: false,
      generatedPassCount: 1,
      referencePassCount: 1,
    });
    expect(result.summary.deltas.map((delta) => delta.field)).toEqual(expect.arrayContaining([
      'selections.front[0].payloadIndex',
      'selections.front[0].traceCoordinate',
      'raw.FRNT',
    ]));
    expect(result.windows).toHaveLength(1);
    expect(result.windows[0]?.text).toContain('STRICT MACHINE-TRACE V1 COMPARISON');
    expect(result.windows[0]?.text).toContain('select=f100:6');
    expect(result.windows[0]?.text).toContain('select=f101:6');
    expect(result.windows[0]?.text).toContain('exact field deltas');
    expect(result.windows[0]?.text).toContain('raw.FRNT');
    expect(result.windows[0]?.text).toContain('generated: "');
    expect(result.windows[0]?.text).toContain('reference: "');
  });

  it('shows ordered rack-command changes even when the pass rack resolves identically', () => {
    const transientRack = KC.replace('RACK:0\n', 'RACK:0\nRACK:1\nRACK:0\n');
    const left = openMachineDocument('left.kc', KC, { dialect: 'knitout-vendor' });
    const right = openMachineDocument('right.kc', transientRack, { dialect: 'knitout-vendor' });
    const result = compareKcDocuments(left, right);

    expect(result.summary).toMatchObject({ status: 'compared', identical: false });
    expect(result.summary.deltas.map((delta) => delta.field)).toEqual(expect.arrayContaining([
      'rackCommands.length',
      'rackCommands[1]',
      'rackCommands[2]',
    ]));
    expect(result.windows[0]?.text).toContain('rack commands generated:');
    expect(result.windows[0]?.text).toContain('rack commands reference:');
    expect(result.windows[0]?.text).toContain('raw="1" numeric=1');
  });

  it('blocks invalid inputs and compares V1 provenance aliases with identical movement semantics', () => {
    const valid = openMachineDocument('valid.kc', KC, { dialect: 'app' });
    const invalid = openMachineDocument(
      'invalid.kc',
      'HOME\nRACK:0\n>> Kn-Kn 2 300 450\n',
      { dialect: 'app' },
    );
    const invalidResult = compareKcDocuments(valid, invalid);
    expect(invalidResult.summary).toMatchObject({ status: 'blocked', identical: false });
    expect(invalidResult.windows[0]?.text).toContain('COMPARISON BLOCKED');

    const vendor = openMachineDocument('vendor.kc', KC, {
      dialect: 'knitout-vendor',
    });
    const dialectResult = compareKcDocuments(valid, vendor);
    expect(dialectResult.summary).toMatchObject({
      status: 'compared',
      identical: true,
      byteIdentical: true,
    });
    expect(dialectResult.windows).toEqual([]);
  });
});

describe('Knitout machine document behavior', () => {
  it('lowers Knitout through the pinned backend and exposes exact emitted movement', () => {
    const document = openMachineDocument('sample.k', K);
    expect(document.source).toBe(K);
    expect(document.kcode?.document?.metadata).toMatchObject({
      parseStatus: 'accepted',
      recordMaterialization: 'complete',
      dialect: 'knitout-vendor',
      strict: true,
    });
    expect(document.kcode?.validation?.ok).toBe(true);
    expect(document.kcode?.differential).toMatchObject({ ok: true, scheduledPassCount: 2, tracePassCount: 2 });
    expect(document.kcode?.scene?.passes).toHaveLength(2);
    expect(document.passes).toHaveLength(2);
    expect(document.passes[0]).toMatchObject({
      lineStart: 5,
      direction: '>>',
      needleSpan: 'K-code 126',
      section: 'Pinned backend / emitted KCode',
    });
    expect(document.passes[1]).toMatchObject({ lineStart: 6, lineEnd: 6 });
    expect(document.stats.carriers).toEqual(['2']);
    expect(document.verdict).toMatchObject({ state: 'surface', label: 'Surface-proven (imported)' });
    expect(document.verdict.annotation).toContain('scheduled-pass differential checks');
  });

  it('gives each pinned-backend warning a stable unique diagnostic identity', () => {
    const source = [
      ';!knitout-2',
      ';;Machine: kniterate',
      ';;Carriers: 1 2 3 4 5 6',
      ';;First-Unknown: one',
      ';;Second-Unknown: two',
      'in 2',
      'tuck + f40 2',
      'out 2',
      '',
    ].join('\n');
    const document = openMachineDocument('warnings.k', source);
    const warnings = document.diagnostics.filter((finding) =>
      finding.rule === 'knitout-backend-warning');

    expect(warnings.length).toBeGreaterThanOrEqual(2);
    expect(new Set(warnings.map((finding) => finding.id)).size).toBe(warnings.length);
    expect(warnings.map((finding) => finding.id)).toEqual(
      warnings.map((_finding, index) => `knitout-backend-warning-warning-${index}`),
    );
  });

  it('bounds pinned-backend warning details and reports the exact total', () => {
    const headers = Array.from({ length: 10_000 }, (_, index) => `;;Unknown-${index}: value`);
    const source = [
      ';!knitout-2',
      ';;Machine: kniterate',
      ';;Carriers: 1 2 3 4 5 6',
      ...headers,
      'in 2',
      'tuck + f40 2',
      'out 2',
      '',
    ].join('\n');
    const document = openMachineDocument('many-warnings.k', source);

    expect(document.stats.warningCount).toBe(10_000);
    expect(document.diagnostics.length).toBeLessThan(520);
    expect(document.diagnostics).toContainEqual(expect.objectContaining({
      severity: 'warning',
      rule: 'knitout-backend-warning-summary',
      occurrences: 9_488,
      rawMessage: expect.stringContaining('omitted 9488 additional warnings'),
    }));
    const details = document.diagnostics.filter((finding) => finding.rule === 'knitout-backend-warning');
    expect(details).toHaveLength(512);
    expect(new Set(details.map((finding) => finding.id)).size).toBe(details.length);
  });

  it('bounds diagnostics for a high-record malformed Knitout import', () => {
    const source = 'x\n'.repeat(100_000);
    const document = openMachineDocument('adversarial.k', source);

    expect(document.source).toBe(source);
    expect(document.verdict.state).toBe('blocked');
    expect(document.diagnostics.length).toBeLessThan(520);
    expect(document.diagnostics).toContainEqual(expect.objectContaining({
      severity: 'error',
      rule: 'knitout-diagnostic-summary',
      rawMessage: expect.stringContaining('omitted 99489 additional findings'),
    }));
  });

  it('bounds validator findings for many syntax-valid invalid operations', () => {
    const source = [
      ';!knitout-2',
      ';;Machine: kniterate',
      ';;Carriers: 1',
      ...Array.from({ length: 2_000 }, () => 'knit + f0 1'),
      '',
    ].join('\n');
    const document = openMachineDocument('many-invalid-ops.k', source);

    expect(document.verdict.state).toBe('blocked');
    expect(document.diagnostics.length).toBeLessThan(520);
    expect(document.diagnostics).toContainEqual(expect.objectContaining({
      severity: 'error',
      rule: 'validation-message-summary',
      rawMessage: expect.stringContaining('omitted 5488 additional error findings'),
    }));
  });

  it('blocks source-pass explosion inside lowering before emitted KCode allocation', { timeout: 20_000 }, () => {
    const document = openMachineDocument('pass-explosion.k', passExplosionKnitout(10_001));

    expect(document.verdict.state).toBe('blocked');
    expect(document.kcode?.document).toBeNull();
    expect(document.kcode?.trace).toBeNull();
    expect(document.diagnostics).toContainEqual(expect.objectContaining({
      severity: 'error',
      rule: 'knitout-backend-lowering',
      rawMessage: expect.stringContaining('lowering resource limit exceeded (4096 scheduled source passes)'),
    }));
  });

  it('streams one very large source-pass extent without argument spreading', { timeout: 20_000 }, () => {
    const source = [
      ';!knitout-2',
      ';;Machine: kniterate',
      ';;Carriers: 1 2 3 4 5 6',
      'in 1',
      ...Array.from({ length: 130_000 }, () => 'knit + f1 1'),
      'out 1',
      '',
    ].join('\n');

    let document: ReturnType<typeof openMachineDocument> | undefined;
    expect(() => { document = openMachineDocument('large-source-pass.k', source); }).not.toThrow();
    expect(document).toBeDefined();
    if (document === undefined) throw new Error('expected a blocked document');
    expect(document.verdict.state).toBe('blocked');
    expect(document.diagnostics).toContainEqual(expect.objectContaining({
      rule: 'knitout-backend-lowering',
      rawMessage: expect.stringContaining('lowering resource limit exceeded'),
    }));
  });

  it('blocks syntax-clean Knitout when strict emitted KCode has no machine passes', () => {
    const source = [
      ';!knitout-2',
      ';;Machine: kniterate',
      ';;Carriers: 1 2 3 4 5 6',
    ].join('\n');
    const document = openMachineDocument('empty.k', source);
    const emittedFinding = document.diagnostics.find((item) => item.rule === 'kcode.no-passes');

    expect(document.verdict.state).toBe('blocked');
    expect(document.kcode?.document?.metadata.parseStatus).toBe('rejected');
    expect(document.kcode?.trace).toBeNull();
    expect(emittedFinding).toMatchObject({ line: null, sourceSpan: null, classification: 'syntax' });
    expect(emittedFinding?.rawMessage).toContain('Emitted KCode line');
  });

  it('blocks syntax-clean Knitout whose lowered transfer reads an empty needle', () => {
    const source = [
      ';!knitout-2',
      ';;Machine: kniterate',
      ';;Carriers: 1 2 3 4 5 6',
      'x-speed-number 300',
      'x-roller-advance 450',
      'xfer f40 b40',
      '',
    ].join('\n');
    const document = openMachineDocument('empty-transfer.k', source);

    expect(document.kcode?.document?.metadata.parseStatus).toBe('accepted');
    expect(document.kcode?.differential?.ok).toBe(true);
    expect(document.kcode?.validation?.ok).toBe(false);
    expect(document.diagnostics).toContainEqual(expect.objectContaining({
      severity: 'error',
      rule: 'machine-trace.transfer-source-empty',
      line: null,
      sourceSpan: null,
    }));
    expect(document.verdict.state).toBe('blocked');
  });

  it('keeps depth-three foreign loop stacks informational while depth four remains blocked', () => {
    const source = [
      ';!knitout-2',
      ';;Machine: kniterate',
      ';;Carriers: 1 2 3 4 5 6',
      'x-speed-number 300',
      'x-roller-advance 450',
      'in 2',
      'tuck + f40 2',
      'tuck - f40 2',
      'tuck + f40 2',
      'tuck - f40 2',
      'out 2',
      '',
    ].join('\n');
    const document = openMachineDocument('four-tucks.k', source);
    const policy = document.diagnostics.filter((finding) =>
      finding.rule === 'machine-trace.loop-stack-policy');

    expect(document.kcode?.differential?.ok).toBe(true);
    expect(policy.map((finding) => finding.severity)).toEqual(['info', 'error']);
    expect(document.stats).toMatchObject({ infoCount: 1, warningCount: 0, errorCount: 1 });
    expect(document.verdict.state).toBe('blocked');
  });

  it('opens a foreign depth-three loop stack Surface-proven with the observation visible', () => {
    const source = [
      ';!knitout-2',
      ';;Machine: kniterate',
      ';;Carriers: 1 2 3 4 5 6',
      'x-speed-number 300',
      'x-roller-advance 450',
      'in 2',
      'tuck + f40 2',
      'tuck - f40 2',
      'tuck + f40 2',
      'out 2',
      '',
    ].join('\n');
    const document = openMachineDocument('three-tucks.k', source);

    expect(document.diagnostics).toContainEqual(expect.objectContaining({
      severity: 'info',
      rule: 'machine-trace.loop-stack-policy',
    }));
    expect(document.stats).toMatchObject({ infoCount: 1, warningCount: 0, errorCount: 0 });
    expect(document.verdict).toMatchObject({
      state: 'surface',
      label: 'Surface-proven (imported)',
    });
    expect(document.verdict.annotation).toContain('non-blocking loop-stack observation');
  });

  it('keeps rule-specific truncated depth-three observations informational', () => {
    const operations = Array.from({ length: 513 }, () => [
      'tuck + f40 2',
      'tuck - f40 2',
      'tuck + f40 2',
      'drop f40',
    ]).flat();
    const source = [
      ';!knitout-2',
      ';;Machine: kniterate',
      ';;Carriers: 1 2 3 4 5 6',
      'x-speed-number 300',
      'x-roller-advance 450',
      'in 2',
      ...operations,
      'out 2',
      '',
    ].join('\n');
    const document = openMachineDocument('many-three-stacks.k', source);
    const summaries = document.diagnostics.filter((finding) =>
      finding.rule === 'machine-trace.loop-stack-policy'
      && finding.passIndex === null);

    expect(summaries).toContainEqual(expect.objectContaining({
      severity: 'info',
      occurrences: 1,
      rawMessage: expect.stringContaining('omitted 1 additional warning finding'),
    }));
    expect(document.stats).toMatchObject({ infoCount: 513, warningCount: 0, errorCount: 0 });
    expect(document.verdict).toMatchObject({
      state: 'surface',
      label: 'Surface-proven (imported)',
    });
  });

  it('pins every reference-corpus import verdict to the documented policy', { timeout: 30_000 }, () => {
    const expected = {
      '2x2-rib-beanie.kc': 'surface',
      'back.kc': 'surface',
      'color-swatch-bindoff.kc': 'surface',
      'dbj.kc': 'surface',
      'fairisle.kc': 'surface',
      'fox-baby-beanie.kc': 'blocked',
      'front.kc': 'surface',
      'jacquard.kc': 'surface',
      'sleeves.kc': 'surface',
      'sophie.kc': 'surface',
      'sophie2.kc': 'surface',
      'sophie_stripe.kc': 'surface',
      'swatch.kc': 'surface',
    } as const;

    const observed = Object.fromEntries(Object.entries(expected).map(([filename]) => {
      const source = readFileSync(resolve('../../packages/machine-lib/reference', filename));
      const document = openMachineDocument(filename, source, { dialect: 'knitout-vendor' });
      expect(document.kcode?.validation?.errorCount, filename).toBe(0);
      return [filename, document.verdict.state];
    }));

    expect(observed).toEqual(expected);
  });

  it('blocks malformed Knitout input', () => {
    const document = openMachineDocument(
      'bad.k',
      ';!knitout-2\n;;Carriers: 1\nknit + nope 1',
    );
    expect(document.verdict.label).toBe('Blocked');
    expect(document.diagnostics.find((item) => item.rule === 'knitout-parse')?.line).toBe(3);
  });

  it.each([
    ['illegal carrier', [';!knitout-2', ';;Carriers: 7', 'in 7', 'knit + f50 7'].join('\n'), 'carrier-id-legal'],
    ['quarter rack', [';!knitout-2', ';;Carriers: 1', 'rack 0.25', 'xfer f50 b50'].join('\n'), 'rack-legal-increment'],
    ['needle zero', [';!knitout-2', ';;Carriers: 1', 'in 1', 'knit + f0 1', 'out 1'].join('\n'), 'no-needle-zero'],
    ['same-bed transfer', [';!knitout-2', ';;Carriers: 1', 'xfer f50 f51'].join('\n'), 'xfer-cross-beds'],
    ['stitch overflow', [';!knitout-2', ';;Carriers: 1', 'x-stitch-number 36', 'knit + f50 1'].join('\n'), 'stitch-number-range'],
    ['rack magnitude warning', [';!knitout-2', ';;Carriers: 1', 'rack 22', 'xfer f50 b50'].join('\n'), 'rack-magnitude'],
  ])('blocks refusal case: %s', (_name, source, rule) => {
    const document = openMachineDocument('refusal.k', source);
    expect(document.verdict.label).toBe('Blocked');
    expect(document.diagnostics.some((item) => item.rule === rule)).toBe(true);
  });
});

describe('one-file machine check contract', () => {
  it('preserves direct KCode byte evidence without inventing source lifecycle', () => {
    const bytes = new TextEncoder().encode(KC);
    const document = openMachineDocument('sample.kc', bytes, {
      dialect: 'knitout-vendor',
    });
    const receipt = createMachineCheckReceipt(document, {
      byteCount: bytes.byteLength,
      sha256: 'a'.repeat(64),
    });

    expect(receipt).toMatchObject({
      kind: 'kniterate-machine-check',
      schemaVersion: 1,
      input: {
        filename: 'sample.kc',
        format: 'kc',
        byteCount: bytes.byteLength,
        sha256: 'a'.repeat(64),
        profile: 'kniterate-7gg-kcode@2',
        dialect: 'knitout-vendor',
      },
      verdict: { state: 'surface', label: 'Surface-proven (imported)' },
      evidence: {
        exactInputBytes: 'preserved-kcode-bytes',
        sourceCarrierLifecycle: 'not-encoded-by-kcode',
        backendScheduleDifferential: 'not-available-for-direct-kcode',
        physicalAcceptance: 'not-established',
      },
      diagnostics: [],
      diagnosticDetailsOmitted: 0,
    });
    expect(receipt.disclosure.join(' ')).toContain('do not encode Knitout carrier in/out');
    expect(JSON.stringify(receipt)).not.toContain(KC);
  });

  it('reports Knitout lifecycle checking and the emitted scheduled differential', () => {
    const bytes = new TextEncoder().encode(K);
    const document = openMachineDocument('sample.k', bytes, {});
    const receipt = createMachineCheckReceipt(document, {
      byteCount: bytes.byteLength,
      sha256: 'b'.repeat(64),
    });
    const human = formatMachineCheckReceipt(receipt);

    expect(receipt).toMatchObject({
      verdict: { state: 'surface' },
      evidence: {
        exactInputBytes: 'decoded-knitout-text',
        sourceCarrierLifecycle: 'checked-before-lowering',
        backendScheduleDifferential: 'passed',
        physicalAcceptance: 'not-established',
      },
    });
    expect(human).toContain('Surface-proven (imported) · sample.k');
    expect(human).toContain('2 programmed passes · 1 loop-forming pass');
    expect(human).toContain('authored design rows unavailable (foreign file)');
    expect(human).toContain('programmed stop-coordinate units');
    expect(human).toContain('mm assumption-derived travel');
    expect(human).toContain('s idealized constant-speed term');
    expect(human).toContain('Knitout source carrier lifecycle is checked');
    expect(human).toContain('Diagnostics: none');
  });

  it('keeps warning-only foreign KCode blocked in machine-readable output', () => {
    const source = kcode({ speed: '801' });
    const document = openMachineDocument('warning.kc', new TextEncoder().encode(source), {
      dialect: 'knitout-vendor',
    });
    const receipt = createMachineCheckReceipt(document, {
      byteCount: source.length,
      sha256: 'c'.repeat(64),
    });

    expect(receipt).toMatchObject({
      verdict: { state: 'blocked', label: 'Blocked' },
      stats: { errorCount: 0, warningCount: 1 },
      diagnostics: [{
        severity: 'warning',
        rule: 'machine-trace.setting-documented-range',
      }],
    });
  });

  it.each([
    ['clean KCode', 'packages/machine-lib/reference/fairisle.kc', 0, 'surface', 'not-encoded-by-kcode'],
    ['warning-blocked KCode', 'packages/machine-lib/reference/fox-baby-beanie.kc', 1, 'blocked', 'not-encoded-by-kcode'],
    ['clean Knitout', 'packages/machine-lib/test/fixtures/machine-check-clean.k', 0, 'surface', 'checked-before-lowering'],
  ] as const)(
    'returns the documented CLI receipt and exit code for %s',
    (_name, relativePath, exitCode, state, lifecycle) => {
      const repositoryRoot = resolve('../..');
      const result = spawnSync(
        'pnpm',
        ['--silent', 'machine:check', '--', relativePath, '--json'],
        {
          cwd: repositoryRoot,
          encoding: 'utf8',
          maxBuffer: 2 * 1024 * 1024,
        },
      );

      expect(result.status, result.stderr).toBe(exitCode);
      const receipt = JSON.parse(result.stdout) as {
        readonly kind: string;
        readonly input: { readonly filename: string; readonly sha256: string };
        readonly verdict: { readonly state: string };
        readonly evidence: { readonly sourceCarrierLifecycle: string };
      };
      expect(receipt).toMatchObject({
        kind: 'kniterate-machine-check',
        input: {
          filename: relativePath.split('/').at(-1),
          sha256: expect.stringMatching(/^[0-9a-f]{64}$/),
        },
        verdict: { state },
        evidence: { sourceCarrierLifecycle: lifecycle },
      });
    },
  );

  it('returns exit 2 and JSON-only errors for unsupported and unreadable paths', () => {
    const repositoryRoot = resolve('../..');
    const unsupported = spawnSync(
      'pnpm',
      ['--silent', 'machine:check', '--', 'package.json', '--json'],
      { cwd: repositoryRoot, encoding: 'utf8' },
    );
    const unreadable = spawnSync(
      'pnpm',
      ['--silent', 'machine:check', '--', 'missing-machine-file.kc', '--json'],
      { cwd: repositoryRoot, encoding: 'utf8' },
    );

    expect(unsupported.status, unsupported.stderr).toBe(2);
    expect(JSON.parse(unsupported.stdout)).toMatchObject({
      kind: 'kniterate-machine-check',
      error: { kind: 'usage', message: 'Only .k and .kc files are supported.' },
    });
    expect(unreadable.status, unreadable.stderr).toBe(2);
    expect(JSON.parse(unreadable.stdout)).toMatchObject({
      kind: 'kniterate-machine-check',
      input: { filename: 'missing-machine-file.kc', sha256: null },
      verdict: { state: 'blocked' },
      evidence: { exactInputBytes: 'input-not-read' },
    });
  });
});

describe('authored verdict policy', () => {
  const ready: AuthoredVerdictInput = {
    compileStatus: 'ready',
    compileOk: true,
    compileError: null,
    outputStatus: 'ready',
    outputOk: true,
    outputCurrent: true,
    outputError: null,
    knitProvenEntryId: null,
  };

  it('withholds a verdict while compilation or output conversion is pending', () => {
    expect(resolveAuthoredVerdict({ ...ready, compileStatus: 'compiling', compileOk: null })).toBeNull();
    expect(resolveAuthoredVerdict({ ...ready, outputStatus: 'converting', outputOk: null })).toBeNull();
    expect(resolveAuthoredVerdict({ ...ready, outputCurrent: false })).toBeNull();
  });

  it('blocks compiler and KCode validation failures', () => {
    expect(resolveAuthoredVerdict({
      ...ready,
      compileOk: false,
      compileError: 'Carrier conflict.',
    })).toMatchObject({
      state: 'blocked',
      label: 'Blocked',
      annotation: 'Carrier conflict.',
    });
    expect(resolveAuthoredVerdict({
      ...ready,
      outputOk: false,
      outputError: 'Pass mismatch.',
    })).toMatchObject({
      state: 'blocked',
      label: 'Blocked',
      annotation: 'Pass mismatch.',
    });
  });

  it('mints Surface-proven only for current clean output', () => {
    expect(resolveAuthoredVerdict(ready)).toMatchObject({
      state: 'surface',
      label: 'Surface-proven',
      evidenceId: null,
    });
  });

  it('mints Knit-proven only for an exact physical registry match', () => {
    expect(resolveAuthoredVerdict({
      ...ready,
      knitProvenEntryId: '2026-07-12-proof',
    })).toMatchObject({
      state: 'knit',
      label: 'Knit-proven',
      evidenceId: '2026-07-12-proof',
    });
  });
});

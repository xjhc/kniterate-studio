import { describe, expect, it } from 'vitest';

import {
  compareKcDocuments,
  openMachineDocument,
  resolveAuthoredVerdict,
  type AuthoredVerdictInput,
  type OpenKCodeDocumentOptions,
} from './engine';

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
  it('requires an explicit foreign-file dialect and never guesses one', () => {
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

  it('blocks invalid or differently-declared inputs instead of guessing/falling back', () => {
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
    expect(dialectResult.summary.status).toBe('blocked');
    expect(dialectResult.windows[0]?.text).toContain('dialect mismatch');
  });
});

describe('Knitout machine document behavior', () => {
  it('opens Knitout and groups authored operations', () => {
    const document = openMachineDocument('sample.k', K);
    expect(document.kcode).toBeNull();
    expect(document.passes).toHaveLength(1);
    expect(document.passes[0]).toMatchObject({
      lineStart: 5,
      direction: '>>',
      needleSpan: 'N12',
    });
    expect(document.stats.carriers).toEqual(['2']);
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

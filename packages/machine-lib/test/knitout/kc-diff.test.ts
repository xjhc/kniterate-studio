/** Footer-only compatibility coverage plus strict emitted-KCode trace diffing. */
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  diffKc,
  diffKCodeMachineTrace,
  renderKCodeMachineTraceWindow,
  renderKCodeMachineTraceWindowFromTraces,
} from '../../src/knitout/kc-diff.js';
import { KNITERATE_7GG_KCODE_PROFILE_V1 } from '../../src/knitout/kcode/machine-profile.js';
import { parseKCodeDocument } from '../../src/knitout/kcode/parser.js';
import { projectKCodeMachineTrace } from '../../src/knitout/kcode/machine-trace.js';
import { knitoutToKCodeWithTrace } from '../../src/knitout/kniterate/to-kcode.js';

const A = ['>> Kn-Kn 2 100 440', '<< Kn-Kn 2 700 0', '>> Kn-Kn 2 700 0'].join('\n');

describe('diffKc', () => {
  it('reports pass-identical for identical streams', () => {
    const d = diffKc(A, A);
    expect(d.comparison).toBe('legacy-footer-only');
    expect(d.identical).toBe(true);
    expect(d.generatedPassCount).toBe(3);
    expect(d.referencePassCount).toBe(3);
    expect(d.firstDelta).toBeNull();
    expect(d.deltaCount).toBe(0);
  });

  it('pins the first divergent field (speed) at the right index', () => {
    const B = ['>> Kn-Kn 2 100 440', '<< Kn-Kn 2 300 0', '>> Kn-Kn 2 700 0'].join('\n');
    const d = diffKc(A, B);
    expect(d.identical).toBe(false);
    expect(d.firstDelta).toEqual({
      index: 1,
      field: 'speed',
      generated: '<< Kn-Kn 2 700 0',
      reference: '<< Kn-Kn 2 300 0',
    });
    expect(d.deltaCount).toBe(1);
  });

  it('flags a carrier divergence over speed/roller', () => {
    const B = ['>> Kn-Kn 3 100 440', '<< Kn-Kn 2 700 0', '>> Kn-Kn 2 700 0'].join('\n');
    const d = diffKc(A, B);
    expect(d.firstDelta?.field).toBe('carrier');
    expect(d.firstDelta?.index).toBe(0);
  });

  it('records a length mismatch when one side runs out', () => {
    const shorter = ['>> Kn-Kn 2 100 440', '<< Kn-Kn 2 700 0'].join('\n');
    const d = diffKc(A, shorter);
    expect(d.generatedPassCount).toBe(3);
    expect(d.referencePassCount).toBe(2);
    expect(d.firstDelta).toEqual({
      index: 2,
      field: 'length',
      generated: '>> Kn-Kn 2 700 0',
      reference: null,
    });
  });

  it('computes byte parity when requested', () => {
    expect(diffKc(A, A, { bytes: true }).byteIdentical).toBe(true);
    const withTrailer = `${A}\nHOME`;
    const d = diffKc(A, withTrailer, { bytes: true });
    expect(d.byteIdentical).toBe(false);
    expect(d.firstLineDelta?.index).toBe(3);
  });
});

const DIALECT = 'knitout-vendor' as const;
const PROFILE = KNITERATE_7GG_KCODE_PROFILE_V1;
const KNITOUT = [
  ';!knitout-2',
  ';;Machine: kniterate',
  ';;Carriers: 1 2 3 4 5 6',
  'x-stitch-number 6',
  'x-speed-number 300',
  'x-roller-advance 450',
  'in 2',
  'tuck + f40 2',
  'knit - f40 2',
  'out 2',
  '',
].join('\n');

function compileFixture(): string {
  const result = knitoutToKCodeWithTrace(KNITOUT, 'kc-diff-fixture.k');
  if (!result.ok) throw new Error(result.error);
  return result.kcode;
}

const VALID_KCODE = compileFixture();

function strictDiff(generated: string, reference: string, bytes = false) {
  return diffKCodeMachineTrace(generated, reference, {
    profile: PROFILE,
    dialect: DIALECT,
    maxDeltas: 200,
    bytes,
  });
}

function strictTrace(source: string) {
  const parsed = parseKCodeDocument(source, { profile: PROFILE, dialect: DIALECT, strict: true });
  if (!parsed.ok) throw new Error(parsed.diagnostics.map((item) => item.message).join('; '));
  return projectKCodeMachineTrace(parsed.document, PROFILE);
}

function mutateFirstLine(
  source: string,
  prefix: 'FRNT:' | 'STIF:' | 'REAR:' | 'STIR:',
  mutate: (value: string) => string,
): string {
  let changed = false;
  const output = source.replace(new RegExp(`^${prefix}(.*)$`, 'm'), (_line, value: string) => {
    changed = true;
    return `${prefix}${mutate(value)}`;
  });
  if (!changed) throw new Error(`Missing ${prefix}`);
  return output;
}

function mutateFirstFooter(
  source: string,
  mutate: (tokens: [string, string, string, string, string]) => void,
): string {
  let changed = false;
  const output = source.replace(
    /^(>>|<<) (\S+) ([0-6]) (\S+) (\S+)$/m,
    (_line, direction: string, operation: string, carrier: string, speed: string, roller: string) => {
      const tokens: [string, string, string, string, string] = [
        direction,
        operation,
        carrier,
        speed,
        roller,
      ];
      mutate(tokens);
      changed = true;
      return tokens.join(' ');
    },
  );
  if (!changed) throw new Error('Missing pass footer');
  return output;
}

function replaceAt(value: string, index: number, replacement: string): string {
  return `${value.slice(0, index)}${replacement}${value.slice(index + 1)}`;
}

function swap(value: string, a: number, b: number): string {
  const chars = [...value];
  [chars[a], chars[b]] = [chars[b]!, chars[a]!];
  return chars.join('');
}

function moveFirstFrontSelection(source: string): string {
  return mutateFirstLine(source, 'FRNT:', (value) => {
    const from = value.indexOf('-');
    if (from === -1) throw new Error('Missing front selection');
    let to = from + 40;
    while (to < value.length && value[to] !== '_') to++;
    if (to >= value.length) throw new Error('No target raster column');
    return swap(value, from, to);
  });
}

function shiftFirstMarkerOnBothBeds(source: string, marker: '/' | '2'): string {
  return (['FRNT:', 'REAR:'] as const).reduce((next, prefix) =>
    mutateFirstLine(next, prefix, (value) => {
      const index = value.indexOf(marker);
      if (index === -1 || value[index + 1] !== '.') throw new Error(`Cannot shift ${marker}`);
      return swap(value, index, index + 1);
    }), source);
}

function changeFirstPassCarrier(source: string): string {
  const withMarkers = (['FRNT:', 'REAR:'] as const).reduce((next, prefix) =>
    mutateFirstLine(next, prefix, (value) => value.replaceAll('2', '3')), source);
  return mutateFirstFooter(withMarkers, (tokens) => { tokens[2] = '3'; });
}

function mutateSelectedFrontStitch(source: string): string {
  const front = /^FRNT:(.*)$/m.exec(source)?.[1];
  if (front === undefined) throw new Error('Missing FRNT');
  const decoratedIndex = front.indexOf('-');
  if (decoratedIndex === -1) throw new Error('Missing front selection');
  const carrierMarkers = new Set(['/', '\\', '1', '2', '3', '4', '5', '6']);
  let payloadIndex = 0;
  for (let index = 0; index < decoratedIndex; index++) {
    if (!carrierMarkers.has(front[index]!)) payloadIndex++;
  }
  return mutateFirstLine(source, 'STIF:', (value) =>
    replaceAt(value, payloadIndex, value[payloadIndex] === '8' ? '7' : '8'));
}

function mutateUnselectedStitchRaw(
  source: string,
  prefix: 'STIF:' | 'STIR:',
): string {
  return mutateFirstLine(source, prefix, (value) => {
    const candidates = ['0', '1', '6', '7'];
    const index = [...value].findIndex((token, tokenIndex) =>
      tokenIndex > 20 && candidates.includes(token) && value[tokenIndex] !== '-');
    if (index === -1) throw new Error(`No raw mutation candidate in ${prefix}`);
    const replacement = value[index] === '0' ? '1' : '0';
    return replaceAt(value, index, replacement);
  });
}

function compared(generated: string, reference: string) {
  const result = strictDiff(generated, reference);
  expect(result.status).toBe('compared');
  if (result.status !== 'compared') throw new Error('Expected strict comparison');
  return result;
}

describe('diffKCodeMachineTrace', () => {
  it('proves strict trace identity and optional byte identity', () => {
    const result = strictDiff(VALID_KCODE, VALID_KCODE, true);
    expect(result).toMatchObject({
      comparison: 'strict-machine-trace-v1',
      status: 'compared',
      identical: true,
      byteIdentical: true,
      firstLineDelta: null,
      firstDelta: null,
      deltaCount: 0,
    });
    expect(result.generatedInput).toMatchObject({ ok: true, diagnostics: [], projectionError: null });
  });

  it('blocks either invalid input instead of degrading to footer comparison', () => {
    const generatedInvalid = strictDiff(A, VALID_KCODE);
    expect(generatedInvalid).toMatchObject({
      status: 'blocked',
      identical: false,
      firstDelta: null,
      deltaCount: 0,
    });
    expect(generatedInvalid.generatedInput.ok).toBe(false);
    expect(generatedInvalid.generatedInput.diagnostics.map((item) => item.rule)).toEqual(
      expect.arrayContaining(['kcode.missing-home', 'kcode.missing-initial-rack']),
    );
    expect(generatedInvalid.referenceInput.ok).toBe(true);
  });

  it('does not call N40 and N80-equivalent raster selections pass-identical', () => {
    const moved = moveFirstFrontSelection(VALID_KCODE);
    const result = compared(VALID_KCODE, moved);
    const fields = result.deltas.map((delta) => delta.field);
    expect(result.identical).toBe(false);
    expect(fields).toEqual(expect.arrayContaining([
      'selections.front[0].payloadIndex',
      'selections.front[0].kcodeColumn',
      'selections.front[0].traceCoordinate',
      'actions[0].at.traceCoordinate',
      'raw.FRNT',
    ]));
  });

  it('compares controls, stops, selectors, actions, and all raw pass fields', () => {
    const cases: Array<{ source: string; fields: string[] }> = [
      {
        source: VALID_KCODE.replace('RACK:0\n', 'RACK:0\nRACK:0.5\n'),
        fields: ['rack'],
      },
      {
        source: mutateFirstFooter(VALID_KCODE, (tokens) => { tokens[0] = tokens[0] === '>>' ? '<<' : '>>'; }),
        fields: ['direction', 'raw.footer'],
      },
      {
        source: mutateFirstFooter(VALID_KCODE, (tokens) => { tokens[1] = 'Kn-Tu'; }),
        fields: ['operation', 'actions[0].kind', 'raw.footer'],
      },
      {
        source: changeFirstPassCarrier(VALID_KCODE),
        fields: ['carrier', 'raw.FRNT', 'raw.REAR', 'raw.footer'],
      },
      {
        source: mutateFirstFooter(VALID_KCODE, (tokens) => { tokens[3] = '0300'; }),
        fields: ['speedRaw', 'raw.footer'],
      },
      {
        source: mutateFirstFooter(VALID_KCODE, (tokens) => { tokens[3] = '301'; }),
        fields: ['speedRaw', 'speed', 'raw.footer'],
      },
      {
        source: mutateFirstFooter(VALID_KCODE, (tokens) => { tokens[4] = '451'; }),
        fields: ['rollerRaw', 'roller', 'raw.footer'],
      },
      {
        source: shiftFirstMarkerOnBothBeds(VALID_KCODE, '/'),
        fields: ['carriageStops.left', 'raw.FRNT', 'raw.REAR'],
      },
      {
        source: shiftFirstMarkerOnBothBeds(VALID_KCODE, '2'),
        fields: ['carrierStops.left', 'raw.FRNT', 'raw.REAR'],
      },
      {
        source: mutateSelectedFrontStitch(VALID_KCODE),
        fields: [
          'selections.front[0].stitchSelector.token',
          'selections.front[0].stitchSelector.encodedValue',
          'actions[0].at.stitchSelector.token',
          'raw.STIF',
        ],
      },
      { source: mutateUnselectedStitchRaw(VALID_KCODE, 'STIF:'), fields: ['raw.STIF'] },
      { source: mutateUnselectedStitchRaw(VALID_KCODE, 'STIR:'), fields: ['raw.STIR'] },
    ];

    for (const testCase of cases) {
      const result = compared(VALID_KCODE, testCase.source);
      expect(result.identical, testCase.fields.join(', ')).toBe(false);
      expect(result.deltas.map((delta) => delta.field)).toEqual(
        expect.arrayContaining(testCase.fields),
      );
    }
  });

  it('keeps semantic trace identity separate from exact source bytes', () => {
    const commentOnly = VALID_KCODE.replace('RACK:0\n', 'RACK:0\n// semantically inert note\n');
    const result = strictDiff(VALID_KCODE, commentOnly, true);
    expect(result).toMatchObject({
      status: 'compared',
      identical: true,
      byteIdentical: false,
    });
    expect(result.firstLineDelta).not.toBeNull();
  });

  it('compares ordered transient and redundant rack commands even when pass rack is unchanged', () => {
    const transientRack = VALID_KCODE.replace('RACK:0\n', 'RACK:0\nRACK:1\nRACK:0\n');
    const result = compared(VALID_KCODE, transientRack);

    expect(result.identical).toBe(false);
    expect(result.deltas.map((delta) => delta.field)).toEqual(expect.arrayContaining([
      'rackCommands.length',
      'rackCommands[1]',
      'rackCommands[2]',
    ]));
    expect(result.deltas.some((delta) => delta.field === 'rack')).toBe(false);

    const rendered = renderKCodeMachineTraceWindowFromTraces(
      strictTrace(VALID_KCODE),
      strictTrace(transientRack),
      0,
      { context: 0, deltas: result.deltas },
    );
    expect(rendered).toContain('rack commands generated:');
    expect(rendered).toContain('rack commands reference:');
    expect(rendered).toContain('raw="1" numeric=1');
    expect(rendered).toContain('rackCommands[1]');
  });

  it('renders rack, carriage/carrier stops, selections, and actions', () => {
    const moved = moveFirstFrontSelection(VALID_KCODE);
    const rendered = renderKCodeMachineTraceWindow(VALID_KCODE, moved, 0, {
      profile: PROFILE,
      dialect: DIALECT,
      context: 0,
    });
    expect(rendered).toContain('STRICT MACHINE-TRACE V1 COMPARISON');
    expect(rendered).toContain('rack=');
    expect(rendered).toContain('carriage=');
    expect(rendered).toContain('carrier=');
    expect(rendered).toContain('select=');
    expect(rendered).toContain('actions=');
  });

  it('renders cached trace windows with exact raw field paths and values', () => {
    const moved = moveFirstFrontSelection(VALID_KCODE);
    const result = compared(VALID_KCODE, moved);
    const rendered = renderKCodeMachineTraceWindowFromTraces(
      strictTrace(VALID_KCODE),
      strictTrace(moved),
      0,
      { context: 0, deltas: result.deltas },
    );

    expect(rendered).toContain('exact field deltas');
    expect(rendered).toContain('raw.FRNT');
    expect(rendered).toContain('generated: "');
    expect(rendered).toContain('reference: "');
  });

  it('retains exact raw values in a rendered pass even when the delta list is capped', () => {
    const moved = moveFirstFrontSelection(VALID_KCODE);
    const capped = diffKCodeMachineTrace(VALID_KCODE, moved, {
      profile: PROFILE,
      dialect: DIALECT,
      maxDeltas: 1,
    });
    if (capped.status !== 'compared') throw new Error('Expected compared result');
    expect(capped.deltaCount).toBeGreaterThan(capped.deltas.length);
    expect(capped.deltas.map((delta) => delta.field)).not.toContain('raw.FRNT');

    const rendered = renderKCodeMachineTraceWindowFromTraces(
      strictTrace(VALID_KCODE),
      strictTrace(moved),
      0,
      { context: 0, deltas: capped.deltas },
    );
    expect(rendered).toContain('raw.FRNT');
    expect(rendered).toContain('generated: "');
    expect(rendered).toContain('reference: "');
  });

  it('property-checks identity, symmetry, and deterministic numeric mutations', () => {
    fc.assert(fc.property(
      fc.integer({ min: -500, max: 999 }).filter((value) => value !== 450),
      (roller) => {
        const mutated = mutateFirstFooter(VALID_KCODE, (tokens) => {
          tokens[4] = String(roller);
        });
        const identity = compared(mutated, mutated);
        expect(identity.identical).toBe(true);

        const forward = compared(VALID_KCODE, mutated);
        const reverse = compared(mutated, VALID_KCODE);
        expect(forward.identical).toBe(false);
        expect(reverse.identical).toBe(false);
        expect(reverse.deltaCount).toBe(forward.deltaCount);
        expect(reverse.deltas.map((delta) => delta.field)).toEqual(
          forward.deltas.map((delta) => delta.field),
        );
        for (let index = 0; index < forward.deltas.length; index++) {
          expect(reverse.deltas[index]!.generated).toBe(forward.deltas[index]!.reference);
          expect(reverse.deltas[index]!.reference).toBe(forward.deltas[index]!.generated);
        }
      },
    ), { seed: 0x4b434446, numRuns: 100 });
  });
});

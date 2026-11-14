import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildSplitSwatch } from '../../../scripts/experiments/split-swatch';
import { withEdgeTrialCastOn } from '../../../scripts/experiments/edge-trial-caston';
import { parseKnitoutProgram } from '../../../packages/machine-lib/src/knitout/parser';
import { writeKnitoutProgram } from '../../../packages/machine-lib/src/knitout/emitter';
import { knitoutToKCodeWithTrace } from '../../../packages/machine-lib/src/knitout/kniterate/to-kcode';
import { auditTraceV1, parseKCodeDocument, projectKCodeMachineTrace, KNITERATE_7GG_KCODE_PROFILE_V2 as profile, type MachineTracePassV1 } from '../../../packages/machine-lib/src/browser';

const successfulSha256 = '2c5ef66ef99610d933f9fbdf7998d6dad242e67402ad06ba61201684ee72a8ac';

function successfulTrial() {
  const source = readFileSync(new URL('../../../fixtures/experiments/edge-swatch-original.k', import.meta.url), 'utf8');
  expect(createHash('sha256').update(source).digest('hex')).toBe('890992f60693ddb23e9baddf9fb9167ef72a248f6ea399f8f33aa841168a341a');
  const parsed = parseKnitoutProgram(source);
  expect(parsed.issues).toEqual([]);
  const output = knitoutToKCodeWithTrace(writeKnitoutProgram(withEdgeTrialCastOn(parsed.program, 107, 146, 105)), 'program.k');
  if (!output.ok) throw new Error(output.error);
  expect(createHash('sha256').update(output.kcode).digest('hex')).toBe(successfulSha256);
  const document = parseKCodeDocument(output.kcode, { profile, dialect: 'knitout-vendor', strict: true });
  expect(document.ok).toBe(true);
  return projectKCodeMachineTrace(document.document, profile);
}

function normalized(pass: MachineTracePassV1, origin: number) {
  const selection = (at: MachineTracePassV1['selections']['front'][number]) => ({ bed: at.bed, needle: at.traceCoordinate - origin, stitch: at.stitchSelector.encodedValue });
  return {
    direction: pass.direction, operation: pass.operation, carrier: pass.carrier, rack: pass.rack, speed: pass.speed, roller: pass.roller,
    actions: pass.actions.map((action) => 'at' in action ? { kind: action.kind, at: selection(action.at) }
      : 'source' in action ? { kind: action.kind, source: selection(action.source), target: selection(action.target) } : action.kind),
  };
}

describe('split-increase operator swatch', () => {
  it('reproduces the successful edge file and keeps all six cast-on passes in the new swatch', async () => {
    const historical = successfulTrial();
    expect(historical.passes).toHaveLength(268);
    const { kcode } = await buildSplitSwatch();
    expect(kcode.ok).toBe(true);
    const trace = kcode.trace!;
    const zigzag = trace.passes.findIndex((pass) => pass.carrier === '3' && pass.rack === 0.5 && pass.selections.front.length === 40 && pass.selections.rear.length === 40);
    expect(zigzag).toBeGreaterThan(0);
    const origin = Math.min(...trace.passes[zigzag]!.selections.front.map((at) => at.traceCoordinate));
    const historicalOrigin = Math.min(...historical.passes[105]!.selections.front.map((at) => at.traceCoordinate));
    expect(trace.passes.slice(zigzag, zigzag + 6).map((pass) => normalized(pass, origin)))
      .toEqual(historical.passes.slice(105, 111).map((pass) => normalized(pass, historicalOrigin)));
  });

  it('covers both edges and directions with captured forms, supported loops and parked idle carriers', async () => {
    const { events, kcode } = await buildSplitSwatch();
    expect(kcode.ok).toBe(true);
    expect(kcode.validation?.diagnostics.filter((item) => item.severity === 'error')).toEqual([]);
    expect(kcode.safety?.diagnostics).toEqual([]);
    const trace = kcode.trace!;
    expect(trace.passes.length).toBeLessThanOrEqual(280);
    const audit = auditTraceV1(trace);
    expect(audit.ok).toBe(true);
    const forms = new Set<string>();
    for (const event of events) {
      const precedingRow = kcode.rowPasses.find((row) => row.rowId === `row-${event.row - 1}`)!;
      const splits = precedingRow.passIndices.map((index) => trace.passes[index]!).filter((pass) => pass.actions.some((action) => action.kind === 'split'));
      expect(splits).toHaveLength(1);
      const pass = splits[0]!;
      expect(pass.direction).toBe(event.splitDirection);
      expect(pass.rack).toBe(0);
      const sources = pass.actions.flatMap((action) => action.kind === 'split' ? [action.source.traceCoordinate] : []).sort((a, b) => a - b);
      expect(sources).toEqual(event.edges.map((edge) => edge.splitNeedle + kcode.coordinateBridge!.offsets.compilerProjectToTraceCoordinate).sort((a, b) => a - b));
      if (event.side === 'both') expect(pass.direction).toBe('<<');
      for (const edge of event.edges) forms.add(`${event.fashion}/${edge.side}/${pass.direction}`);
    }
    expect([...forms].sort()).toEqual([1, 4].flatMap((fashion) => ['left', 'right'].flatMap((edge) => ['<<', '>>'].map((direction) => `${fashion}/${edge}/${direction}`))).sort());
    expect(events.filter((event) => event.side === 'both')).toHaveLength(4);
    const bodyPasses = kcode.rowPasses.flatMap((row) => row.passIndices);
    expect(trace.passes.slice(Math.min(...bodyPasses), Math.max(...bodyPasses) + 1).some((pass) => ['1', '6'].includes(pass.carrier))).toBe(false);
  });
});

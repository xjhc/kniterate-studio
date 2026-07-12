/**
 * Phase 4b (2026-05-24): cross-section predicted-vs-vendor observability.
 *
 * The chart compile path produces `RunArtifact.predictedPasses` (a
 * concatenation of every per-section CarriageSimulator's trace, with
 * runtime `nextDirection` threaded across boundaries via
 * `initialNextDirection`/`finalNextDirection`). This test takes the
 * same compile, runs the emitted knitout through the real vendor
 * (`knitoutToKCode`), parses the .kc, and reports the agreement prefix.
 *
 * NOT a whole-program gate. Phase 4b closes the cross-section
 * direction drift that Phase 4a couldn't see, but it does NOT solve
 * the larger gap: raw ops emitted between sections (back-bed clear,
 * inter-section carrier in/out, body-settings re-assert) bypass the
 * simulator entirely, so the runtime state vendor uses to insert
 * auto-moves diverges from sim's logical-pass list at those points.
 *
 * Closing those gaps is the simulator-as-emitter cutover (Phase E of
 * `docs/carriage-simulator-plan.md`) — every op goes through one
 * program-wide sim. At that point this test can be promoted to strict
 * equality.
 *
 * What we DO assert: an agreement prefix beyond the first sim-cutover
 * section. Phase 4a/4b should keep this prefix non-trivial; any
 * regression below that means an emitter dropped the threaded value
 * or a new pre-body raw-op got introduced.
 */
import { describe, expect, it } from 'vitest';
import { compileToRunArtifact } from '../../src/knitout/run-artifact.js';
import { writeKnitoutProgram } from '../../src/knitout/emitter.js';
import { knitoutToKCode } from '../../src/knitout/kniterate/to-kcode.js';
import { parseKcPasses } from '../../src/knitout/sim/kc-parse.js';
import {
  buildPunchcardChart,
  stripePunchcardTile,
} from '../../src/colorwork/punchcard.js';
import {
  DEFAULT_KEY_PALETTE,
  KEY_ID_KNIT_DEFAULT,
  type KnitlabChartState,
  type KnitlabKeyDefinition,
} from '../../src/colorwork/knitlab1-contract.js';
import type { YarnBinding } from '../../src/knitout/types.js';
import { predictedVsParsedDelta } from './reference-kc/diagnostics.js';

const KNIT_BINDING: YarnBinding = {
  keyId: KEY_ID_KNIT_DEFAULT,
  carrier: '2',
  name: 'main',
};

const FAIRISLE_PALETTE: KnitlabKeyDefinition[] = [
  ...DEFAULT_KEY_PALETTE,
  {
    id: 'navy',
    name: 'Navy',
    width: 1,
    height: 1,
    backgroundColor: '#0a1f44',
    symbolColor: '#fff',
    cells: [[null]],
  },
];

const FAIRISLE_BINDINGS: YarnBinding[] = [
  { keyId: KEY_ID_KNIT_DEFAULT, carrier: '4', name: 'cream' },
  { keyId: 'navy', carrier: '3', name: 'navy' },
];

function smallChart(rows = 6, cols = 6): KnitlabChartState {
  return {
    id: 'pred-v-vendor',
    rows,
    cols,
    orientation: 'bottom-up',
    name: 'pred-v-vendor',
    displaySettings: { rowCountVisibility: 'right', colCountVisibility: 'bottom' },
    layers: [{ id: 'base', name: 'Base', isVisible: true, grid: {}, keyPlacements: [] }],
    activeLayerId: 'base',
  };
}

describe('Phase 4b: cross-section predicted vs vendor (observability)', () => {
  it('chart compile predictedPasses agrees with vendor for a non-trivial prefix', () => {
    const artifact = compileToRunArtifact({
      chart: smallChart(),
      keyPalette: DEFAULT_KEY_PALETTE,
      yarnBindings: [KNIT_BINDING],
    });
    expect(artifact.ok).toBe(true);
    expect(artifact.program).toBeDefined();

    const knitoutText = writeKnitoutProgram(artifact.program!);
    const vendorResult = knitoutToKCode(knitoutText);
    if (!vendorResult.ok || !vendorResult.kcode) {
      throw new Error(
        `vendor knitoutToKCode failed:\n${vendorResult.stderr}\n--- knitout ---\n${knitoutText}`,
      );
    }
    const vendorPasses = parseKcPasses(vendorResult.kcode);
    const predicted = artifact.predictedPasses;

    expect(predicted.length).toBeGreaterThan(0);
    expect(vendorPasses.length).toBeGreaterThan(0);

    const firstDelta = predictedVsParsedDelta(predicted, vendorPasses);
    const agreementPrefix = firstDelta ?? Math.min(predicted.length, vendorPasses.length);
    // Phase 4b adds the cross-section direction handoff; Phase 4c
    // (2026-05-24) extends that with raw-op `nextDirection` accounting
    // for the carrierOut releases / back-bed-clear xfers / settings
    // re-asserts emitted between sim-backed sections. Together they
    // bring the agreement prefix to ~83 passes on this small chart
    // (was capped well below that before Phase 4c). We pin at > 50 to
    // leave a small buffer for legitimate sim improvements while
    // catching any regression that drops back below the Phase 4c
    // baseline. The remaining divergence past the prefix is the
    // bind-off section's auto-move vs no-carrier choreography — that
    // closes when Phase E (single-sim cutover) lands.
    expect(agreementPrefix).toBeGreaterThan(50);
  });

  it('predictedVsParsedDelta returns null when arrays are structurally equal', () => {
    // The helper itself: sanity check on a tiny synthetic identical pair.
    const sample = parseKcPasses(['>> Kn-Kn 2 150 450', '<< Kn-Kn 2 150 450'].join('\n'));
    // PredictedPass shape mimicking the same two passes (auto-move flags
    // wouldn't matter for the comparison — only direction/type/carrier).
    const predicted = sample.map(p => ({
      type: p.type,
      direction: p.direction,
      carriers: (p.carrier === '0' ? [] : [p.carrier as '1' | '2' | '3' | '4' | '5' | '6']),
      isAutoMove: false,
      isDecay: false,
      isPark: false,
      speed: p.speed,
      roller: p.roller,
    }));
    expect(predictedVsParsedDelta(predicted, sample)).toBeNull();
  });

  it('direction-aware floats body ordering stops row-scaling auto-moves without carrier intro', () => {
    const counts = [4, 6, 8].map(rows => fairisleAutoMoveCounts(rows));

    // Phase E follow-up (2026-05-25): the floats walker now chooses the
    // next carrier whose physical side matches vendor `nextDirection`
    // where possible. On the plain floats path, that removes the old
    // row-scaling body auto-moves; both prediction and vendor output
    // stay flat as rows grow.
    expect(counts[1]!.predictedAutoMoves).toBe(counts[0]!.predictedAutoMoves);
    expect(counts[2]!.predictedAutoMoves).toBe(counts[1]!.predictedAutoMoves);
    expect(counts[1]!.vendorNoCarrierMoves).toBe(counts[0]!.vendorNoCarrierMoves);
    expect(counts[2]!.vendorNoCarrierMoves).toBe(counts[1]!.vendorNoCarrierMoves);
  });

  it('predicts the Customist fairisle reference auto-move cadence as rows grow', () => {
    const counts = [4, 6, 8].map(rows => fairisleAutoMoveCounts(rows, true));

    // Slice B parity intentionally follows Customist's row-scaling
    // no-carrier returns; the recipe no longer claims a fixed auto-move
    // ceiling. The predictor should scale in the same direction as the
    // vendor trace rather than flattening these reference moves away.
    expect(counts[1]!.predictedAutoMoves).toBeGreaterThan(counts[0]!.predictedAutoMoves);
    expect(counts[2]!.predictedAutoMoves).toBeGreaterThan(counts[1]!.predictedAutoMoves);
    expect(counts[1]!.vendorNoCarrierMoves).toBeGreaterThan(counts[0]!.vendorNoCarrierMoves);
    expect(counts[2]!.vendorNoCarrierMoves).toBeGreaterThan(counts[1]!.vendorNoCarrierMoves);
  });
});

function fairisleAutoMoveCounts(rows: number, fairisleCarrierIntro = false): {
  predictedAutoMoves: number;
  sourceCounts: Record<string, number>;
  vendorNoCarrierMoves: number;
} {
  const chart = buildPunchcardChart({
    cols: 16,
    rows,
    tile: stripePunchcardTile(3, 5, KEY_ID_KNIT_DEFAULT, 'navy'),
  });
  const artifact = compileToRunArtifact({
    chart,
    keyPalette: FAIRISLE_PALETTE,
    yarnBindings: FAIRISLE_BINDINGS,
    needleOffset: 50,
    wastePasses: 4,
    backBedStyle: 'floats',
    bindOff: 'fairisle-park-bindoff',
    developerMode: true,
    fairisleCarrierIntro,
  });
  expect(artifact.ok).toBe(true);
  expect(artifact.program).toBeDefined();

  const vendorResult = knitoutToKCode(writeKnitoutProgram(artifact.program!));
  if (!vendorResult.ok || !vendorResult.kcode) {
    throw new Error(
      `vendor knitoutToKCode failed:\n${vendorResult.stderr}`,
    );
  }
  const vendorPasses = parseKcPasses(vendorResult.kcode);
  const predictedAutoMoves = artifact.predictedPasses.filter(p => p.isAutoMove);
  const sourceCounts: Record<string, number> = {};
  for (const pass of predictedAutoMoves) {
    const source = pass.source ?? 'unknown';
    sourceCounts[source] = (sourceCounts[source] ?? 0) + 1;
  }

  return {
    predictedAutoMoves: predictedAutoMoves.length,
    sourceCounts,
    vendorNoCarrierMoves: vendorPasses.filter(p => p.type === 'Kn-Kn' && p.carrier === '0').length,
  };
}

/**
 * Compile route for the faithful Sophie leaf stamp (`KEY_ID_SOPHIE_LEAF`).
 *
 * Unlike the generic shaped tube (`tube-chart.ts`), this does NOT lower to
 * knitout for the vendor converter — the vendor re-schedules transfers, which
 * breaks sophie's strict sequential transport walks (see
 * docs/sophie-leaf-fidelity.md). Instead it emits the EXACT captured Sophie
 * choreography directly as `.kc` text (`renderSophieKc` over
 * `emitSophieLeafTemplate`), and returns it as a machine artifact
 * (`CustomOpChartResult.kcText`) the export wizard packages verbatim.
 *
 * A fixed validated template: the painted footprint is a placeholder/trigger,
 * not a parameter. `needleOffset` shifts the whole leaf across the bed; the
 * output is always Sophie's leaf. For a custom leaf, use the `◊` shaped-tube key.
 *
 * Carrier/stitch semantics: the CARRIER is fixed at sophie's captured values
 * (3 for knits/tucks, 0 for transfers + the bind-off drop) — the faithful
 * replay is on a single body yarn and is not re-carrierable here. The one
 * tunable structural setting is `stitchNumber` (the STIF/STIR rows). Everything
 * else (speed/roller, carrier-position markers, waste framing) is carriage
 * state, out of scope for this structural artifact.
 */

import {
  KEY_ID_SOPHIE_LEAF,
  type KnitlabChartState,
  type KnitlabKeyDefinition,
} from '../../colorwork/knitlab1-contract.js';
import { projectChart } from '../../chart-core/projection.js';
import { emitSophieLeafTemplate } from '../sophie/replay.js';
import { renderSophieKc } from '../sophie/render-kc.js';
import type { ValidationMessage } from '../../validators/knitout-program.js';

export interface CompileSophieLeafInput {
  chart: KnitlabChartState;
  keyPalette: KnitlabKeyDefinition[];
  /** Shifts the whole leaf across the bed (added to the validated base edge). */
  needleOffset?: number;
  stitchNumber?: number;
}

export interface CompileSophieLeafResult {
  ok: boolean;
  /** Direct `.kc` text — bypasses the vendor transfer scheduler. */
  kcText?: string;
  messages: ValidationMessage[];
}

/** True when any cell in the chart is painted with the Sophie-leaf key. */
export function chartIsSophieLeaf(
  chart: KnitlabChartState,
  keyPalette: readonly KnitlabKeyDefinition[],
): boolean {
  if (!keyPalette.some(k => k.id === KEY_ID_SOPHIE_LEAF)) return false;
  let projection: ReturnType<typeof projectChart>;
  try {
    projection = projectChart(chart, keyPalette);
  } catch {
    return false;
  }
  for (let r = 0; r < projection.rows; r++) {
    for (let c = 0; c < projection.cols; c++) {
      if (projection.cellAt(r, c).keyId === KEY_ID_SOPHIE_LEAF) return true;
    }
  }
  return false;
}

/**
 * Render the faithful Sophie leaf to direct `.kc`. The chart only triggers and
 * positions (via `needleOffset`) — the emitted choreography is always sophie's
 * validated artifact, structurally identical to reference/sophie.kc.
 */
export function compileSophieLeafChart(input: CompileSophieLeafInput): CompileSophieLeafResult {
  const offset = input.needleOffset ?? 0;
  const leaf = emitSophieLeafTemplate(offset);
  // The leaf grows leftward from the base edge, so a too-negative needleOffset
  // pushes operated needles below 0. The direct-.kc path has no KnitoutProgram
  // for the normal validator to catch this, and renderSophieKc would SILENTLY
  // drop a negative needle from the bed string — so gate it explicitly here.
  let minNeedle = Infinity;
  for (const p of leaf) {
    for (const n of p.f) if (n < minNeedle) minNeedle = n;
    for (const n of p.r) if (n < minNeedle) minNeedle = n;
  }
  if (minNeedle < 0) {
    return {
      ok: false,
      messages: [{
        severity: 'error',
        rule: 'sophie-leaf-needle-offset',
        message: `needleOffset ${offset} places the Sophie leaf off the left of the bed (min needle ${minNeedle}); use an offset ≥ ${offset - minNeedle}.`,
      }],
    };
  }
  const kcText = renderSophieKc(
    leaf,
    input.stitchNumber !== undefined ? { stitchNumber: input.stitchNumber } : {},
  );
  return { ok: true, kcText, messages: [] };
}

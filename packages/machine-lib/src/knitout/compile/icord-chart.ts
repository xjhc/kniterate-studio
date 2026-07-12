/**
 * Compile route for traveling-i-cord charts.
 *
 * An i-cord chart has no background fabric — the painted i-cord path IS
 * the design (exactly like `reference/sophie.kc`). Rather than route
 * through the stockinette walker, this entry traces the painted path
 * (`icordPathFromChart`) and emits the cord choreography directly
 * (`emitICord`), wrapping it with the carrier-in / carrier-out and
 * machine-setting headers needed for a standalone `.k` / `.kc` export.
 *
 * `chartIsICord` lets a caller (CLI, wizard) detect an i-cord chart and
 * dispatch here instead of `compileChartToKnitout`.
 */

import {
  KEY_ID_ICORD,
  type KnitlabChartState,
  type KnitlabKeyDefinition,
} from '../../colorwork/knitlab1-contract.js';
import { projectChart } from '../../chart-core/projection.js';
import {
  icordPathFromChart,
  type IcordTraceOptions,
} from '../../colorwork/icord-path-from-chart.js';
import { emitICord } from '../passes/icord.js';
import { carrierIn, carrierOut, type CarrierId, type KnitoutOp, type KnitoutProgram } from '../types.js';
import type { ValidationMessage } from '../../validators/knitout-program.js';

export interface CompileICordInput {
  chart: KnitlabChartState;
  keyPalette: KnitlabKeyDefinition[];
  /** Carrier that knits the cord. Default '3' (sophie's main carrier). */
  carrier?: CarrierId;
  /** Cord circumference / knit-rounds-per-row trace options. */
  trace?: IcordTraceOptions;
  /** Knit / transfer pass tuning (defaults match sophie: 300/450, 60). */
  knitSpeed?: number;
  knitRoller?: number;
  xferSpeed?: number;
  stitchNumber?: number;
  /** Needle offset added to every painted column. Default 0. */
  needleOffset?: number;
  gauge?: number;
}

export interface CompileICordResult {
  ok: boolean;
  program?: KnitoutProgram;
  /** Ordered cord waypoints (for tech-pack / debug). */
  path?: { row: number; col: number }[];
  messages: ValidationMessage[];
}

/** True when any cell in the chart is painted with the i-cord key. */
export function chartIsICord(
  chart: KnitlabChartState,
  keyPalette: readonly KnitlabKeyDefinition[],
): boolean {
  if (!keyPalette.some(k => k.id === KEY_ID_ICORD)) return false;
  let projection: ReturnType<typeof projectChart>;
  try {
    projection = projectChart(chart, keyPalette);
  } catch {
    return false;
  }
  for (let r = 0; r < projection.rows; r++) {
    for (let c = 0; c < projection.cols; c++) {
      if (projection.cellAt(r, c).keyId === KEY_ID_ICORD) return true;
    }
  }
  return false;
}

export function compileICordChartToKnitout(input: CompileICordInput): CompileICordResult {
  const carrier = input.carrier ?? '3';
  const offset = input.needleOffset ?? 0;

  const trace = icordPathFromChart(input.chart, input.keyPalette, input.trace);
  if (!trace.ok || !trace.spec) {
    return { ok: false, messages: trace.messages, path: trace.path };
  }

  const body = emitICord({
    carrier,
    startCol: trace.spec.startCol + offset,
    width: trace.spec.width,
    steps: trace.spec.steps,
    knitSpeed: input.knitSpeed,
    knitRoller: input.knitRoller,
    xferSpeed: input.xferSpeed,
    stitchNumber: input.stitchNumber,
  });

  const ops: KnitoutOp[] = [carrierIn(carrier), ...body, carrierOut(carrier)];
  const program: KnitoutProgram = {
    version: 2,
    carriers: ['1', '2', '3', '4', '5', '6'],
    machine: 'kniterate',
    gauge: input.gauge ?? 7,
    yarns: { [carrier]: 'i-cord yarn' },
    kniterate: {
      stitchNumber: input.stitchNumber ?? 6,
      speedNumber: input.knitSpeed ?? 300,
      rollerAdvance: input.knitRoller ?? 450,
    },
    ops,
  };

  return { ok: true, program, path: trace.path, messages: trace.messages };
}

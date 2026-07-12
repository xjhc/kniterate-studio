/**
 * Compile route for shaped-tube (leaf) charts.
 *
 * The painted outline IS the tube — there's no background fabric. This
 * reads the outline into a width schedule (`tubeScheduleFromChart`) and
 * emits the full-bed ping-pong tube (`emitShapedTube`), wrapped with the
 * carrier-in/out + headers for a standalone `.k` / `.kc` export. Mirrors
 * the i-cord route; both register in the custom-op dispatch table.
 */

import {
  KEY_ID_TUBE_KNIT,
  type KnitlabChartState,
  type KnitlabKeyDefinition,
} from '../../colorwork/knitlab1-contract.js';
import { projectChart } from '../../chart-core/projection.js';
import { tubeScheduleFromChart } from '../../colorwork/tube-schedule-from-chart.js';
import { emitShapedTube } from '../passes/shaped-tube.js';
import { carrierIn, carrierOut, type CarrierId, type KnitoutOp, type KnitoutProgram } from '../types.js';
import type { ValidationMessage } from '../../validators/knitout-program.js';

export interface CompileTubeInput {
  chart: KnitlabChartState;
  keyPalette: KnitlabKeyDefinition[];
  carrier?: CarrierId;
  knitSpeed?: number;
  knitRoller?: number;
  xferSpeed?: number;
  stitchNumber?: number;
  /** Needle offset added to the painted columns. Default 0. */
  needleOffset?: number;
  gauge?: number;
}

export interface CompileTubeResult {
  ok: boolean;
  program?: KnitoutProgram;
  schedule?: number[];
  messages: ValidationMessage[];
}

/** True when any cell in the chart is painted with the shaped-tube key. */
export function chartIsTube(
  chart: KnitlabChartState,
  keyPalette: readonly KnitlabKeyDefinition[],
): boolean {
  if (!keyPalette.some(k => k.id === KEY_ID_TUBE_KNIT)) return false;
  let projection: ReturnType<typeof projectChart>;
  try {
    projection = projectChart(chart, keyPalette);
  } catch {
    return false;
  }
  for (let r = 0; r < projection.rows; r++) {
    for (let c = 0; c < projection.cols; c++) {
      if (projection.cellAt(r, c).keyId === KEY_ID_TUBE_KNIT) return true;
    }
  }
  return false;
}

export function compileTubeChartToKnitout(input: CompileTubeInput): CompileTubeResult {
  const carrier = input.carrier ?? '3';
  const offset = input.needleOffset ?? 0;

  const trace = tubeScheduleFromChart(input.chart, input.keyPalette);
  if (!trace.ok || !trace.schedule || trace.anchorCol === undefined) {
    return { ok: false, messages: trace.messages };
  }

  const body = emitShapedTube({
    carrier,
    anchorCol: trace.anchorCol + offset,
    schedule: trace.schedule,
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
    yarns: { [carrier]: 'leaf yarn' },
    kniterate: {
      stitchNumber: input.stitchNumber ?? 6,
      speedNumber: input.knitSpeed ?? 300,
      rollerAdvance: input.knitRoller ?? 450,
    },
    ops,
  };

  return { ok: true, program, schedule: trace.schedule, messages: trace.messages };
}

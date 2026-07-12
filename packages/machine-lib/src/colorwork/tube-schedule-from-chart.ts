/**
 * Reads a painted shaped-tube outline into a width schedule for
 * `emitShapedTube`.
 *
 * Authoring model: each chart row is one tube round. The painted
 * `KEY_ID_TUBE_KNIT` cells in that row span the tube's width; their
 * rightmost column is the fixed spine edge (every row shares it). Row 0
 * of the projection is the cast-on round; the schedule runs bottom-up.
 */

import { projectChart } from '../chart-core/projection.js';
import {
  KEY_ID_TUBE_KNIT,
  type KnitlabChartState,
  type KnitlabKeyDefinition,
} from './knitlab1-contract.js';

export interface TubeTraceMessage {
  severity: 'error' | 'warning';
  rule: string;
  message: string;
}

export interface TubeTraceResult {
  ok: boolean;
  /** Width (stitch count) per round, bottom-up. */
  schedule?: number[];
  /** The fixed spine column (rightmost painted tube column). */
  anchorCol?: number;
  messages: TubeTraceMessage[];
}

export function tubeScheduleFromChart(
  chart: KnitlabChartState,
  keyPalette: readonly KnitlabKeyDefinition[],
): TubeTraceResult {
  const messages: TubeTraceMessage[] = [];
  let projection: ReturnType<typeof projectChart>;
  try {
    projection = projectChart(chart, keyPalette);
  } catch (e) {
    messages.push({ severity: 'error', rule: 'tube-projection-failed', message: String(e) });
    return { ok: false, messages };
  }
  const { rows, cols } = projection;

  const schedule: number[] = [];
  let anchorCol = -1;
  let firstRow = -1, lastRow = -1;
  for (let r = 0; r < rows; r++) {
    let count = 0, rightmost = -1;
    for (let c = 0; c < cols; c++) {
      if (projection.cellAt(r, c).keyId === KEY_ID_TUBE_KNIT) {
        count++;
        if (c > rightmost) rightmost = c;
      }
    }
    if (count === 0) continue;
    if (firstRow < 0) firstRow = r;
    lastRow = r;
    schedule.push(count);
    if (rightmost > anchorCol) anchorCol = rightmost;
  }

  if (schedule.length === 0) {
    messages.push({ severity: 'error', rule: 'tube-empty', message: 'No shaped-tube cells painted.' });
    return { ok: false, messages };
  }
  // Rows between the first and last tube row must all be tube rows (a
  // contiguous outline); a gap means a broken outline.
  if (lastRow - firstRow + 1 !== schedule.length) {
    messages.push({
      severity: 'error',
      rule: 'tube-gap',
      message: `Tube outline has a gap (${schedule.length} painted rows spanning ${lastRow - firstRow + 1} rows). Paint a contiguous outline.`,
    });
    return { ok: false, messages };
  }

  return { ok: true, schedule, anchorCol, messages };
}

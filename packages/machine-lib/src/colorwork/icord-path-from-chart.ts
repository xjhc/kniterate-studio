/**
 * Traces a painted i-cord path (cells whose keyId is `KEY_ID_ICORD`)
 * into an emitter-ready step list for `emitICord`.
 *
 * Authoring model (v1): the painted i-cord cells form a single connected
 * chain (8-connectivity) with exactly two endpoints. The cord starts at
 * the lower endpoint (nearest the cast-on) and is traced upward to the
 * other end. Each step between consecutive waypoints becomes:
 *   - vertical move (Δrow > 0) → knit `roundsPerRow × Δrow` rounds,
 *   - lateral move (Δcol ≠ 0)  → travel |Δcol| columns toward the side,
 * with diagonals knitting first, then travelling.
 *
 * The cord physically only grows upward, so the path may not step down a
 * row — that is reported as an error rather than silently reordered.
 *
 * The cord itself is `width` needles wide; the painted column marks its
 * left edge. This tracer is column-faithful but width-agnostic — it does
 * not require the painter to draw the full cord width.
 */

import { projectChart } from '../chart-core/projection.js';
import {
  KEY_ID_ICORD,
  type KnitlabChartState,
  type KnitlabKeyDefinition,
} from './knitlab1-contract.js';
import type { IcordStep } from '../knitout/passes/icord.js';

export interface IcordTraceMessage {
  severity: 'error' | 'warning';
  rule: string;
  message: string;
}

export interface IcordTraceResult {
  ok: boolean;
  /** Emitter-ready, minus carrier/speeds (caller supplies those). */
  spec?: { startCol: number; width: number; steps: IcordStep[] };
  /** Ordered (row, col) waypoints of the traced path (low row first). */
  path?: { row: number; col: number }[];
  messages: IcordTraceMessage[];
}

export interface IcordTraceOptions {
  /** Cord circumference in needle slots. Default 7 (sophie's cord). */
  width?: number;
  /** Knit rounds per vertical chart row. Default 2. */
  roundsPerRow?: number;
}

const key = (r: number, c: number): string => `${r},${c}`;

export function icordPathFromChart(
  chart: KnitlabChartState,
  keyPalette: readonly KnitlabKeyDefinition[],
  opts: IcordTraceOptions = {},
): IcordTraceResult {
  const messages: IcordTraceMessage[] = [];
  const width = opts.width ?? 7;
  const roundsPerRow = opts.roundsPerRow ?? 2;

  let projection: ReturnType<typeof projectChart>;
  try {
    projection = projectChart(chart, keyPalette);
  } catch (e) {
    messages.push({ severity: 'error', rule: 'icord-projection-failed', message: String(e) });
    return { ok: false, messages };
  }
  const { rows, cols } = projection;

  // Collect painted i-cord cells.
  const cells = new Set<string>();
  const list: { row: number; col: number }[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (projection.cellAt(r, c).keyId === KEY_ID_ICORD) {
        cells.add(key(r, c));
        list.push({ row: r, col: c });
      }
    }
  }
  if (list.length === 0) {
    messages.push({ severity: 'error', rule: 'icord-empty', message: 'No i-cord cells painted.' });
    return { ok: false, messages };
  }

  // 8-connected neighbours.
  const neighbours = (r: number, c: number): { row: number; col: number }[] => {
    const out: { row: number; col: number }[] = [];
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        if (cells.has(key(r + dr, c + dc))) out.push({ row: r + dr, col: c + dc });
      }
    }
    return out;
  };

  // Validate simple-chain topology: every cell has 1 or 2 neighbours,
  // exactly two endpoints (degree 1).
  const endpoints: { row: number; col: number }[] = [];
  for (const { row, col } of list) {
    const deg = neighbours(row, col).length;
    if (deg === 0 && list.length > 1) {
      messages.push({
        severity: 'error',
        rule: 'icord-disconnected',
        message: `I-cord cell at row ${row}, col ${col} is isolated — the path must be one connected chain.`,
      });
      return { ok: false, messages };
    }
    if (deg > 2) {
      messages.push({
        severity: 'error',
        rule: 'icord-branch',
        message: `I-cord cell at row ${row}, col ${col} has ${deg} neighbours — the path must not branch (v1 traces a single chain).`,
      });
      return { ok: false, messages };
    }
    if (deg === 1) endpoints.push({ row, col });
  }
  if (list.length === 1) {
    endpoints.push(list[0]!, list[0]!);
  } else if (endpoints.length !== 2) {
    messages.push({
      severity: 'error',
      rule: 'icord-not-simple-path',
      message: `Expected 2 path endpoints, found ${endpoints.length} (a closed loop or fork). Paint a single open i-cord stroke.`,
    });
    return { ok: false, messages };
  }

  // Start at the lower endpoint (cast-on side = lowest row index;
  // tie-break lowest col).
  endpoints.sort((a, b) => (a.row - b.row) || (a.col - b.col));
  const start = endpoints[0]!;

  // Walk the chain.
  const path: { row: number; col: number }[] = [start];
  const visited = new Set<string>([key(start.row, start.col)]);
  let cur = start;
  while (path.length < list.length) {
    const next = neighbours(cur.row, cur.col).find(n => !visited.has(key(n.row, n.col)));
    if (!next) break;
    visited.add(key(next.row, next.col));
    path.push(next);
    cur = next;
  }
  if (path.length !== list.length) {
    messages.push({
      severity: 'error',
      rule: 'icord-trace-incomplete',
      message: `Traced ${path.length} of ${list.length} i-cord cells — the path is not a single chain.`,
    });
    return { ok: false, messages };
  }

  // Convert waypoints to steps.
  const steps: IcordStep[] = [];
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1]!;
    const b = path[i]!;
    const dRow = b.row - a.row;
    const dCol = b.col - a.col;
    if (dRow < 0) {
      messages.push({
        severity: 'error',
        rule: 'icord-downward',
        message: `I-cord path steps down at row ${b.row}, col ${b.col}. A cord only grows upward; remove the downward segment.`,
      });
      return { ok: false, messages };
    }
    if (dRow > 0) steps.push({ kind: 'knit', rounds: roundsPerRow * dRow });
    if (dCol !== 0) steps.push({ kind: 'travel', dir: dCol < 0 ? 'left' : 'right', cols: Math.abs(dCol) });
  }
  // A single-cell or purely-flat path still needs at least one knit round
  // so the cord exists.
  if (!steps.some(s => s.kind === 'knit')) {
    steps.unshift({ kind: 'knit', rounds: roundsPerRow });
  }

  return {
    ok: true,
    spec: { startCol: start.col, width, steps },
    path,
    messages,
  };
}

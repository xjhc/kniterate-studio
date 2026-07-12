/**
 * Knitout text emitter — pure serialization of a KnitoutProgram to `.k`
 * file content.
 *
 * Format reference: https://textiles-lab.github.io/knitout/knitout.html
 *
 * Headers emit in a stable order so snapshot tests stay deterministic:
 *   1. magic
 *   2. Carriers (required)
 *   3. Machine, Gauge, Position
 *   4. Yarn-N (in carrier order)
 *   5. Kniterate X-* extensions (in a fixed order)
 * Then ops in their array order.
 *
 * No round-trip parser is included here — knitout-live-visualizer at
 * https://textiles-lab.github.io/knitout/visualizer/ is the canonical
 * round-trip target for human-readable validation.
 */

import type { BedNeedle, KnitoutOp, KnitoutProgram } from './types.js';

export function writeKnitoutProgram(program: KnitoutProgram): string {
  const lines: string[] = [];
  lines.push(`;!knitout-${program.version}`);
  lines.push(`;;Carriers: ${program.carriers.join(' ')}`);
  if (program.machine) lines.push(`;;Machine: ${program.machine}`);
  if (program.gauge !== undefined) lines.push(`;;Gauge: ${program.gauge}`);
  if (program.position) lines.push(`;;Position: ${program.position}`);
  for (const carrier of program.carriers) {
    const yarn = program.yarns[carrier];
    if (yarn !== undefined) lines.push(`;;Yarn-${carrier}: ${yarn}`);
  }
  // Note: Kniterate machine settings are emitted as OPS in `program.ops`, NOT
  // as `;;X-` comment headers. The knitout-backend-kniterate compiler reads
  // them from the op stream; `;;X-...` headers are retained here only for
  // diagnostics/back-compat and are not machine-effective by themselves.
  const k = program.kniterate;
  if (k.carrierSpacing !== undefined) lines.push(`;;X-carrier-spacing: ${k.carrierSpacing}`);
  if (k.carrierStoppingDistance !== undefined) lines.push(`;;X-carrier-stopping-distance: ${k.carrierStoppingDistance}`);
  for (const op of program.ops) {
    lines.push(emitOp(op));
  }
  return lines.join('\n') + '\n';
}

function emitOp(op: KnitoutOp): string {
  switch (op.kind) {
    case 'in':
      return `in ${op.carriers.join(' ')}`;
    case 'out':
      return `out ${op.carriers.join(' ')}`;
    case 'knit':
      return `knit ${op.direction} ${needleStr(op.needle)} ${op.carriers.join(' ')}`;
    case 'tuck':
      return `tuck ${op.direction} ${needleStr(op.needle)} ${op.carriers.join(' ')}`;
    case 'miss':
      return `miss ${op.direction} ${needleStr(op.needle)} ${op.carriers.join(' ')}`;
    case 'xfer':
      return `xfer ${needleStr(op.from)} ${needleStr(op.to)}`;
    case 'split':
      return `split ${op.direction} ${needleStr(op.from)} ${needleStr(op.to)} ${op.carriers.join(' ')}`;
    case 'rack':
      return `rack ${formatRack(op.offset)}`;
    case 'drop':
      return `drop ${needleStr(op.needle)}`;
    case 'pause':
      return op.message !== undefined ? `pause ; ${op.message}` : 'pause';
    case 'comment':
      return `; ${op.text}`;
    case 'x-stitch-number':
    case 'x-xfer-stitch-number':
      return `${op.kind} ${formatKniterateStitchNumber(op.value)}`;
    case 'x-speed-number':
    case 'x-roller-advance':
    case 'x-add-roller-advance':
    case 'x-presser-speed':
    case 'x-presser-roller':
    case 'x-carrier-stopping-distance':
      return `${op.kind} ${op.value}`;
    case 'x-xfer-style':
      return `${op.kind} ${op.value}`;
    case 'x-park-carriage':
      return 'x-park-carriage';
    case 'x-carrier-spacing':
      return `${op.kind} ${op.value}`;
  }
}

function needleStr(n: BedNeedle): string {
  return `${n.bed}${n.needle}`;
}

/** Kniterate's k-code bridge accepts stitch slots as a single base-36-ish
 *  token: 0-9, then A-Z. The UI exposes numeric values, so encode 10 as A
 *  before serializing x-stitch-number / x-xfer-stitch-number ops. */
function formatKniterateStitchNumber(value: number): string {
  if (Number.isInteger(value) && value >= 10 && value <= 35) {
    return String.fromCharCode('A'.charCodeAt(0) + value - 10);
  }
  return value.toString();
}

/** Format the rack value: integer if whole, otherwise one decimal place.
 *  Kniterate only accepts integer or 0.5 increments — the validator catches
 *  illegal values; the emitter just renders cleanly. */
function formatRack(offset: number): string {
  if (Number.isInteger(offset)) return offset.toString();
  return offset.toFixed(1);
}

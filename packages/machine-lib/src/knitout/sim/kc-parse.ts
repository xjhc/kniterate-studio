/**
 * Tiny .kc structural parser — extracts per-pass shape (direction, type,
 * carrier, speed, roller) without round-tripping the FRNT/STIF/REAR/STIR
 * layout. Used by `test/knitout/sim/vendor-oracle.test.ts` to compare
 * simulator predictions against actual vendor output.
 *
 * The .kc per-pass footer line is always:
 *
 *     <direction> <type> <carrier|0> <speed> <roller>
 *
 * (vendor emits this at the end of every pass — see vendor passesToKCode
 * end-of-pass `out(op)` call).
 */

import type { CarrierId } from '../types.js';

export interface ParsedKcPass {
  readonly direction: '>>' | '<<';
  readonly type: string;
  /** Carrier id ('1'..'6') or '0' for no-carrier (auto-move, xfer, drop,
   *  park). */
  readonly carrier: CarrierId | '0';
  readonly speed: number;
  readonly roller: number;
}

const PASS_LINE = /^(>>|<<)\s+(\S+)\s+(\S+)\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s*$/;

export function parseKcPasses(kcText: string): ParsedKcPass[] {
  const out: ParsedKcPass[] = [];
  for (const rawLine of kcText.split('\n')) {
    const line = rawLine.trim();
    const m = line.match(PASS_LINE);
    if (!m) continue;
    const direction = m[1] as '>>' | '<<';
    const type = m[2]!;
    const carrierRaw = m[3]!;
    const speedRaw = m[4]!;
    const rollerRaw = m[5]!;
    const carrier = (carrierRaw === '0' ? '0' : carrierRaw) as CarrierId | '0';
    out.push({
      direction,
      type,
      carrier,
      speed: Number(speedRaw),
      roller: Number(rollerRaw),
    });
  }
  return out;
}

/**
 * Lower the faithful Sophie macro-replay passes (`./replay.ts`) to the
 * loop/stack simulator's `KcPass` shape, and render them DIRECTLY to Kniterate
 * `.kc` text — bypassing the vendor's transfer scheduler, which cannot preserve
 * sophie's sequential transport walks (see docs/sophie-leaf-fidelity.md).
 */

import type { BodyPass } from './replay.js';
import type { KcPass } from './loop-stack-sim.js';
import { PAD } from './loop-stack-sim.js';

/**
 * Lower abstract leaf passes to the `KcPass` shape the loop/stack simulator
 * consumes. The pass already carries every structural footer field (dir,
 * carrier, rack), so this is a direct projection — including the carrier-0 tip
 * drop, which the simulator treats as a knit either way (it consolidates, never
 * births a loop). This is the structural half of "lower to real ops"; .kc text
 * rendering (bed strings + speed/roller footers) is `renderSophieKc`.
 */
export function lowerSophieToKc(passes: BodyPass[]): KcPass[] {
  return passes.map((p, idx) => ({ idx, kind: p.kind, dir: p.dir, carrier: p.carrier, rack: p.rack, f: p.f, r: p.r }));
}

/** Carriage-cosmetic speed/roller, by the dominant rule observed in sophie.kc:
 * body knit 300/600, the carrier-0 bind-off knit 600/0, tuck 300/0, transfer
 * 200/0. These do NOT affect stitch structure (sophie varies them per pass at
 * boundaries — that per-pass schedule is carriage-simulator territory). */
function footerSpeedRoller(p: BodyPass): [number, number] {
  if (p.kind === 'Tu-Tu') return [300, 0];
  if (p.kind === 'Kn-Kn') return p.carrier === '0' ? [600, 0] : [300, 600];
  return [200, 0]; // transfer
}

/** Stitch-number character for STIF/STIR rows (knits/tucks carry the body stitch
 * number; transfers carry 0). */
const stitchChar = (p: BodyPass, stitchNumber: number): string =>
  p.kind === 'Tr-Rr' || p.kind === 'Tr-Rl' || p.kind === 'Rl-Tr' || p.kind === 'Rr-Tr' ? '0' : String(stitchNumber);

/**
 * Render leaf passes DIRECTLY to Kniterate `.kc` text, in sophie's exact pass
 * format, bypassing the vendor's transfer scheduler (which cannot preserve the
 * sequential transport walks — see docs/sophie-leaf-fidelity.md). Because the
 * passes already match sophie needle-for-needle with full structural footer
 * fields, the output round-trips loop/stack-clean by construction.
 *
 * Structural fidelity only: each bed row is `.`×15 pad + a `_`-filled needle bed
 * with `-` at the operated needles + `.`×15 pad; STIF/STIR carry the stitch
 * number (knit) or 0 (transfer); `RACK:n` is emitted whenever the rack changes;
 * the footer is `<dir> <kind> <carrier> <speed> <roller>`. The carrier-position
 * markers (`/3`…`3\`) and the per-pass speed/roller schedule are carriage state,
 * left to the carriage-simulator effort.
 */
export function renderSophieKc(passes: BodyPass[], opts: { stitchNumber?: number } = {}): string {
  const stitchNumber = opts.stitchNumber ?? 6;
  const maxNeedle = passes.reduce((m, p) => Math.max(m, ...p.f, ...p.r, 0), 0);
  const core = maxNeedle + PAD + 1; // needle bed width (covers every operated needle)
  const bedRow = (operated: number[]): string => {
    const row = new Array<string>(core).fill('_');
    for (const n of operated) row[n] = '-';
    return '.'.repeat(PAD) + row.join('') + '.'.repeat(PAD);
  };
  const stitchRow = (ch: string): string => ch.repeat(core + 2 * PAD);

  const lines: string[] = ['HOME', 'RACK:0', '// command.kc'];
  let curRack = 0;
  passes.forEach((p, i) => {
    lines.push('//', `// row: ${i}`);
    if (p.rack !== curRack) { lines.push(`RACK:${p.rack}`); curRack = p.rack; }
    const sc = stitchChar(p, stitchNumber);
    lines.push(`FRNT:${bedRow(p.f)}`);
    lines.push(`STIF:${stitchRow(sc)}`);
    lines.push(`REAR:${bedRow(p.r)}`);
    lines.push(`STIR:${stitchRow(sc)}`);
    const [speed, roller] = footerSpeedRoller(p);
    lines.push(`${p.dir} ${p.kind} ${p.carrier} ${speed} ${roller}`);
  });
  return lines.join('\n') + '\n';
}

/**
 * Validate a KnitoutProgram against Kniterate's machine constraints.
 *
 * Runs synchronously over the program's ops + headers. Three severity
 * classes — see docs/knitlab1-kniterate-export-plan.md §10:
 *
 *  - error:   compile-blocking; the machine will jam or refuse the file
 *  - warning: likely-bad but possibly intentional; the wizard surfaces
 *  - info:    metadata (program stats) for the notes.md generator
 *
 * Validators are stateless and side-effect free — they can be re-run on
 * any program at any time.
 */

import {
  isLegalRack,
  KNITERATE_MAX_RACK,
  KNITERATE_NEEDLE_COUNT,
} from '../knitout/kniterate/constants.js';
import type { CarrierId, KnitoutProgram } from '../knitout/types.js';

export type Severity = 'error' | 'warning' | 'info';

export interface ValidationMessage {
  severity: Severity;
  rule: string;
  message: string;
  /** Optional op index in `program.ops` the message refers to. */
  opIndex?: number;
}

export interface ValidationReport {
  messages: ValidationMessage[];
  errorCount: number;
  warningCount: number;
}

export function validateKnitoutProgram(program: KnitoutProgram): ValidationReport {
  const messages: ValidationMessage[] = [];

  // ---- Header-level checks ----
  if (program.carriers.length === 0) {
    messages.push({
      severity: 'error',
      rule: 'carriers-required',
      message: 'Program declares no carriers; at least one is required.',
    });
  }
  for (const c of program.carriers) {
    if (!isLegalCarrier(c)) {
      messages.push({
        severity: 'error',
        rule: 'carrier-id-legal',
        message: `Carrier "${c}" is not a legal Kniterate carrier (must be 1-6).`,
      });
    }
  }

  // ---- Op-level checks ----
  const activeCarriers = new Set<CarrierId>();
  let currentRack = 0;
  for (let i = 0; i < program.ops.length; i++) {
    const op = program.ops[i]!;
    switch (op.kind) {
      case 'in': {
        for (const c of op.carriers) {
          if (!isLegalCarrier(c)) {
            messages.push({
              severity: 'error',
              rule: 'carrier-id-legal',
              message: `\`in\` op references illegal carrier "${c}".`,
              opIndex: i,
            });
            continue;
          }
          if (activeCarriers.has(c)) {
            messages.push({
              severity: 'warning',
              rule: 'carrier-in-twice',
              message: `Carrier "${c}" brought \`in\` while already active.`,
              opIndex: i,
            });
          }
          activeCarriers.add(c);
        }
        break;
      }
      case 'out': {
        for (const c of op.carriers) {
          if (!activeCarriers.has(c)) {
            messages.push({
              severity: 'warning',
              rule: 'carrier-out-without-in',
              message: `Carrier "${c}" taken \`out\` without being brought \`in\`.`,
              opIndex: i,
            });
          }
          activeCarriers.delete(c);
        }
        break;
      }
      case 'knit':
      case 'tuck':
      case 'miss': {
        if (op.needle.bed !== 'f' && op.needle.bed !== 'b') {
          messages.push({
            severity: 'error',
            rule: 'no-sliders',
            message: `\`${op.kind}\` on bed "${op.needle.bed}" — Kniterate has no sliders; only \`f\` and \`b\` are legal.`,
            opIndex: i,
          });
        }
        if (op.needle.needle < 1 || op.needle.needle > KNITERATE_NEEDLE_COUNT) {
          messages.push({
            severity: 'error',
            rule: 'needle-in-range',
            message: `Needle ${op.needle.bed}${op.needle.needle} is out of range (1..${KNITERATE_NEEDLE_COUNT}).`,
            opIndex: i,
          });
        }
        if (op.needle.needle === 0) {
          messages.push({
            severity: 'error',
            rule: 'no-needle-zero',
            message: `Needle 0 is not addressable on Kniterate.`,
            opIndex: i,
          });
        }
        for (const c of op.carriers) {
          if (!isLegalCarrier(c)) {
            messages.push({
              severity: 'error',
              rule: 'carrier-id-legal',
              message: `\`${op.kind}\` references illegal carrier "${c}".`,
              opIndex: i,
            });
            continue;
          }
          if (!activeCarriers.has(c)) {
            messages.push({
              severity: 'error',
              rule: 'carrier-active',
              message: `Carrier "${c}" used in \`${op.kind}\` without preceding \`in\`.`,
              opIndex: i,
            });
          }
        }
        break;
      }
      case 'xfer': {
        for (const n of [op.from, op.to]) {
          if (n.bed !== 'f' && n.bed !== 'b') {
            messages.push({
              severity: 'error',
              rule: 'no-sliders',
              message: `\`xfer\` uses slider bed "${n.bed}"; Kniterate has no sliders.`,
              opIndex: i,
            });
          }
          if (n.needle < 1 || n.needle > KNITERATE_NEEDLE_COUNT) {
            messages.push({
              severity: 'error',
              rule: 'needle-in-range',
              message: `\`xfer\` needle ${n.bed}${n.needle} is out of range.`,
              opIndex: i,
            });
          }
        }
        if (op.from.bed === op.to.bed) {
          messages.push({
            severity: 'error',
            rule: 'xfer-cross-beds',
            message: `\`xfer\` must move between front and back beds; got ${op.from.bed}→${op.to.bed}.`,
            opIndex: i,
          });
        }
        // Validate the rack offset is consistent with the xfer's needle delta.
        // Canonical knitout convention (per vendored knitout-to-kcode.cjs slotNumber):
        // back-bed needle b(n) sits at slot n + rack; front-bed slot = needle.
        // For an xfer between beds to align, rack = front_needle - back_needle.
        const frontNeedle = op.from.bed === 'f' ? op.from.needle : op.to.needle;
        const backNeedle = op.from.bed === 'b' ? op.from.needle : op.to.needle;
        const expectedRackDelta = frontNeedle - backNeedle;
        if (Math.abs(currentRack - expectedRackDelta) > 0.01 && expectedRackDelta !== 0) {
          // soft warning — many transfer sequences set rack right before; we surface mismatch as info-warning
          messages.push({
            severity: 'warning',
            rule: 'xfer-rack-consistency',
            message: `\`xfer ${op.from.bed}${op.from.needle} ${op.to.bed}${op.to.needle}\` needs rack=${expectedRackDelta} but current rack=${currentRack}.`,
            opIndex: i,
          });
        }
        break;
      }
      case 'split': {
        // Same bed-cross and needle-range constraints as xfer, plus the
        // carrier-active check like knit/tuck/miss.
        for (const n of [op.from, op.to]) {
          if (n.bed !== 'f' && n.bed !== 'b') {
            messages.push({
              severity: 'error',
              rule: 'no-sliders',
              message: `\`split\` uses slider bed "${n.bed}"; Kniterate has no sliders.`,
              opIndex: i,
            });
          }
          if (n.needle < 1 || n.needle > KNITERATE_NEEDLE_COUNT) {
            messages.push({
              severity: 'error',
              rule: 'needle-in-range',
              message: `\`split\` needle ${n.bed}${n.needle} is out of range.`,
              opIndex: i,
            });
          }
        }
        if (op.from.bed === op.to.bed) {
          messages.push({
            severity: 'error',
            rule: 'xfer-cross-beds',
            message: `\`split\` must move between front and back beds; got ${op.from.bed}→${op.to.bed}.`,
            opIndex: i,
          });
        }
        for (const c of op.carriers) {
          if (!isLegalCarrier(c)) {
            messages.push({
              severity: 'error',
              rule: 'carrier-id-legal',
              message: `\`split\` references illegal carrier "${c}".`,
              opIndex: i,
            });
            continue;
          }
          if (!activeCarriers.has(c)) {
            messages.push({
              severity: 'error',
              rule: 'carrier-active',
              message: `Carrier "${c}" used in \`split\` without preceding \`in\`.`,
              opIndex: i,
            });
          }
        }
        break;
      }
      case 'rack': {
        if (!isLegalRack(op.offset)) {
          messages.push({
            severity: 'error',
            rule: 'rack-legal-increment',
            message: `\`rack ${op.offset}\` — Kniterate accepts integer or ±0.5 increments only (not Shima's 0.25).`,
            opIndex: i,
          });
        }
        // Magnitude check: the vendor backend (and isLegalRack) only police
        // the increment, not how far the bed travels. A large rack passes
        // .kc conversion but jams the machine. Both reference hats stay
        // within ±KNITERATE_MAX_RACK; surface anything beyond as a warning
        // (the exact machine ceiling is a touch higher and uncertain, so
        // this isn't a hard error — but a stray rack 22 must not be silent).
        if (Number.isFinite(op.offset) && Math.abs(op.offset) > KNITERATE_MAX_RACK) {
          messages.push({
            severity: 'warning',
            rule: 'rack-magnitude',
            message: `\`rack ${op.offset}\` exceeds the ±${KNITERATE_MAX_RACK} envelope both reference hats use; the bed may not shift this far — verify before knitting.`,
            opIndex: i,
          });
        }
        currentRack = op.offset;
        break;
      }
      case 'x-stitch-number':
      case 'x-xfer-stitch-number': {
        // Kniterate serializes stitch numbers as a single 0-9/A-Z token
        // (knitout-to-kcode.cjs), so only integers 0–35 survive the
        // conversion; anything else throws at .kc time. The rest of this
        // validator is structural, so without this rule an out-of-range
        // stitch number (e.g. a swatch band of 40, or 1.5) reads as 0
        // errors here and only fails downstream at conversion.
        if (!Number.isInteger(op.value) || op.value < 0 || op.value > 35) {
          messages.push({
            severity: 'error',
            rule: 'stitch-number-range',
            message: `\`${op.kind} ${op.value}\` — Kniterate stitch numbers must be an integer 0–35 (a single 0-9/A-Z token).`,
            opIndex: i,
          });
        }
        break;
      }
      case 'drop':
      case 'pause':
      case 'comment':
        break;
    }
  }

  // Carriers still active at program end → trailing-yarn warning
  if (activeCarriers.size > 0) {
    messages.push({
      severity: 'warning',
      rule: 'carriers-trailing-at-end',
      message: `Carriers still active at program end: ${[...activeCarriers].join(', ')}. They will trail yarn; emit \`out\` to release them.`,
    });
  }

  const errorCount = messages.filter(m => m.severity === 'error').length;
  const warningCount = messages.filter(m => m.severity === 'warning').length;
  return { messages, errorCount, warningCount };
}

function isLegalCarrier(c: string): c is CarrierId {
  return c === '1' || c === '2' || c === '3' || c === '4' || c === '5' || c === '6';
}

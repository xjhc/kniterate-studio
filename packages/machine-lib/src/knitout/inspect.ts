/**
 * Structured inspection of a compiled `KnitoutProgram`.
 *
 * Verification of machine output used to mean grepping the emitted `.k`
 * text for ops and reasoning about line numbers (e.g. "the x-stitch-number
 * transitions land at even thirds, so the bands are equal"). This walks the
 * op stream once and answers those questions structurally instead — op
 * counts, carriage passes, needle span, the named sections the emitter
 * delimits with `--- ... ---` comments, and the ordered tension schedule
 * with each change tagged by its enclosing section.
 *
 * Pure over the program; no kcode subprocess, no file IO. Pair with
 * `chart-to-knitout.ts --json` (CLI) or call directly from a test/script.
 */

import type {
  CarrierId,
  KniterateExtensionHeaders,
  KnitoutOp,
  KnitoutProgram,
} from './types.js';

/** A `--- LABEL ---` comment-delimited region of the op stream. */
export interface KnitoutSection {
  /** Text between the `--- ` markers, e.g. 'PATTERN', 'WASTE SECTION'. */
  label: string;
  /** Index of the section's marker comment in `program.ops`. */
  startIndex: number;
  /** Exclusive end (start of the next section, or `ops.length`). */
  endIndex: number;
  /** Ops in `[startIndex, endIndex)`, marker comment included. */
  opCount: number;
}

/** One `x-stitch-number` change, in op order, tagged by enclosing section. */
export interface TensionChange {
  stitchNumber: number;
  index: number;
  /** Label of the enclosing section, or null if before the first marker. */
  section: string | null;
}

/** Which bind-off the emitter wrote, parsed from its section marker. */
export type BindOffKind = 'machine' | 'waste-and-drop' | 'drop' | 'fairisle-park';

export interface KnitoutInspection {
  totalOps: number;
  /** Count by `KnitoutOp['kind']`. Missing kinds are absent (not 0). */
  opCounts: Record<string, number>;
  /**
   * Maximal same-direction runs of carriage ops (knit/tuck/miss/split) —
   * a proxy for carriage traverses. A direction flip starts a new pass;
   * xfer / rack / drop / settings between same-direction knits do not.
   */
  carriagePasses: number;
  /** Needle span touched by any knit/tuck/miss/xfer/split/drop op. */
  dims: { needleMin: number; needleMax: number; width: number } | null;
  /** Distinct carriers that appear on any in/out/knit/tuck/miss/split op. */
  carriersUsed: CarrierId[];
  /** Marker-delimited sections, in stream order. */
  sections: KnitoutSection[];
  /** Every `x-stitch-number`, in order, with its enclosing section. */
  tensionSchedule: TensionChange[];
  /** Bind-off style detected from the bind-off section marker, if any. */
  bindOff: BindOffKind | null;
  /** Echo of the program's Kniterate extension headers. */
  settings: KniterateExtensionHeaders;
}

const SECTION_MARKER = /^--- (.+) ---$/;

const CARRIAGE_KINDS = new Set<KnitoutOp['kind']>(['knit', 'tuck', 'miss', 'split']);

function needlesOf(op: KnitoutOp): number[] {
  switch (op.kind) {
    case 'knit':
    case 'tuck':
    case 'miss':
      return [op.needle.needle];
    case 'drop':
      return [op.needle.needle];
    case 'xfer':
    case 'split':
      return [op.from.needle, op.to.needle];
    default:
      return [];
  }
}

function carriersOf(op: KnitoutOp): readonly CarrierId[] {
  switch (op.kind) {
    case 'in':
    case 'out':
    case 'knit':
    case 'tuck':
    case 'miss':
    case 'split':
      return op.carriers;
    default:
      return [];
  }
}

function bindOffKindFromLabel(label: string): BindOffKind | null {
  if (!label.startsWith('BIND OFF')) return null;
  if (label.includes('machine')) return 'machine';
  if (label.includes('waste-and-drop')) return 'waste-and-drop';
  if (label.includes('fairisle')) return 'fairisle-park';
  if (label.includes('drop')) return 'drop';
  return null;
}

export function inspectKnitout(program: KnitoutProgram): KnitoutInspection {
  const ops = program.ops;

  const opCounts: Record<string, number> = {};
  const sections: KnitoutSection[] = [];
  const tensionSchedule: TensionChange[] = [];
  const carriers = new Set<CarrierId>();
  let needleMin = Infinity;
  let needleMax = -Infinity;
  let carriagePasses = 0;
  let lastDir: '+' | '-' | null = null;
  let bindOff: BindOffKind | null = null;

  for (let i = 0; i < ops.length; i++) {
    const op = ops[i]!;
    opCounts[op.kind] = (opCounts[op.kind] ?? 0) + 1;

    for (const n of needlesOf(op)) {
      if (n < needleMin) needleMin = n;
      if (n > needleMax) needleMax = n;
    }
    for (const c of carriersOf(op)) carriers.add(c);

    if (CARRIAGE_KINDS.has(op.kind)) {
      const dir = (op as { direction: '+' | '-' }).direction;
      if (dir !== lastDir) {
        carriagePasses += 1;
        lastDir = dir;
      }
    }

    if (op.kind === 'comment') {
      const m = SECTION_MARKER.exec(op.text);
      if (m) {
        const label = m[1]!;
        if (sections.length > 0) sections[sections.length - 1]!.endIndex = i;
        sections.push({ label, startIndex: i, endIndex: ops.length, opCount: 0 });
        const bo = bindOffKindFromLabel(label);
        if (bo) bindOff = bo;
      }
    }

    if (op.kind === 'x-stitch-number') {
      const section = sections.length > 0 ? sections[sections.length - 1]!.label : null;
      tensionSchedule.push({ stitchNumber: op.value, index: i, section });
    }
  }

  for (const s of sections) s.opCount = s.endIndex - s.startIndex;

  const dims = needleMin <= needleMax
    ? { needleMin, needleMax, width: needleMax - needleMin + 1 }
    : null;

  return {
    totalOps: ops.length,
    opCounts,
    carriagePasses,
    dims,
    carriersUsed: [...carriers].sort(),
    sections,
    tensionSchedule,
    bindOff,
    settings: program.kniterate,
  };
}

/**
 * The body tension bands in order — the common assertion target for
 * tension-swatch-style charts (the `x-stitch-number` values inside the
 * `--- PATTERN ---` section, sticky between rows).
 */
export function bodyTensionBands(inspection: KnitoutInspection): number[] {
  return inspection.tensionSchedule
    .filter(t => t.section === 'PATTERN')
    .map(t => t.stitchNumber);
}

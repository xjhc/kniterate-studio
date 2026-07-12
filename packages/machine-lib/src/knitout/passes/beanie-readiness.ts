/**
 * Beanie knit-readiness report.
 *
 * Turns a generated beanie program (`buildBeanieProgram`) from "valid .k/.kc"
 * into a machine-loading packet a human operator can inspect before a run:
 * which carriers to thread, the needle range the tube occupies, the rack
 * envelope the crown demands, the validator / `.kc` status, the float/catch
 * policy, swatch/gauge steps, and how the crown finishes. It is deliberately
 * honest about the one thing the toolchain can't prove — that the fabric has
 * never been physically knit and measured.
 *
 * Pure over `(spec, program, validation, options)`. The CLI (`beanie-to-kc.ts
 * --readiness` / `--readiness-md`) is the only caller today; an MCP tool would
 * reuse it verbatim.
 *
 * This is the standalone-beanie productization slice (system-flows-tracker
 * slice 0), NOT seam 2 — it reports on the program the standalone tube already
 * emits and does not move the beanie onto the FabricIR canvas.
 */

import { renderBeaniePreview } from './beanie.js';
import type { BeanieSpec, CrownSpec } from './beanie.js';
import { effectiveDecreasesPerRound } from './beanie.js';
import { inspectKnitout } from '../inspect.js';
import { KNITERATE_MAX_RACK } from '../kniterate/constants.js';
import type { CarrierId, KnitoutProgram } from '../types.js';
import type { ValidationReport } from '../../validators/knitout-program.js';

/** Status of the `.kc` (k-code) conversion for this packet. */
export type KcStatus =
  | { kind: 'written'; bytes: number; path?: string }
  | { kind: 'skipped' }
  | { kind: 'failed'; error?: string };

export interface BeanieReadinessOptions {
  /** Result of `validateKnitoutProgram(program)`. */
  validation: ValidationReport;
  /** `.kc` conversion outcome. */
  kc: KcStatus;
  /** Rough physical estimate (cm), if computed by the caller. */
  estimate?: { circumferenceCm: number; flatWidthCm: number; bodyHeightCm: number };
  /** Path to a companion gauge swatch the caller wrote, if any. */
  swatchPath?: string;
  /** Output file paths, for the packet header. */
  files?: { knitout?: string; kcode?: string };
}

export interface BeanieCarrierPlan {
  carrier: CarrierId;
  role: string;
}

export interface BeanieReadiness {
  /** Tube size: stitches around, per-face, and the needle slots it occupies. */
  size: {
    circumference: number;
    faceWidth: number;
    needleRange: [number, number];
    estimate?: { circumferenceCm: number; flatWidthCm: number; bodyHeightCm: number };
  };
  /** Every carrier the program threads, with its role (from program.yarns). */
  carriers: BeanieCarrierPlan[];
  /** Worst transfer racking the run demands vs. the machine limit. */
  rackEnvelope: {
    maxAbs: number;
    limit: number;
    withinLimit: boolean;
    transferCount: number;
  };
  validation: { errors: number; warnings: number; warningRules: string[] };
  kc: KcStatus;
  /** Op-stream size proxies. */
  ops: { total: number; carriagePasses: number };
  /** Fabric construction: brim, body, crown, and the float/catch policy. */
  fabric: {
    brim: string;
    body: string;
    crown: string;
    floatPolicy?: string;
    frontCatchCount: number;
  };
  notes: {
    crown: string[];
    swatch: string[];
    /** The load-bearing honesty line — this is a generated packet, not a knit. */
    caveat: string;
  };
  files?: { knitout?: string; kcode?: string };
}

/** Largest |rack offset| any transfer in the program demands, plus the
 *  transfer count. The crown decrease is the only beanie phase that racks.
 *  Shared with the surface hat readiness — the crown choreography is the same. */
export function rackEnvelope(program: KnitoutProgram): { maxAbs: number; transferCount: number } {
  let maxAbs = 0;
  let transferCount = 0;
  for (const op of program.ops) {
    if (op.kind === 'rack') maxAbs = Math.max(maxAbs, Math.abs(op.offset));
    if (op.kind === 'xfer') transferCount += 1;
  }
  return { maxAbs, transferCount };
}

/** One-line crown description, keyed on the SHARED `CrownSpec` — reused by the
 *  surface hat readiness so beanie + hat describe the crown the same way. */
export function describeCrown(crown: CrownSpec): string {
  if (crown.style === 'gathered') return 'gathered (hand-cinch)';
  const d = effectiveDecreasesPerRound(crown.decreasesPerRound);
  const between = crown.plainRoundsBetween ?? 1;
  const minFace = crown.minFaceStitches ?? 8;
  return `machine decrease (${d}/face/round → ${2 * d} spiral lines, every ${between} row(s), to ${minFace} sts/face)`;
}

/** Crown finishing notes (how the crown closes off the machine), keyed on the
 *  SHARED `CrownSpec` — reused by the surface hat readiness. */
export function crownNotes(crown: CrownSpec): string[] {
  if (crown.style === 'gathered') {
    return [
      'Gathered crown: the machine knits the full-width tube to the top and lays a',
      '  draw thread across the last round. After the run, release the carriers, slide',
      '  the live loops onto the draw thread, pull tight and secure — the crown closes',
      '  off the machine by hand. Expect a softly gathered (not domed) top.',
    ];
  }
  const d = effectiveDecreasesPerRound(crown.decreasesPerRound);
  return [
    `Machine-decreased crown: ${d} evenly-spaced k2tog per face per decrease round`,
    `  (= ${2 * d} spiral lines), survivors re-packed contiguous each round, then a`,
    '  draw-thread gather over the final survivors. No hand-shaping mid-run, but the',
    '  draw thread still cinches the last loops at the end. A rounder dome needs more',
    `  decrease points; the rack ≤ ${KNITERATE_MAX_RACK} envelope caps it at 6/face (12 lines).`,
  ];
}

export const SWATCH_NOTES_WITH_FILE = (swatchPath: string): string[] => [
  `A companion gauge swatch was written to ${swatchPath} — a plain tube in the SAME`,
  '  fabric and tension as this hat (a flat tension swatch reads the wrong, single-bed',
  '  gauge). Knit it, relax the flat tube, then measure:',
  '    flat width over the swatch face stitches → stitches/cm',
  '    body height over the swatch rounds       → rounds/cm',
  '  Re-run with the measured --gauge-spc / --gauge-rpc and set',
  '  --face-width = round(target_circumference_cm × stitches_per_cm ÷ 2).',
];

export const SWATCH_NOTES_NO_FILE: string[] = [
  'No companion gauge swatch was written. Before a final knit, generate one with',
  '  --swatch: a plain tube in the same fabric/tension. Knit + measure it (a flat',
  '  tension swatch reads the wrong single-bed gauge), then re-run with the measured',
  '  --gauge-spc / --gauge-rpc and pick --face-width for your target circumference.',
];

export const CAVEAT =
  'NOT physically swatched. Every number here is derived from the generated program — ' +
  'the validator and the .kc converter prove the ops are well-formed and machine-legal, ' +
  'but no part of this packet has been knit or measured. Circumference / height are ' +
  'gauge estimates, and fabric hand, motif readability, and crown fit are unverified. ' +
  'Knit the gauge swatch and confirm before committing yarn to a full run.';

/** Build the structured readiness report from a generated beanie program. */
export function buildBeanieReadiness(
  spec: BeanieSpec,
  program: KnitoutProgram,
  options: BeanieReadinessOptions,
): BeanieReadiness {
  const faceWidth = spec.circumference / 2;
  const offset = spec.needleOffset ?? 50;
  const insp = inspectKnitout(program);
  const needleRange: [number, number] = insp.dims
    ? [insp.dims.needleMin, insp.dims.needleMax]
    : [offset, offset + spec.circumference - 1];

  const { maxAbs, transferCount } = rackEnvelope(program);
  const preview = renderBeaniePreview(program);

  const carriers: BeanieCarrierPlan[] = (Object.keys(program.yarns) as CarrierId[])
    .sort()
    .map((c) => ({ carrier: c, role: program.yarns[c] ?? 'yarn' }));

  const brimRounds = spec.brim.rounds;
  const bodyRounds = spec.jacquard ? spec.jacquard.chart.length : spec.bodyRounds;

  let floatPolicy: string | undefined;
  if (spec.jacquard) {
    const limit = spec.jacquard.floatLimit ?? 5;
    const back = spec.jacquard.backFace ?? 'mirror';
    const where = spec.jacquard.hideCatches ? 'on the back face (hidden inside)' : 'on the front face';
    floatPolicy =
      `colour floats longer than ${limit} st are caught with a tuck ${where}; ` +
      `back face = ${back}` +
      (spec.jacquard.hideCatches ? ' (front stays fleck-free)' : '');
  }

  const warningRules = [
    ...new Set(
      options.validation.messages
        .filter((m) => m.severity === 'warning')
        .map((m) => m.rule),
    ),
  ];

  return {
    size: {
      circumference: spec.circumference,
      faceWidth,
      needleRange,
      estimate: options.estimate,
    },
    carriers,
    rackEnvelope: {
      maxAbs,
      limit: KNITERATE_MAX_RACK,
      withinLimit: maxAbs <= KNITERATE_MAX_RACK,
      transferCount,
    },
    validation: {
      errors: options.validation.errorCount,
      warnings: options.validation.warningCount,
      warningRules,
    },
    kc: options.kc,
    ops: { total: program.ops.length, carriagePasses: insp.carriagePasses },
    fabric: {
      brim: brimRounds > 0 ? `${spec.brim.style} × ${brimRounds} rounds` : 'none (plain edge)',
      body: spec.jacquard
        ? `jacquard, ${bodyRounds} rounds, ${spec.jacquard.colors.length} colours`
        : spec.stripes && spec.stripes.length > 0
          ? `striped, ${bodyRounds} rounds`
          : `plain, ${bodyRounds} rounds`,
      crown: describeCrown(spec.crown),
      floatPolicy,
      frontCatchCount: preview.catchCount,
    },
    notes: {
      crown: crownNotes(spec.crown),
      swatch: options.swatchPath ? SWATCH_NOTES_WITH_FILE(options.swatchPath) : SWATCH_NOTES_NO_FILE,
      caveat: CAVEAT,
    },
    files: options.files,
  };
}

export function kcLine(kc: KcStatus): string {
  switch (kc.kind) {
    case 'written':
      return `written (${(kc.bytes / 1024) | 0} KB)${kc.path ? ` → ${kc.path}` : ''}`;
    case 'skipped':
      return 'skipped (--no-kcode)';
    case 'failed':
      return `FAILED${kc.error ? ` — ${kc.error}` : ''}`;
  }
}

/** Plain-text readiness report (crown at top of the packet). */
export function renderReadinessText(r: BeanieReadiness): string {
  const L: string[] = [];
  const validationLine =
    r.validation.errors === 0 && r.validation.warnings === 0
      ? 'clean (0 errors, 0 warnings)'
      : `${r.validation.errors} errors, ${r.validation.warnings} warnings` +
        (r.validation.warningRules.length ? ` [${r.validation.warningRules.join(', ')}]` : '');

  L.push('BEANIE KNIT-READINESS REPORT');
  L.push('============================');
  L.push('');
  L.push('SIZE');
  L.push(
    `  ${r.size.circumference} st around (${r.size.faceWidth}/face) · needles ${r.size.needleRange[0]}–${r.size.needleRange[1]}`,
  );
  if (r.size.estimate) {
    L.push(
      `  ~${r.size.estimate.circumferenceCm} cm around (~${r.size.estimate.flatWidthCm} cm flat), ~${r.size.estimate.bodyHeightCm} cm tall (estimate)`,
    );
  }
  L.push('');
  L.push('CARRIERS (thread before running)');
  for (const c of r.carriers) L.push(`  C${c.carrier} — ${c.role}`);
  L.push('');
  L.push('FABRIC');
  L.push(`  brim:  ${r.fabric.brim}`);
  L.push(`  body:  ${r.fabric.body}`);
  L.push(`  crown: ${r.fabric.crown}`);
  if (r.fabric.floatPolicy) L.push(`  floats: ${r.fabric.floatPolicy}`);
  if (r.fabric.frontCatchCount > 0) {
    L.push(`  ${r.fabric.frontCatchCount} float catch(es) on the front face (may show faintly)`);
  }
  L.push('');
  L.push('MACHINE ENVELOPE');
  L.push(
    `  rack: max |${r.rackEnvelope.maxAbs}| of limit ±${r.rackEnvelope.limit} — ${r.rackEnvelope.withinLimit ? 'OK' : 'OVER LIMIT'} (${r.rackEnvelope.transferCount} transfers)`,
  );
  L.push(`  ops: ${r.ops.total} · carriage passes: ${r.ops.carriagePasses}`);
  L.push('');
  L.push('VALIDATION & OUTPUT');
  L.push(`  validator: ${validationLine}`);
  L.push(`  .kc: ${kcLine(r.kc)}`);
  if (r.files?.knitout) L.push(`  .k:  ${r.files.knitout}`);
  L.push('');
  L.push('CROWN FINISHING');
  for (const n of r.notes.crown) L.push(`  ${n}`);
  L.push('');
  L.push('SWATCH / GAUGE');
  for (const n of r.notes.swatch) L.push(`  ${n}`);
  L.push('');
  L.push('CAVEAT');
  L.push(`  ${r.notes.caveat}`);
  return L.join('\n') + '\n';
}

/** Markdown readiness report — same content, shareable in a checklist. */
export function renderReadinessMarkdown(r: BeanieReadiness): string {
  const L: string[] = [];
  const ok = (b: boolean): string => (b ? '✅' : '⚠️');
  const validationLine =
    r.validation.errors === 0 && r.validation.warnings === 0
      ? `${ok(true)} clean (0 errors, 0 warnings)`
      : `${ok(r.validation.errors === 0)} ${r.validation.errors} errors, ${r.validation.warnings} warnings` +
        (r.validation.warningRules.length ? ` (\`${r.validation.warningRules.join('`, `')}\`)` : '');

  L.push('# Beanie knit-readiness report');
  L.push('');
  L.push(`> **${ok(false)} ${r.notes.caveat}**`);
  L.push('');
  L.push('## Size');
  L.push('');
  L.push(`- **${r.size.circumference} st** around (${r.size.faceWidth}/face)`);
  L.push(`- needles **${r.size.needleRange[0]}–${r.size.needleRange[1]}**`);
  if (r.size.estimate) {
    L.push(
      `- ~${r.size.estimate.circumferenceCm} cm around (~${r.size.estimate.flatWidthCm} cm flat), ~${r.size.estimate.bodyHeightCm} cm tall *(estimate — not swatched)*`,
    );
  }
  L.push('');
  L.push('## Carriers');
  L.push('');
  L.push('Thread these before running:');
  L.push('');
  L.push('| Carrier | Role |');
  L.push('|---|---|');
  for (const c of r.carriers) L.push(`| C${c.carrier} | ${c.role} |`);
  L.push('');
  L.push('## Fabric');
  L.push('');
  L.push(`- **brim:** ${r.fabric.brim}`);
  L.push(`- **body:** ${r.fabric.body}`);
  L.push(`- **crown:** ${r.fabric.crown}`);
  if (r.fabric.floatPolicy) L.push(`- **floats:** ${r.fabric.floatPolicy}`);
  if (r.fabric.frontCatchCount > 0) {
    L.push(`- ${r.fabric.frontCatchCount} float catch(es) on the front face (may show faintly)`);
  }
  L.push('');
  L.push('## Machine envelope');
  L.push('');
  L.push(
    `- **rack:** max |${r.rackEnvelope.maxAbs}| of limit ±${r.rackEnvelope.limit} — ${ok(r.rackEnvelope.withinLimit)} ${r.rackEnvelope.withinLimit ? 'within envelope' : 'OVER LIMIT'} (${r.rackEnvelope.transferCount} transfers)`,
  );
  L.push(`- **ops:** ${r.ops.total} · carriage passes: ${r.ops.carriagePasses}`);
  L.push('');
  L.push('## Validation & output');
  L.push('');
  L.push(`- **validator:** ${validationLine}`);
  L.push(`- **.kc:** ${kcLine(r.kc)}`);
  if (r.files?.knitout) L.push(`- **.k:** \`${r.files.knitout}\``);
  L.push('');
  L.push('## Crown finishing');
  L.push('');
  for (const n of r.notes.crown) L.push(`- ${n.trim()}`);
  L.push('');
  L.push('## Swatch / gauge');
  L.push('');
  for (const n of r.notes.swatch) L.push(`- ${n.trim()}`);
  L.push('');
  return L.join('\n') + '\n';
}

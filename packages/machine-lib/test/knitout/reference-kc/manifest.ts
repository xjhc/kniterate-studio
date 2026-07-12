/**
 * Reference-.kc parity manifest. swatch-7gg is fully wired as an
 * engine-compare case; color-swatch-bindoff gates the first generated
 * bindoff iteration against the captured reference; the larger fairisle
 * and sophie captures remain parse-only until their producer paths are
 * stable enough for section gates.
 *
 * color-swatch-bindoff-through-shell gates the SAME captured bindoff
 * iteration, but reaches the compiler through the wizard productization
 * seam the plan calls "compile identity"
 * (docs/kniterate-wizard-productization-plan.md):
 *   KniterateWizardConfig -> deriveKniterateExportState -> compileExportFromState.
 * The direct case proves the engine still matches machine truth; this
 * one proves the persisted-config -> derived-state path the user
 * actually drives reaches the same machine truth. They share the
 * `first-bindoff-iteration` anchor so the two paths can't drift apart.
 *
 * Decisions baked in (docs/kniterate-wizard-completion-plan.md, §Phase 0):
 *   - Section parity is the default exit gate.
 *   - Byte parity is restricted to small fully-controlled sections.
 *   - sophie-stress is parse-only (no engine generator exists; the
 *     plan's `max-pass-delta: 0` byte gate would have been brittle).
 */

import { writeKnitoutProgram } from '../../../src/knitout/emitter.js';
import { compileChartToKnitout } from '../../../src/knitout/compile/from-chart.js';
import { compileExportFromState } from '../../../src/knitout/export-helpers.js';
import {
  DEFAULT_KNITERATE_WIZARD_CONFIG,
  deriveKniterateExportState,
  type KniterateWizardConfig,
} from '../../../src/knitout/wizard-config.js';
import {
  DEFAULT_TENSION_SWATCH,
  buildTensionSwatch,
} from '../../../src/knitout/swatch/tension-swatch.js';
import {
  DEFAULT_KEY_PALETTE,
  KEY_ID_KNIT_DEFAULT,
  type KnitlabChartState,
} from '../../../src/colorwork/knitlab1-contract.js';

import type { ReferenceKcCase } from './manifest-types.js';

/** Section anchors for `reference/swatch.kc`. The vendor doesn't emit
 *  semantic section markers; we anchor on row-comment lines. */
const SWATCH_SECTIONS = {
  /** File header — `HOME` + `RACK:0` + the `// command.kc` comment
   *  block, ending just before the cast-on row label. Six lines of
   *  truly invariant text. Byte parity is appropriate here.
   *
   *  We do NOT extend the byte-parity window to the cast-on row's
   *  FRNT/STIF/REAR/STIR strings: per the tension-swatch generator
   *  docstring, 12 specific layout lines have 1-column carrier-position
   *  drift vs. the reference. Those are cosmetic, not behavioral, and
   *  the structural `pass-structure whole` gate catches functional
   *  regressions. */
  header: {
    id: 'header',
    anchor: {
      startPattern: /^HOME$/,
      endPattern: /^\/\/ row: 0$/,
    },
  },
  /** Whole file — for structural pass-parity gating. */
  whole: {
    id: 'whole',
    anchor: {
      startPattern: /^HOME$/,
      endPattern: 'EOF' as const,
    },
  },
} as const;

const SWATCH_7GG: ReferenceKcCase = {
  kind: 'engine-compare',
  id: 'swatch-7gg',
  referencePath: 'reference/swatch.kc',
  buildKnitout: () => writeKnitoutProgram(buildTensionSwatch(DEFAULT_TENSION_SWATCH)),
  sections: [SWATCH_SECTIONS.header, SWATCH_SECTIONS.whole],
  gates: [
    { kind: 'section-byte-identical', section: 'header' },
    { kind: 'pass-structure', section: 'whole' },
  ],
};

const COLOR_SWATCH_BINDOFF_SECTIONS = {
  /** First machine-bindoff iteration. The full reference is a much
   *  larger swatch than the tiny engine fixture below, so whole-section
   *  parity would be brittle. This first iteration still gates the
   *  important Customist bindoff choreography: f->b xfer at speed 120,
   *  rack 1, b->f xfer, rack 0, soft-miss decay, and the knit at the
   *  expected roller ramp. */
  firstIteration: {
    id: 'first-bindoff-iteration',
    anchor: {
      startPattern: /^>> Tr-Rr 0 120 0$/,
      endPattern: /^>> Tr-Rr 0 120 0$/,
    },
  },
} as const;

/** Captured Customist-style chain bind-off reference. The engine case
 *  regenerates a tiny swatch and gates the first bindoff iteration
 *  against the large captured reference. */
const COLOR_SWATCH_BINDOFF: ReferenceKcCase = {
  kind: 'engine-compare',
  id: 'color-swatch-bindoff',
  referencePath: 'reference/color-swatch-bindoff.kc',
  buildKnitout: buildColorSwatchBindoffKnitout,
  sections: [COLOR_SWATCH_BINDOFF_SECTIONS.firstIteration],
  gates: [
    { kind: 'pass-structure', section: 'first-bindoff-iteration' },
  ],
};

/** Same captured bindoff reference, reached through the wizard
 *  productization seam instead of a direct `compileChartToKnitout`
 *  call. Gates the productization-layer "compile identity" against
 *  machine truth. */
const COLOR_SWATCH_BINDOFF_THROUGH_SHELL: ReferenceKcCase = {
  kind: 'engine-compare',
  id: 'color-swatch-bindoff-through-shell',
  referencePath: 'reference/color-swatch-bindoff.kc',
  buildKnitout: buildColorSwatchBindoffThroughShellKnitout,
  sections: [COLOR_SWATCH_BINDOFF_SECTIONS.firstIteration],
  gates: [
    { kind: 'pass-structure', section: 'first-bindoff-iteration' },
  ],
};

/** Captured Customist Studio fairisle reference. Promoting this to
 *  engine-compare is Phase E work once the whole-program carriage trace
 *  covers the bind-off tail without ad-hoc direction accounting. */
const CUSTOMIST_FAIRISLE_7GG: ReferenceKcCase = {
  kind: 'parse-only',
  id: 'customist-fairisle-7gg',
  referencePath: 'reference/fairisle.kc',
  minPasses: 250,
};

/** sophie.kc has no engine generator yet — it's a captured artifact,
 *  not a regenerable target. Treated as a parser smoke-test against
 *  the largest real reference we have (37k lines). When/if a sophie
 *  generator lands, promote to engine-compare. */
const SOPHIE_STRESS: ReferenceKcCase = {
  kind: 'parse-only',
  id: 'sophie-stress',
  referencePath: 'reference/sophie.kc',
  // Rough lower bound; the reference has thousands of passes. The
  // gate exists only to catch a parser regression that silently
  // returns []. Set well below the real count.
  minPasses: 500,
};

/** Captured full-garment sweater panels (added 2026-06-10): a complete
 *  2-colors-per-row double-bed jacquard sweater — rib hem/cuff, jacquard
 *  body with the complement-image back bed, armhole bind-off chains +
 *  racked-transfer edge decreases, split crew neck knit with a second
 *  carrier pair per shoulder, live-stitch waste finish (front/back) and
 *  full bind-off with a single-needle tail (sleeve).
 *
 *  Parity status (Campaign 4, 2026-06-13): the body's complement-image
 *  lining + paired shaping IS now reproducible — `jacquard-complement.ts`
 *  produces this exact grammar (C4-1/C4-2) and the construction composes
 *  end-to-end for the sleeve (C4-3). The body-grammar parity is gated
 *  structurally in `complement-sleeve-e2e.test.ts` (the captured body is
 *  confirmed complement-image; the generated complement sleeve is
 *  vendor-clean). These manifest cases stay PARSE-ONLY because full
 *  byte/pass parity additionally needs the exact garment dimensions, the
 *  carrier-intro dance, and the split-neck / live-stitch finish
 *  choreography (front/back — tracker C4-4/C4-5), which are separate
 *  dimensional-matching + construction work, not a backing-model gap.
 *  Region decode notes: docs/kniterate-improvement-tracker.md §Reference
 *  sweater + §Campaign 4. */
const SWEATER_FRONT: ReferenceKcCase = {
  kind: 'parse-only',
  id: 'sweater-front',
  referencePath: 'reference/front.kc',
  minPasses: 2000, // real count 2544
};
const SWEATER_BACK: ReferenceKcCase = {
  kind: 'parse-only',
  id: 'sweater-back',
  referencePath: 'reference/back.kc',
  minPasses: 1700, // real count 2108
};
const SWEATER_SLEEVE: ReferenceKcCase = {
  kind: 'parse-only',
  id: 'sweater-sleeve',
  referencePath: 'reference/sleeves.kc',
  minPasses: 1600, // real count 1994
};

export const REFERENCE_KC_CASES: readonly ReferenceKcCase[] = [
  SWATCH_7GG,
  COLOR_SWATCH_BINDOFF,
  COLOR_SWATCH_BINDOFF_THROUGH_SHELL,
  CUSTOMIST_FAIRISLE_7GG,
  SOPHIE_STRESS,
  SWEATER_FRONT,
  SWEATER_BACK,
  SWEATER_SLEEVE,
];

/** The tiny single-color swatch both bindoff cases regenerate. Shared
 *  so the direct-engine and through-shell builders gate the same chart. */
function colorSwatchBindoffChart(): KnitlabChartState {
  return {
    id: 'color-swatch-bindoff-reference',
    rows: 4,
    cols: 6,
    orientation: 'bottom-up',
    name: 'Color swatch bindoff reference',
    displaySettings: { rowCountVisibility: 'right', colCountVisibility: 'bottom' },
    layers: [{ id: 'base', name: 'Base', isVisible: true, grid: {}, keyPlacements: [] }],
    activeLayerId: 'base',
  };
}

function compileMessages(messages: { severity: string; rule: string; message: string }[]): string {
  return messages.map(m => `[${m.severity}] ${m.rule}: ${m.message}`).join('\n');
}

function buildColorSwatchBindoffKnitout(): string {
  const result = compileChartToKnitout({
    chart: colorSwatchBindoffChart(),
    keyPalette: DEFAULT_KEY_PALETTE,
    yarnBindings: [{ keyId: KEY_ID_KNIT_DEFAULT, carrier: '3', name: 'merino' }],
    needleOffset: 100,
    wastePasses: 8,
    bindOff: 'machine-bindoff',
  });
  if (!result.ok || !result.program) {
    throw new Error(
      `color-swatch-bindoff engine fixture failed to compile: ${compileMessages(result.messages)}`,
    );
  }
  return writeKnitoutProgram(result.program);
}

/** Reaches the same captured bindoff reference through the wizard's
 *  persisted-config -> derived-state -> compile path. The config
 *  expresses exactly the machine settings the direct case passes
 *  inline (carrier 3, needleOffset 100, wastePasses 8, machine-bindoff);
 *  every field that drives the gated first-bindoff iteration
 *  (`bindOff`, the compiler-default `bindOffMachineConfig`, and the
 *  `DEFAULT_KNITERATE_HEADERS` machine settings) resolves identically,
 *  so the `first-bindoff-iteration` pass-structure must match. */
function buildColorSwatchBindoffThroughShellKnitout(): string {
  const config: KniterateWizardConfig = {
    ...DEFAULT_KNITERATE_WIZARD_CONFIG,
    yarns: [{ keyId: KEY_ID_KNIT_DEFAULT, carrier: '3', name: 'merino' }],
    needleOffset: 100,
    recipeOverrides: {
      start: { wastePasses: 8 },
      finish: { bindOff: 'machine-bindoff' },
    },
  };
  const state = deriveKniterateExportState(config, null);
  const result = compileExportFromState(colorSwatchBindoffChart(), DEFAULT_KEY_PALETTE, state);
  if (!result.ok || !result.program) {
    throw new Error(
      `color-swatch-bindoff-through-shell fixture failed to compile: ${compileMessages(result.messages)}`,
    );
  }
  return writeKnitoutProgram(result.program);
}

/**
 * Plain-language presentation layer for ValidationMessage `rule` IDs.
 *
 * The compile pipeline emits structured `ValidationMessage`s with a `rule`
 * identifier and a developer-oriented `message`. Surfaces that face the
 * knitter (the Kniterate wizard's Screen 4) shouldn't show raw rule IDs —
 * they should explain *what's wrong*, *why it matters*, and offer a
 * fix path.
 *
 * Each catalog entry is keyed by the validator `rule` ID and carries:
 *  - `title`        — short knitter-language headline
 *  - `explanation`  — one or two sentences of plain language
 *  - `severityHint` — expected severity (the runtime severity wins if they
 *                     differ; this is documentation for catalog authors)
 *  - `fixActions`   — optional list of resolutions: one-click engine fix,
 *                     deep link to the chart editor, or "continue anyway"
 *
 * Unknown rule IDs fall through to a generic presentation that surfaces
 * the original message. The wizard's Screen 4 uses
 * `resolveValidatorMessage` to get a presentation for any ValidationMessage.
 *
 * Coverage gate: `test/validators/messages-catalog-coverage.test.ts`
 * walks the chart-export pipeline source files and asserts every
 * wizard-facing `rule:` string has a catalog entry (with documented
 * exclusions for compiler-internal rules the user can't act on).
 */

import type { ValidationMessage } from './knitout-program.js'

export type WizardScreenIndex = 1 | 2 | 3 | 4

export type FixActionId =
  | 'apply-birdseye'
  | 'apply-ladder'
  | 'enable-experimental-mode'
  | 'enable-shape-aware-export'

export type FixAction =
  | {
      readonly kind: 'one-click-fix'
      readonly label: string
      readonly fixId: FixActionId
      /** Optional human-readable trade-off explanation. */
      readonly note?: string
    }
  | {
      readonly kind: 'jump-to-field'
      readonly label: string
      readonly screen: WizardScreenIndex
      readonly fieldId: string
    }
  | {
      readonly kind: 'open-chart-editor'
      readonly label: string
    }
  | {
      readonly kind: 'continue-anyway'
      readonly label: string
    }

export interface ValidatorMessage {
  readonly rule: string
  readonly title: string
  readonly explanation: string
  readonly severityHint?: 'error' | 'warning' | 'info'
  readonly fixActions?: readonly FixAction[]
}

/**
 * Resolved presentation for a single ValidationMessage. Wraps the original
 * message with the catalog entry (when one exists) and the fix actions the
 * wizard should offer.
 */
export interface ResolvedValidatorMessage {
  readonly rule: string
  readonly severity: ValidationMessage['severity']
  readonly title: string
  readonly explanation: string
  readonly rawMessage: string
  readonly fixActions: readonly FixAction[]
  readonly catalogHit: boolean
  readonly opIndex?: number
}

const CONTINUE_ANYWAY_WARNING: FixAction = {
  kind: 'continue-anyway',
  label: 'Continue anyway',
}

const OPEN_CHART_EDITOR: FixAction = {
  kind: 'open-chart-editor',
  label: 'Open chart editor',
}

const FIX_BIRDSEYE: FixAction = {
  kind: 'one-click-fix',
  label: 'Switch back-bed to birdseye',
  fixId: 'apply-birdseye',
  note: 'Birdseye locks floats into the back of the fabric. Adds machine time.',
}

const FIX_LADDER: FixAction = {
  kind: 'one-click-fix',
  label: 'Switch back-bed to ladder',
  fixId: 'apply-ladder',
  note: 'Lighter than birdseye, longer machine time, slightly less stable.',
}

const FIX_EXPERIMENTAL: FixAction = {
  kind: 'one-click-fix',
  label: 'Enable experimental mode',
  fixId: 'enable-experimental-mode',
}

const FIX_SHAPE_AWARE: FixAction = {
  kind: 'one-click-fix',
  label: 'Switch to shape-aware export',
  fixId: 'enable-shape-aware-export',
  note: 'Shape-aware export handles no-stitch cells natively.',
}

const ENTRIES: readonly ValidatorMessage[] = [
  // ─── chart-track-a: chart compatibility checks ───────────────────────
  {
    rule: 'track-a-no-no-stitch',
    title: 'Chart contains no-stitch cells',
    explanation:
      'No-stitch cells mark stitches that are absent (after a decrease, around armhole shaping). The classic Kniterate export needs every cell to be a real stitch. Shape-aware export handles them.',
    severityHint: 'error',
    fixActions: [FIX_SHAPE_AWARE],
  },
  {
    rule: 'track-a-unknown-op',
    title: 'Chart uses an unknown stitch op',
    explanation:
      'A cell references a stitch op the export doesn\'t recognize. This usually means a custom palette key with no defined op — fix the key binding or remove the cells.',
    severityHint: 'error',
    fixActions: [OPEN_CHART_EDITOR],
  },
  {
    rule: 'track-a-unsupported-op',
    title: 'Chart uses an unsupported stitch op',
    explanation:
      'The export doesn\'t lower this op into Kniterate machine ops yet. Use a supported palette key (knit, purl, tuck, decrease, yarn-over) or wait for compiler support.',
    severityHint: 'error',
    fixActions: [OPEN_CHART_EDITOR],
  },
  {
    rule: 'track-a-bed-width',
    title: 'Chart is wider than the bed',
    explanation:
      'The Kniterate has 252 needles. The chart\'s active stitch count plus its needle offset exceeds that. Narrow the chart or reduce the offset.',
    severityHint: 'error',
    fixActions: [
      OPEN_CHART_EDITOR,
      { kind: 'jump-to-field', label: 'Adjust needle offset', screen: 2, fieldId: 'needleOffset' },
    ],
  },
  {
    rule: 'track-a-bed-overflow',
    title: 'Chart overflows the needle bed',
    explanation:
      'Combined chart width and offset places stitches past needle 252. Shift left or narrow the chart.',
    severityHint: 'error',
    fixActions: [
      { kind: 'jump-to-field', label: 'Adjust needle offset', screen: 2, fieldId: 'needleOffset' },
      OPEN_CHART_EDITOR,
    ],
  },
  {
    rule: 'track-a-narrow-chart',
    title: 'Chart is very narrow',
    explanation:
      'Charts under about 30 stitches wide may not engage the takedown rollers properly — the cast-on edge can curl up off the bed. Knit a swatch first to confirm.',
    severityHint: 'warning',
    fixActions: [CONTINUE_ANYWAY_WARNING],
  },
  {
    rule: 'track-a-needle-offset-positive',
    title: 'Needle offset must be positive',
    explanation:
      'Needle indices start at 1. Move the chart right so the leftmost stitch starts at needle 1 or higher.',
    severityHint: 'error',
    fixActions: [
      { kind: 'jump-to-field', label: 'Adjust needle offset', screen: 2, fieldId: 'needleOffset' },
    ],
  },
  {
    rule: 'track-a-orientation',
    title: 'Chart orientation is invalid',
    explanation:
      'The export needs a clear bottom-up direction; the chart\'s orientation metadata is missing or inconsistent. Re-check the chart\'s row direction.',
    severityHint: 'error',
    fixActions: [OPEN_CHART_EDITOR],
  },
  {
    rule: 'track-a-needs-color',
    title: 'Chart has no painted colors',
    explanation:
      'The export needs at least one painted yarn color on the chart. Paint a color or remove the empty chart.',
    severityHint: 'error',
    fixActions: [OPEN_CHART_EDITOR],
  },
  {
    rule: 'track-a-color-count-max',
    title: 'Too many yarn colors',
    explanation:
      'Standard mode supports up to 4 yarn carriers (C2–C5). Reduce the color count or switch to experimental mode (6 carriers, no reserved draw thread).',
    severityHint: 'error',
    fixActions: [FIX_EXPERIMENTAL, OPEN_CHART_EDITOR],
  },
  {
    rule: 'track-a-experimental-opt-in',
    title: 'Experimental mode required',
    explanation:
      'This chart uses 5 or 6 colors, which only experimental mode supports. Opt in to allow the extra carriers (C1 + C6 are repurposed for pattern yarns).',
    severityHint: 'error',
    fixActions: [FIX_EXPERIMENTAL],
  },
  {
    rule: 'track-a-experimental-active',
    title: 'Experimental mode is active',
    explanation:
      'Experimental mode disables the reserved draw thread and waste carriers used by Customist-style setup. Make sure you understand what\'s changing before knitting.',
    severityHint: 'info',
    fixActions: [CONTINUE_ANYWAY_WARNING],
  },
  {
    rule: 'track-a-unbound-keys',
    title: 'Palette keys are missing yarn or stitch bindings',
    explanation:
      'Some painted cells reference palette keys with no yarn carrier and no stitch override. Bind each key to a yarn or a stitch op before exporting.',
    severityHint: 'error',
    fixActions: [OPEN_CHART_EDITOR],
  },
  {
    rule: 'track-a-duplicate-carrier',
    title: 'Two yarn colors share one carrier',
    explanation:
      'Two distinct yarn colors are assigned to the same machine carrier. Each carrier can hold only one yarn — pick different carriers.',
    severityHint: 'error',
    fixActions: [
      { kind: 'jump-to-field', label: 'Open yarn assignments', screen: 1, fieldId: 'yarn-assignments' },
    ],
  },
  {
    rule: 'track-a-cable-unsupported',
    title: 'Cable shape not lowered yet',
    explanation:
      'One or more cable keys use a stitch geometry the machine compiler doesn\'t lower into transfer ops yet. Supported: symmetric C2/C4/C6/C8 over a knit background, LT/RT 1×1, LPC/RPC at 1/1, 1/2, 2/1 ratios.',
    severityHint: 'error',
    fixActions: [OPEN_CHART_EDITOR],
  },
  {
    rule: 'track-a-short-row-german-preview',
    title: 'German short-row turns are preview-grade',
    explanation:
      'German short rows currently render as marker rows only — they don\'t produce real wrap-and-turn machine ops yet. The exported file will preview but not knit a faithful short row.',
    severityHint: 'warning',
    fixActions: [CONTINUE_ANYWAY_WARNING],
  },
  {
    rule: 'track-a-dbj-strategy-unsupported',
    title: 'DBJ strategy not supported',
    explanation:
      'The selected double-bed jacquard strategy isn\'t implemented for this chart shape yet. Choose a supported strategy (birdseye, ladder, floats) or restructure the chart.',
    severityHint: 'error',
    fixActions: [FIX_BIRDSEYE, FIX_LADDER],
  },
  {
    rule: 'track-a-shape-op-unsupported',
    title: 'Shape op not supported by export',
    explanation:
      'The chart contains a shape-changing op the shaped walker doesn\'t recognize yet. Use a supported shape primitive (paired decrease, raglan, armhole edge bind-off).',
    severityHint: 'error',
    fixActions: [OPEN_CHART_EDITOR],
  },
  {
    rule: 'track-a-shape-overrides-unsupported',
    title: 'Stitch override not supported during shaping',
    explanation:
      'Stitch overrides (purl, tuck) outside trim regions aren\'t lowered into shape-changing rows yet. Either move the override outside the shaping band or restrict it to a trim region.',
    severityHint: 'error',
    fixActions: [OPEN_CHART_EDITOR],
  },
  {
    rule: 'track-a-shape-jacquard-preview',
    title: 'Jacquard inside shaping is preview-only',
    explanation:
      'Multi-color jacquard inside shape-changing rows currently renders as a preview — the exported file may not be machine-faithful in those rows.',
    severityHint: 'warning',
    fixActions: [CONTINUE_ANYWAY_WARNING],
  },
  {
    rule: 'track-a-shape-stripes-preview',
    title: 'Stripes inside shaping are preview-only',
    explanation:
      'Per-row stripes inside shape-changing rows currently render as a preview — the exported file may not be machine-faithful in those rows.',
    severityHint: 'warning',
    fixActions: [CONTINUE_ANYWAY_WARNING],
  },
  {
    rule: 'track-a-overrides-jacquard-unsupported',
    title: 'Stitch overrides not supported in jacquard',
    explanation:
      'Multi-color jacquard charts allow purls only inside a trim-region band (rib hem or cuff) on a shape + horizontal-stripes chart. Move other stitch overrides to a single-color region.',
    severityHint: 'error',
    fixActions: [OPEN_CHART_EDITOR],
  },

  // ─── chart-continuity: stitch-lifetime structural checks ────────────
  {
    rule: 'chart-continuity-initial-shape',
    title: 'Chart\'s first row is invalid',
    explanation:
      'The first row must establish stitch positions clearly — every cell needs to be either active or empty. Fix the row at the bottom of the chart.',
    severityHint: 'error',
    fixActions: [OPEN_CHART_EDITOR],
  },
  {
    rule: 'chart-continuity-initial-split-row',
    title: 'First row uses split stitches',
    explanation:
      'The cast-on row can\'t start mid-split (a stitch with both heads on different beds). Move splits to a later row.',
    severityHint: 'error',
    fixActions: [OPEN_CHART_EDITOR],
  },
  {
    rule: 'chart-continuity-row-width-mismatch',
    title: 'Row width changes unexpectedly',
    explanation:
      'A row\'s active stitch count doesn\'t match the previous row\'s, but no shaping op is in the row to account for it. Either add a shaping op or align the row width.',
    severityHint: 'error',
    fixActions: [OPEN_CHART_EDITOR],
  },
  {
    rule: 'chart-continuity-negative-width',
    title: 'Row width went negative',
    explanation:
      'A shaping op decremented more stitches than the row had. Check the decrease counts on this row.',
    severityHint: 'error',
    fixActions: [OPEN_CHART_EDITOR],
  },
  {
    rule: 'chart-continuity-increase-without-source',
    title: 'Increase has no source stitch',
    explanation:
      'An increase cell needs an adjacent active stitch to grow from. Add a source stitch in the row below.',
    severityHint: 'error',
    fixActions: [OPEN_CHART_EDITOR],
  },
  {
    rule: 'chart-continuity-decrease-without-source',
    title: 'Decrease has no source stitches',
    explanation:
      'A decrease cell consumes 2+ active stitches from the row below. There aren\'t enough source stitches in position.',
    severityHint: 'error',
    fixActions: [OPEN_CHART_EDITOR],
  },
  {
    rule: 'chart-continuity-shift-without-source',
    title: 'Shift has no source stitches',
    explanation:
      'A lateral-shift cell needs source stitches in the row below to slide. Reposition the shift or add the source.',
    severityHint: 'error',
    fixActions: [OPEN_CHART_EDITOR],
  },
  {
    rule: 'chart-continuity-bind-off-span-without-source',
    title: 'Bind-off has no stitches to consume',
    explanation:
      'A bind-off span needs active stitches in the row below. Either the wrong cells were painted or the previous row is empty.',
    severityHint: 'error',
    fixActions: [OPEN_CHART_EDITOR],
  },
  {
    rule: 'chart-continuity-increase-cell-already-active',
    title: 'Increase overlaps an existing stitch',
    explanation:
      'An increase tried to add a new stitch where one already exists. Move the increase one column over.',
    severityHint: 'error',
    fixActions: [OPEN_CHART_EDITOR],
  },
  {
    rule: 'chart-continuity-activated-without-increase',
    title: 'New stitch appeared without an increase',
    explanation:
      'A row activates a column that was empty in the row below, but no increase op accounts for it. Either add the increase or use a no-stitch cell.',
    severityHint: 'error',
    fixActions: [OPEN_CHART_EDITOR],
  },
  {
    rule: 'chart-continuity-deactivated-without-decrease',
    title: 'Stitch disappeared without a decrease',
    explanation:
      'A column went from active to empty without a decrease, bind-off, or drop op to consume it. Either add the op or carry the stitch.',
    severityHint: 'error',
    fixActions: [OPEN_CHART_EDITOR],
  },
  {
    rule: 'chart-continuity-split-active-row',
    title: 'Row splits an already-active segment',
    explanation:
      'A row would split a contiguous active segment into two segments without using a valid split op. Either restructure the row or wait for split support.',
    severityHint: 'error',
    fixActions: [OPEN_CHART_EDITOR],
  },
  {
    rule: 'chart-continuity-too-many-active-segments',
    title: 'Chart has too many separate panels',
    explanation:
      'A single chart can\'t track more than a small number of separate active stitch segments. Reduce gaps or split into multiple charts.',
    severityHint: 'error',
    fixActions: [OPEN_CHART_EDITOR],
  },
  {
    rule: 'chart-continuity-drop-orphan',
    title: 'Drop-stitch has no host',
    explanation:
      'A drop-stitch cell isn\'t attached to an active stitch. Place it on a column that has a stitch in the row below.',
    severityHint: 'error',
    fixActions: [OPEN_CHART_EDITOR],
  },
  {
    rule: 'chart-continuity-unknown-op',
    title: 'Continuity checker hit an unknown op',
    explanation:
      'The stitch-lifetime checker didn\'t recognize an op in the chart. This usually means a palette key needs a stitch-op binding.',
    severityHint: 'error',
    fixActions: [OPEN_CHART_EDITOR],
  },
  {
    rule: 'chart-continuity-cable-purl-bg-mismatch',
    title: 'Cable background must be purl',
    explanation:
      'The cable\'s background cells should be purl stitches to keep the cross visually crisp. Either repaint the background as purl or pick a cable with a knit-background variant.',
    severityHint: 'error',
    fixActions: [OPEN_CHART_EDITOR],
  },

  // ─── chart-package + b1 (garment-package compile) ────────────────────
  {
    rule: 'chart-package-no-panels',
    title: 'Garment package has no panels',
    explanation:
      'The garment compile produced zero panels to knit. Either the construction is unimplemented or the chart input is empty.',
    severityHint: 'error',
    fixActions: [OPEN_CHART_EDITOR],
  },
  {
    rule: 'chart-package-no-selected-panels',
    title: 'No panels were selected for export',
    explanation:
      'Pick at least one panel to export from the panel list.',
    severityHint: 'error',
    fixActions: [
      { kind: 'jump-to-field', label: 'Open panel picker', screen: 1, fieldId: 'panel-source' },
    ],
  },
  {
    rule: 'chart-package-panel-unsupported',
    title: 'Selected panel isn\'t machine-knittable yet',
    explanation:
      'The garment\'s construction method has a panel shape the machine compiler doesn\'t lower yet. Deselect that panel or pick a different construction.',
    severityHint: 'error',
    fixActions: [
      { kind: 'jump-to-field', label: 'Open panel picker', screen: 1, fieldId: 'panel-source' },
      OPEN_CHART_EDITOR,
    ],
  },
  {
    rule: 'chart-package-method-unsupported',
    title: 'Construction not supported for machine knit',
    explanation:
      'This garment\'s construction method doesn\'t have a machine-knittable lowering yet. Pick a supported construction (drop-shoulder, set-in-flat, bottom-up-seamed, panel-raglan, saddle-shoulder, fashioned-back-shoulder).',
    severityHint: 'error',
    fixActions: [OPEN_CHART_EDITOR],
  },
  {
    rule: 'chart-package-shape-contract-required',
    title: 'Garment needs a shape contract',
    explanation:
      'The machine compile needs a derived ShapeContract from the garment. This usually means the garment failed earlier validation — fix the shape errors first.',
    severityHint: 'error',
    fixActions: [OPEN_CHART_EDITOR],
  },
  {
    rule: 'chart-package-panel-compile-exception',
    title: 'Panel compile crashed',
    explanation:
      'The compiler threw while lowering a panel. This is a compiler bug, not a chart bug — please report it with the chart attached.',
    severityHint: 'error',
  },
  {
    rule: 'chart-package-panel-paint-exception',
    title: 'Panel colorwork setup failed',
    explanation:
      'The colorwork overlay could not be prepared for one panel. Other panels may still be ready; check or remove the colorwork for the named panel.',
    severityHint: 'error',
    fixActions: [OPEN_CHART_EDITOR],
  },
  {
    rule: 'chart-package-yarn-bindings-missing-default',
    title: 'Main yarn binding is missing',
    explanation:
      'Multi-yarn garment export needs one main yarn binding for the base knit cells. Add a main yarn assignment before exporting.',
    severityHint: 'error',
    fixActions: [
      { kind: 'jump-to-field', label: 'Open yarn assignments', screen: 1, fieldId: 'yarn-assignments' },
    ],
  },
  {
    rule: 'chart-package-yarn-bindings-duplicate-key',
    title: 'A yarn key is assigned twice',
    explanation:
      'Each chart key can be tied to only one yarn carrier. Remove the duplicate yarn assignment before exporting.',
    severityHint: 'error',
    fixActions: [
      { kind: 'jump-to-field', label: 'Open yarn assignments', screen: 1, fieldId: 'yarn-assignments' },
    ],
  },
  {
    rule: 'b1-no-fabric',
    title: 'Garment is missing its fabric model',
    explanation:
      'The garment\'s FabricIR (the row-by-row stitch graph) is missing or empty. Recompile the garment and try again.',
    severityHint: 'error',
    fixActions: [OPEN_CHART_EDITOR],
  },
  {
    rule: 'b1-piece-empty',
    title: 'A piece has no rows',
    explanation:
      'One of the panels has zero knitted rows in its fabric model. Check the garment spec for that piece.',
    severityHint: 'error',
    fixActions: [OPEN_CHART_EDITOR],
  },
  {
    rule: 'b1-piece-circular',
    title: 'Selected piece is circular',
    explanation:
      'Flat machine export needs flat panels. The selected piece is knit in the round in the garment model. Either pick a flat construction or deselect circular pieces.',
    severityHint: 'error',
    fixActions: [OPEN_CHART_EDITOR],
  },
  {
    rule: 'b1-method-unsupported',
    title: 'Garment method doesn\'t emit shape events',
    explanation:
      'The method\'s FabricIR emitter doesn\'t produce the shape events the machine compiler reads yet. Pick a supported construction.',
    severityHint: 'error',
    fixActions: [OPEN_CHART_EDITOR],
  },
  {
    rule: 'b1-event-preview-grade',
    title: 'Shape event is preview-grade',
    explanation:
      'One or more shape events render as preview-only — the machine file won\'t reproduce them faithfully yet. The garment\'s overall shape will still knit; specific transitions may not.',
    severityHint: 'warning',
    fixActions: [CONTINUE_ANYWAY_WARNING],
  },

  // ─── compile-chart pipeline ─────────────────────────────────────────
  {
    rule: 'compile-no-pattern-carriers',
    title: 'No pattern carriers assigned',
    explanation:
      'No pattern-yarn carriers are configured. Assign at least one carrier on the Yarns screen.',
    severityHint: 'error',
    fixActions: [
      { kind: 'jump-to-field', label: 'Open yarn assignments', screen: 1, fieldId: 'yarn-assignments' },
    ],
  },
  {
    rule: 'compile-bindoff-drop-developer-only',
    title: 'Drop-style bind-off is developer-only',
    explanation:
      'The drop-style bind-off is a development affordance and isn\'t a finished bind-off path. Switch to a standard bind-off (one-by-one, picot, scallop) before exporting.',
    severityHint: 'warning',
    fixActions: [CONTINUE_ANYWAY_WARNING],
  },
  {
    rule: 'compile-shape-mode-cable-events',
    title: 'Shape walker dropped cable events',
    explanation:
      'The shape walker received cable events but doesn\'t dispatch them yet — the cross would be silently dropped. Move cables outside the shape-changing rows.',
    severityHint: 'error',
    fixActions: [OPEN_CHART_EDITOR],
  },
  {
    rule: 'compile-shape-mode-shift-events',
    title: 'Shape walker dropped shift events',
    explanation:
      'The shape walker received lateral-shift events but doesn\'t dispatch them yet — the slide would be silently dropped. Move shifts outside the shape-changing rows.',
    severityHint: 'error',
    fixActions: [OPEN_CHART_EDITOR],
  },
  {
    rule: 'p6-overrides-jacquard-unsupported',
    title: 'Stitch overrides not supported in jacquard',
    explanation:
      'P6 (the per-row pattern lowering) doesn\'t accept stitch overrides on jacquard rows yet. Restrict overrides to single-color stockinette regions.',
    severityHint: 'error',
    fixActions: [OPEN_CHART_EDITOR],
  },

  // ─── machine settings consumption ───────────────────────────────────
  {
    rule: 'machine-setting-ignored',
    title: 'A machine setting was ignored',
    explanation:
      'A setting in the chart header didn\'t match any active recipe field — it was preserved as a header annotation but had no effect on the knit. Move the value into the recipe overrides if you want it to apply.',
    severityHint: 'warning',
    fixActions: [
      { kind: 'jump-to-field', label: 'Open recipe overrides', screen: 3, fieldId: 'advanced-disclosure' },
    ],
  },
  {
    rule: 'machine-setting-unknown',
    title: 'Unknown machine setting in chart header',
    explanation:
      'A header field doesn\'t map to a known recipe property. Remove the field or update the recipe.',
    severityHint: 'warning',
    fixActions: [CONTINUE_ANYWAY_WARNING],
  },

  // ─── chart-body walker ──────────────────────────────────────────────
  {
    rule: 'lined-back-not-implemented',
    title: 'Lined-back is not available',
    explanation:
      'Lined-back was a planned partitioning mode that\'s no longer maintained — birdseye replaced it. Switch to birdseye or ladder.',
    severityHint: 'error',
    fixActions: [FIX_BIRDSEYE, FIX_LADDER],
  },

  // ─── knitout bed-state (mid-compile, generally compiler bugs) ────────
  {
    rule: 'long-float',
    title: 'Long float on the back',
    explanation:
      'Colorwork has long floating strands on the back of the fabric. They\'re loose enough to catch on fingers or jewelry while wearing.',
    severityHint: 'warning',
    fixActions: [FIX_BIRDSEYE, FIX_LADDER, CONTINUE_ANYWAY_WARNING],
  },
  {
    rule: 'adjacent-xfer-same-pass',
    title: 'Two transfers stacked on one needle',
    explanation:
      'The compiler tried to schedule two transfers on adjacent needles in the same pass, which doesn\'t resolve cleanly on the machine. This is a compiler bug — please report it.',
    severityHint: 'error',
  },
  {
    rule: 'in-carrier-already-active',
    title: 'Carrier brought in twice',
    explanation:
      'The compiler tried to bring in a carrier that was already active. This is a compiler bug — please report it.',
    severityHint: 'error',
  },
  {
    rule: 'out-carrier-not-active',
    title: 'Carrier taken out without being in',
    explanation:
      'The compiler tried to take out a carrier that wasn\'t active. This is a compiler bug — please report it.',
    severityHint: 'error',
  },
  {
    rule: 'knit-without-carrier',
    title: 'Knit op missing a carrier',
    explanation:
      'A knit op has no carrier assigned. This is a compiler bug — please report it.',
    severityHint: 'error',
  },
  {
    rule: 'carrier-not-active',
    title: 'Op references an inactive carrier',
    explanation:
      'A knit/tuck/miss op references a carrier that wasn\'t brought in. This is a compiler bug — please report it.',
    severityHint: 'error',
  },
  {
    rule: 'too-many-loops',
    title: 'Too many loops on one needle',
    explanation:
      'A needle accumulated more loops than the machine can handle (typically 3+ tucks without a clearing knit). Restructure the chart\'s tuck stacks.',
    severityHint: 'error',
    fixActions: [OPEN_CHART_EDITOR],
  },
  {
    rule: 'xfer-same-bed',
    title: 'Transfer source and target on same bed',
    explanation:
      'A transfer op targets the same bed it\'s reading from. This is a compiler bug — please report it.',
    severityHint: 'error',
  },
  {
    rule: 'xfer-rack-misalignment',
    title: 'Transfer racked to the wrong slot',
    explanation:
      'A transfer\'s target needle doesn\'t align with the current rack. This is a compiler bug — please report it.',
    severityHint: 'error',
  },
  {
    rule: 'xfer-cross-beds',
    title: 'Transfer crosses both beds in one op',
    explanation:
      'A transfer op tried to cross between beds in a way the machine can\'t represent. This is a compiler bug — please report it.',
    severityHint: 'error',
  },
  {
    rule: 'xfer-from-empty',
    title: 'Transfer from an empty needle',
    explanation:
      'A transfer op tried to move a stitch from a needle that didn\'t have one. This is a compiler bug — please report it.',
    severityHint: 'error',
  },
  {
    rule: 'xfer-rack-consistency',
    title: 'Inconsistent rack across transfers in a pass',
    explanation:
      'Two transfers in the same pass disagree on the rack offset. This is a compiler bug — please report it.',
    severityHint: 'error',
  },
  {
    rule: 'carrier-active',
    title: 'Carrier left active after end-of-program',
    explanation:
      'A carrier wasn\'t taken out before the program ended. This is a compiler bug — please report it.',
    severityHint: 'warning',
  },
  {
    rule: 'carriers-trailing-at-end',
    title: 'Carriers still threaded at end of program',
    explanation:
      'One or more carriers are still threaded when the program ends — the machine will park them. Usually benign, but if it surprises you, check the bind-off sequence.',
    severityHint: 'info',
  },
  {
    rule: 'carrier-in-twice',
    title: 'Carrier brought in twice',
    explanation:
      'The program brings the same carrier in twice without taking it out between. This is a compiler bug — please report it.',
    severityHint: 'error',
  },
  {
    rule: 'carrier-out-without-in',
    title: 'Carrier taken out without being in',
    explanation:
      'The program takes out a carrier that wasn\'t active. This is a compiler bug — please report it.',
    severityHint: 'error',
  },
  {
    rule: 'carrier-id-legal',
    title: 'Invalid carrier ID',
    explanation:
      'A carrier ID outside C1–C6 was used. Fix the yarn assignments.',
    severityHint: 'error',
    fixActions: [
      { kind: 'jump-to-field', label: 'Open yarn assignments', screen: 1, fieldId: 'yarn-assignments' },
    ],
  },
  {
    rule: 'carriers-required',
    title: 'Program declares no carriers',
    explanation:
      'The knit program needs at least one carrier. Assign yarns first.',
    severityHint: 'error',
    fixActions: [
      { kind: 'jump-to-field', label: 'Open yarn assignments', screen: 1, fieldId: 'yarn-assignments' },
    ],
  },
  {
    rule: 'no-sliders',
    title: 'Sliders not supported',
    explanation:
      'A slider transfer op slipped into the program. Kniterate doesn\'t have sliders — only direct transfers. This is a compiler bug.',
    severityHint: 'error',
  },
  {
    rule: 'no-needle-zero',
    title: 'Needle 0 not allowed',
    explanation:
      'A needle index of 0 appeared. Kniterate indices start at 1. This is a compiler bug.',
    severityHint: 'error',
  },
  {
    rule: 'needle-in-range',
    title: 'Needle index out of range',
    explanation:
      'A needle index outside 1–252 appeared. Check the needle offset.',
    severityHint: 'error',
    fixActions: [
      { kind: 'jump-to-field', label: 'Adjust needle offset', screen: 2, fieldId: 'needleOffset' },
    ],
  },
  {
    rule: 'invalid-rack',
    title: 'Rack value out of legal range',
    explanation:
      'A rack op set the rack to a value outside the legal range. This is a compiler bug.',
    severityHint: 'error',
  },
  {
    rule: 'rack-legal-increment',
    title: 'Rack stepped by an illegal increment',
    explanation:
      'A rack op changed the rack by more than the machine allows in one step. This is a compiler bug.',
    severityHint: 'error',
  },
  {
    rule: 'rack-magnitude',
    title: 'Rack exceeds the machine racking envelope',
    explanation:
      'A rack op shifts the bed further than the ±4 needle envelope the reference designs use. The .kc conversion accepts it, but the bed may not physically travel this far — verify against your machine before knitting.',
    severityHint: 'warning',
  },
  {
    rule: 'stitch-number-range',
    title: 'Stitch number out of machine range',
    explanation:
      'A stitch number outside 0–35 (or a non-integer) was emitted. Kniterate encodes the stitch number as a single 0-9/A-Z token, so the .kc conversion would reject it. Lower the body or transfer stitch number to 35 or below under the machine knobs.',
    severityHint: 'error',
    // The rule is global: it fires for the garment body/transfer stitch
    // settings, not just the swatch. Route to the advanced machine-knob
    // disclosure (which owns the body + transfer stitch-number inputs);
    // the swatch-only band editor can't fix a garment-side value.
    fixActions: [
      { kind: 'jump-to-field', label: 'Open machine knobs', screen: 3, fieldId: 'advanced-disclosure' },
    ],
  },
  {
    rule: 'tile-no-stitch-cell',
    title: 'Atomic tile has a no-stitch source cell',
    explanation:
      'A multi-cell stitch tile references a no-stitch source. The projection couldn\'t resolve the tile cleanly.',
    severityHint: 'error',
    fixActions: [OPEN_CHART_EDITOR],
  },
  {
    rule: 'tile-stitch-not-conserved',
    title: 'Tile breaks stitch conservation',
    explanation:
      'An atomic tile\'s stitch count doesn\'t balance against its source cells. The projection rejected the tile.',
    severityHint: 'error',
    fixActions: [OPEN_CHART_EDITOR],
  },
  {
    rule: 'chart-analysis-row-continuity-mismatch',
    title: 'Row continuity check failed',
    explanation:
      'The chart\'s row-by-row continuity analysis hit a mismatch between expected and observed stitch counts. Open the chart and check shaping ops in the indicated row.',
    severityHint: 'error',
    fixActions: [OPEN_CHART_EDITOR],
  },
  {
    rule: 'chart-analysis-negative-start-count',
    title: 'Chart starts with negative stitch count',
    explanation:
      'The starting stitch count is negative. Check the cast-on row.',
    severityHint: 'error',
    fixActions: [OPEN_CHART_EDITOR],
  },
  {
    rule: 'chart-analysis-non-contiguous-active-row',
    title: 'Row has non-contiguous active stitches',
    explanation:
      'A row has gaps between active stitch segments without the right ops to account for them. Restructure the row.',
    severityHint: 'error',
    fixActions: [OPEN_CHART_EDITOR],
  },
  {
    rule: 'chart-analysis-unknown-op',
    title: 'Chart analysis hit an unknown op',
    explanation:
      'The chart analyzer didn\'t recognize an op. This usually means a palette key needs a stitch-op binding.',
    severityHint: 'error',
    fixActions: [OPEN_CHART_EDITOR],
  },

  // ─── carriage policy ────────────────────────────────────────────────
  {
    rule: 'carriage-policy-max-auto-moves',
    title: 'Too many auto-move passes',
    explanation:
      'The carriage trace has more vendor-inserted auto-move passes than this recipe tolerates. Auto-moves reposition the carriage before a pass whose direction doesn\'t match the runtime state. Tight-choreography recipes reduce these by re-ordering passes or inserting explicit park moves.',
    severityHint: 'warning',
    fixActions: [CONTINUE_ANYWAY_WARNING],
  },
] as const

const CATALOG: ReadonlyMap<string, ValidatorMessage> = new Map(
  ENTRIES.map((e) => [e.rule, e]),
)

/**
 * Catalog entry IDs that match a rule prefix dynamically. The
 * resolve-chart pipeline emits IDs like `resolve-chart-skipped`,
 * `resolve-chart-missing`, etc. — derived at runtime from warning text.
 * Rather than enumerate every suffix, match the prefix.
 */
const PREFIX_FALLBACKS: ReadonlyArray<{ prefix: string; entry: ValidatorMessage }> = [
  {
    prefix: 'resolve-chart-',
    entry: {
      rule: 'resolve-chart-*',
      title: 'Chart could not be fully resolved',
      explanation:
        'The chart resolver couldn\'t finish lowering the chart into machine ops. The original message gives the specific reason.',
      severityHint: 'warning',
    },
  },
]

const GENERIC_ENTRY: ValidatorMessage = {
  rule: '*',
  title: 'Compiler reported an issue',
  explanation:
    'The compiler emitted a diagnostic for this rule. Read the underlying message for details.',
}

export function lookupValidatorMessage(rule: string): ValidatorMessage | undefined {
  const exact = CATALOG.get(rule)
  if (exact) return exact
  for (const fallback of PREFIX_FALLBACKS) {
    if (rule.startsWith(fallback.prefix)) return fallback.entry
  }
  return undefined
}

export function resolveValidatorMessage(
  message: ValidationMessage,
): ResolvedValidatorMessage {
  const entry = lookupValidatorMessage(message.rule)
  return {
    rule: message.rule,
    severity: message.severity,
    title: entry?.title ?? GENERIC_ENTRY.title,
    explanation: entry?.explanation ?? message.message,
    rawMessage: message.message,
    fixActions: entry?.fixActions ?? [],
    catalogHit: entry !== undefined,
    opIndex: message.opIndex,
  }
}

/** All catalog-keyed rule IDs (excludes the prefix and generic fallbacks). */
export function listCatalogRuleIds(): readonly string[] {
  return ENTRIES.map((e) => e.rule)
}

/** Returns true if `rule` matches a prefix fallback. */
export function isPrefixFallbackRule(rule: string): boolean {
  return PREFIX_FALLBACKS.some((p) => rule.startsWith(p.prefix))
}

/**
 * Convert a raw validator message into knitter-readable text by:
 *   1. Stripping a leading `[rule-id]` prefix (some package-compile
 *      pipelines bracket the message with the rule for log filtering).
 *   2. Replacing bare palette IDs (`key_k2tog`, `key_cable_4_front`,
 *      `key_ssk`) with the palette's display name. Useful row, column,
 *      panel and count specifics survive untouched.
 *
 * The `keyPalette` is the loose `{ id; name }` shape so this stays a
 * presentation utility — no dependency on the chart color contract.
 * When the palette is empty the function still runs (only the rule-id
 * strip + a pass-through of palette ID tokens).
 *
 * Developer mode renders the raw message instead; this function is the
 * fallback for the knitter-facing path.
 */
export function formatValidatorMessageForKnitter(
  rawMessage: string,
  keyPalette: ReadonlyArray<{ id: string; name: string }>,
): string {
  const idToName = new Map(keyPalette.map((k) => [k.id, k.name]))
  let msg = rawMessage.replace(/^\[[a-z0-9_.-]+\]\s*/i, '')
  msg = msg.replace(/\bkey_[a-z0-9_-]+\b/g, (match) => idToName.get(match) ?? match)
  return msg
}

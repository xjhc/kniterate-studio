/**
 * P3.2 (2026-05-23): first-principles type stack for machine targets and
 * recipes.
 *
 * The previous architecture leaked one named point in parameter space
 * (Customist Studio fairisle) into engine modules, default tables, and
 * wizard hint copy. This module separates the orthogonal concerns:
 *
 *   MachineProfile  — physical machine (bed width, carriers, racking)
 *   YarnMaterial    — fiber / ply / weight
 *   SwatchProfile   — yarn × machine pairing (gauge + risk notes)
 *   MachineRecipe   — composition (swatch + section specs + policies)
 *
 * Customist becomes ONE registered MachineRecipe; the wizard preset
 * function maps to `applyMachineRecipe(state, registry.get(id))`.
 *
 * See docs/SYSTEM-DESIGN.md §A.5 (intent vs. derived state).
 */

import type { CarrierId, KniterateExtensionHeaders } from '../types.js'
import type { BindOffStyle } from '../passes/bind-off.js'

/** Physical machine description. Two recipes for the same machine share
 *  one MachineProfile; orthogonal from the yarn and the section choices. */
export interface MachineProfile {
  readonly id: string
  readonly displayName: string
  /** Total needles per bed (Kniterate: 252). */
  readonly bedWidth: number
  /** Carrier slots the machine can address. Kniterate: 1-6. */
  readonly carrierSlots: readonly CarrierId[]
  /** Smallest racking step the machine supports. Kniterate: 0.5 (full-
   *  needle for knits, half-needle for cabling). */
  readonly rackingGranularity: number
}

/** Yarn material — fiber / ply / weight, independent of any machine. */
export interface YarnMaterial {
  readonly fiber: string
  readonly ply: string
  readonly weightCategory:
    | 'lace'
    | 'fingering'
    | 'sport'
    | 'dk'
    | 'worsted'
    | 'aran'
    | 'bulky'
}

/** Yarn × machine pairing. Carries the empirical gauge produced when
 *  this yarn knits on this machine, plus any risk notes that should
 *  surface in the wizard ("very splitty — keep speed below 200"). */
export interface SwatchProfile {
  readonly id: string
  readonly yarn: YarnMaterial
  readonly machine: MachineProfile
  /** Empirically-measured gauge on a knit swatch. */
  readonly gauge: {
    /** Stitches per 10 cm. */
    readonly stitchesPer10cm: number
    /** Rows per 10 cm. */
    readonly rowsPer10cm: number
    /** Stitch number that produced this gauge. */
    readonly stitchNumber: number
  }
  /** Risk / handling notes — surfaced in the wizard's review panel. */
  readonly riskNotes?: readonly string[]
}

/** A recipe's start-section spec (waste passes, cast-on bed, machine
 *  settings for the ramp-in). Today this maps onto WasteMachineConfig
 *  + a few wizard knobs; making it its own type keeps the recipe
 *  registration declarative. */
export interface StartSpec {
  readonly wastePasses: number
  /** Waste-section machine config (per-pass settings; see
   *  `WasteMachineConfig` in src/knitout/passes/waste-section.ts). */
  readonly wasteMachine: {
    readonly stitchNumber: number
    readonly castOnSpeed: number
    readonly castOnRoller: number
    readonly castOnPasses: number
    readonly castOnTuckPasses: number
    readonly castOnTuckSpeed: number
    readonly castOnTuckRoller: number
    readonly wasteSpeed: number
    readonly flatRollerPasses: number
    readonly rampRollerLeft: number
    readonly rampRollerRight: number
    readonly castOnFirstBed: 'front' | 'back'
    readonly edgeInertNeedles: number
  }
  /** Carrier to use for the waste yarn. */
  readonly wasteCarrier: CarrierId
  /** Draw-thread carrier, or `'none'` to skip the separator row. */
  readonly drawCarrier: CarrierId | 'none'
  /** Per-carrier intro + STIF ramp at body entry. `null` to skip
   *  (standard ladder/birdseye/lined back-bed schemes don't need it). */
  readonly carrierIntro: {
    readonly introSpeed: number
    readonly introRoller: number
    readonly introStitch: number
    readonly rampStitches: readonly number[]
    readonly rampRoller: number
    readonly rampSpeed: number
    readonly cameoCarriers?: readonly CarrierId[]
  } | null
}

/** A recipe's body-section spec (machine settings for steady-state
 *  knitting + back-bed scheme). */
export interface BodySpec {
  readonly stitchNumber: number
  readonly speedNumber: number
  readonly rollerAdvance: number
  readonly xferStitchNumber: number
  readonly backBedStyle: 'ladder' | 'lined' | 'birdseye' | 'floats'
  readonly birdseyeMode?: 'minimal' | 'full'
}

/** A recipe's finish-section spec (how the work comes off the machine). */
export interface FinishSpec {
  readonly bindOff: BindOffStyle
  /** Optional chain bind-off settings (when `bindOff: 'machine-bindoff'`). */
  readonly chainBindoff?: {
    readonly xferSpeed: number
    readonly xferStitch: number
    readonly knitSpeed: number
    readonly knitStitch: number
    readonly knitRollerRamp: readonly number[]
  }
  /** Optional fairisle-park bind-off settings (when
   *  `bindOff: 'fairisle-park-bindoff'`). */
  readonly fairisleParkBindoff?: {
    readonly closingWasteCarrier: CarrierId
    readonly closingWasteSpeed: number
    readonly closingWasteRoller: number
    readonly closingWasteStitchRamp: readonly number[]
    readonly parkSpeed: number
    readonly parkRoller: number
    readonly parkStitch: number
    readonly parkAutoMoveSpeed: number
    readonly parkAutoMoveRoller: number
  }
}

/** Validation policy on top of the engine's hard invariants. Today
 *  per-recipe policies cover front-bed float ceilings (always
 *  on; warn or reject) and Phase 5 carriage policies that interpret
 *  the predicted-pass trace. More will follow as recipes fork (sock-
 *  yarn fairisle, baby blanket cotton, etc.). */
export interface RecipeValidationPolicy {
  /** Front-bed float ceiling. `'reject-above-N'` promotes the existing
   *  long-float warning to an error when run length exceeds N; the
   *  default is `'warn-above-5'` (matches `MAX_FRONT_FLOAT_STITCHES`). */
  readonly floats:
    | { readonly mode: 'warn-above'; readonly threshold: number }
    | { readonly mode: 'reject-above'; readonly threshold: number }
  /** Phase 5 (2026-05-24): carriage-trace policies that interpret
   *  `RunArtifact.predictedPasses`. Recipes should only set this once
   *  the relevant predicted trace is stable under reference fixtures.
   *  Optional; when omitted, no carriage gates fire. */
  readonly carriage?: RecipeCarriagePolicy
}

/** Per-recipe carriage policies. Each policy can be set to `'warn'` or
 *  `'reject'`; reject promotes the diagnostic to a hard compile error.
 *  All policies are evaluated independently — a recipe can warn on
 *  auto-moves but reject on side mismatch, for example. */
export interface RecipeCarriagePolicy {
  /** Cap on auto-move passes (vendor-inserted carriage moves to
   *  reposition before a knit pass whose direction doesn't match
   *  runtime nextDirection). Sims today predict these via
   *  `PredictedPass.isAutoMove`. A recipe expecting tight choreography
   *  (e.g. fairisle park-out bind-off) sets a low cap to flag
   *  unexpected auto-moves earlier. Set `threshold: 0` to flag the
   *  first one. */
  readonly maxAutoMoves?: {
    readonly mode: 'warn' | 'reject'
    readonly threshold: number
  }
}

/** Provenance metadata — keeps the brand reference inside recipe
 *  metadata where it belongs, not scattered across engine code. */
export interface RecipeProvenance {
  /** Slug identifying the source ("customist-studio", "agnes-cameron"). */
  readonly source: string
  /** Test fixture paths that pin this recipe's output to the reference. */
  readonly fixtures: readonly string[]
  /** Optional notes about the source — reference URL, manual citation. */
  readonly notes?: string
}

/** A composed recipe: swatch + start/body/finish + policies + provenance.
 *  The wizard's "preset" surface is a list of these. */
export interface MachineRecipe {
  readonly id: string
  readonly displayName: string
  readonly description?: string
  readonly swatch: SwatchProfile
  readonly sections: {
    readonly start: StartSpec
    readonly body: BodySpec
    readonly finish: FinishSpec
  }
  /** Optional override of the base machine extension headers. When
   *  unset, falls back to the engine's DEFAULT_KNITERATE_HEADERS. */
  readonly extensionHeaders?: Partial<KniterateExtensionHeaders>
  readonly validation: RecipeValidationPolicy
  readonly provenance?: RecipeProvenance
}

/** Registry — recipes are added at module load and looked up by id. */
export interface MachineRecipeRegistry {
  list(): readonly MachineRecipe[]
  get(id: string): MachineRecipe | undefined
  register(recipe: MachineRecipe): void
}

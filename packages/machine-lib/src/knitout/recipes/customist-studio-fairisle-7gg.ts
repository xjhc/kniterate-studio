/**
 * P3.2 (2026-05-23): Customist Studio fairisle recipe.
 *
 * Pins the parameter point that the engine's mechanism defaults
 * (FAIRISLE_BODY_DEFAULTS, FAIRISLE_PARK_WASTE_DEFAULTS,
 * FAIRISLE_CARRIER_INTRO_DEFAULTS, FAIRISLE_PARK_BINDOFF_DEFAULTS,
 * CHAIN_BINDOFF_DEFAULTS) target. Provenance metadata names the source.
 *
 * Per the rearchitecture plan §P3.1 allowlist, "customist" string
 * references in src/knitout are restricted to:
 *   - the recipe id literal
 *   - the provenance source/fixture-name strings
 *
 * Engine code (constants, function names, enum values) is mechanism-
 * named. The brand lives here.
 */

import { FAIRISLE_BODY_DEFAULTS } from '../kniterate/constants.js'
import { FAIRISLE_PARK_WASTE_DEFAULTS } from '../passes/waste-section.js'
import {
  CHAIN_BINDOFF_DEFAULTS,
  FAIRISLE_PARK_BINDOFF_DEFAULTS,
} from '../passes/bind-off.js'
import { FAIRISLE_CARRIER_INTRO_DEFAULTS } from '../passes/carrier-intro.js'

import type { CarrierId } from '../types.js'
import { KNITERATE_7GG, LAMBSWOOL_4PLY } from './profiles.js'
import type { MachineRecipe } from './types.js'

export const CUSTOMIST_STUDIO_FAIRISLE_7GG_RECIPE: MachineRecipe = ({
  id: 'customist-studio-fairisle-7gg',
  displayName: 'Customist Studio fairisle (7gg)',
  description:
    'Stranded fairisle on the front bed only; per-carrier intro + STIF ramp at body entry; closing-waste + Tu-Tu park-out terminus. Matches reference/fairisle.kc.',
  swatch: {
    id: 'customist-fairisle-lambswool-7gg',
    yarn: LAMBSWOOL_4PLY,
    machine: KNITERATE_7GG,
    gauge: {
      stitchesPer10cm: 28,
      rowsPer10cm: 38,
      stitchNumber: FAIRISLE_BODY_DEFAULTS.stitchNumber,
    },
    riskNotes: [
      'Float-style back bed leaves unsecured strands; keep color-block widths ≤ 5 stitches to avoid snagging.',
    ],
  },
  sections: {
    start: {
      // 87 to match reference/fairisle.kc's continuous C6 interlock (kc
      // passes 0–86) before the carrier intro begins. The `continuousWaste`
      // path (wantsIntro) knits C6 straight through to the intro instead of
      // breaking off for a both-beds cast-on, so the interlock must run the
      // full reference length. See docs/fairisle-slice-b-ground-truth.md.
      wastePasses: 87,
      wasteMachine: { ...FAIRISLE_PARK_WASTE_DEFAULTS },
      wasteCarrier: '6' as CarrierId,
      drawCarrier: 'none',
      // C1 is the cameo carrier in reference/fairisle.kc: intro'd with the
      // pattern carriers, re-parked to the left, and caught by the closing
      // park-out. (Only `cameoCarriers` overrides the defaults; the rest of
      // the intro choreography lives in the emitter so it doesn't traverse
      // the persisted-config sanitizer.)
      carrierIntro: { ...FAIRISLE_CARRIER_INTRO_DEFAULTS, cameoCarriers: ['1'] as CarrierId[] },
    },
    body: {
      stitchNumber: FAIRISLE_BODY_DEFAULTS.stitchNumber,
      speedNumber: FAIRISLE_BODY_DEFAULTS.speedNumber,
      rollerAdvance: FAIRISLE_BODY_DEFAULTS.rollerAdvance,
      xferStitchNumber: FAIRISLE_BODY_DEFAULTS.xferStitchNumber ?? 5,
      backBedStyle: 'floats',
    },
    finish: {
      bindOff: 'fairisle-park-bindoff',
      chainBindoff: { ...CHAIN_BINDOFF_DEFAULTS },
      fairisleParkBindoff: { ...FAIRISLE_PARK_BINDOFF_DEFAULTS },
    },
  },
  extensionHeaders: {
    carrierSpacing: FAIRISLE_BODY_DEFAULTS.carrierSpacing,
    carrierStoppingDistance: FAIRISLE_BODY_DEFAULTS.carrierStoppingDistance,
    xferStyle: FAIRISLE_BODY_DEFAULTS.xferStyle,
  },
  validation: {
    // Soft warning today; promote to 'reject-above' if future versions
    // tighten the float policy.
    floats: { mode: 'warn-above', threshold: 5 },
  },
  provenance: {
    source: 'customist-studio',
    fixtures: [
      'reference/fairisle.kc',
      'test/knitout/from-chart-jacquard-floats.test.ts',
    ],
    notes:
      'Pinned to the .kc emitted by Customist Studio\'s default fairisle export — see docs/kniterate-export-rearchitecture-plan.md §P3.1.',
  },
})

Object.freeze(CUSTOMIST_STUDIO_FAIRISLE_7GG_RECIPE)

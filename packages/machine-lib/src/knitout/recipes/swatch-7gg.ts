/**
 * P3.2 (2026-05-23): a second registered recipe that exercises the
 * parametric path — a plain single-color swatch with chain bind-off,
 * no fairisle entry, no park-out terminus. Pins the engine's swatch
 * defaults the way `reference/swatch.kc` does.
 *
 * Why a second recipe: the rearchitecture DoD calls for the parametric
 * path to be exercised end-to-end, not just declared. With only one
 * recipe in the registry, "MachineRecipe-driven export" is
 * indistinguishable from a hardcoded preset.
 */

import { DEFAULT_KNITERATE_HEADERS } from '../kniterate/constants.js'
import { WASTE_BASE_DEFAULTS } from '../passes/waste-section.js'
import { CHAIN_BINDOFF_DEFAULTS } from '../passes/bind-off.js'

import type { CarrierId } from '../types.js'
import { KNITERATE_7GG, LAMBSWOOL_4PLY } from './profiles.js'
import type { MachineRecipe } from './types.js'

export const SWATCH_7GG_RECIPE: MachineRecipe = ({
  id: 'swatch-7gg',
  displayName: 'Plain swatch (7gg, chain bind-off)',
  description:
    'Single-color stockinette swatch with the default waste ramp and a chain bind-off. The minimum compose-from-recipes target — useful for verifying tension and machine settings before committing to a fairisle.',
  swatch: {
    id: 'swatch-7gg-lambswool',
    yarn: LAMBSWOOL_4PLY,
    machine: KNITERATE_7GG,
    gauge: {
      stitchesPer10cm: 28,
      rowsPer10cm: 38,
      stitchNumber: DEFAULT_KNITERATE_HEADERS.stitchNumber ?? 7,
    },
  },
  sections: {
    start: {
      wastePasses: 20,
      wasteMachine: { ...WASTE_BASE_DEFAULTS },
      wasteCarrier: '6' as CarrierId,
      drawCarrier: '1' as CarrierId,
      carrierIntro: null,
    },
    body: {
      stitchNumber: DEFAULT_KNITERATE_HEADERS.stitchNumber ?? 7,
      speedNumber: DEFAULT_KNITERATE_HEADERS.speedNumber ?? 300,
      rollerAdvance: DEFAULT_KNITERATE_HEADERS.rollerAdvance ?? 300,
      xferStitchNumber: DEFAULT_KNITERATE_HEADERS.xferStitchNumber ?? 5,
      backBedStyle: 'ladder',
    },
    finish: {
      bindOff: 'machine-bindoff',
      chainBindoff: { ...CHAIN_BINDOFF_DEFAULTS },
    },
  },
  validation: {
    floats: { mode: 'warn-above', threshold: 5 },
  },
})

Object.freeze(SWATCH_7GG_RECIPE)

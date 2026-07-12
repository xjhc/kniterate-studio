/**
 * P3.2 (2026-05-23): canonical MachineProfile + YarnMaterial values.
 *
 * The Kniterate is the only physical machine target today; the profile
 * exists so additional recipes register against it without redeclaring
 * the constants. New machines slot in here.
 */

import type { CarrierId } from '../types.js'
import type { MachineProfile, YarnMaterial } from './types.js'

export const KNITERATE_7GG: MachineProfile = Object.freeze({
  id: 'kniterate-7gg',
  displayName: 'Kniterate 7gg (252-needle)',
  bedWidth: 252,
  carrierSlots: ['1', '2', '3', '4', '5', '6'] as readonly CarrierId[],
  // Kniterate supports full-needle racking and half-needle for cabling.
  rackingGranularity: 0.5,
})

/** Generic 4-ply lambswool — the yarn class typically used for fairisle
 *  on the Kniterate. The Customist recipe references a specific brand
 *  via its provenance, but the YarnMaterial itself is generic. */
export const LAMBSWOOL_4PLY: YarnMaterial = Object.freeze({
  fiber: 'lambswool',
  ply: '4-ply',
  weightCategory: 'sport',
})

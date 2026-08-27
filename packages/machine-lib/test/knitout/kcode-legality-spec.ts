/**
 * Literal, test-only V1 legality specification.
 *
 * This file deliberately imports nothing from production. It is the independent
 * decision table used to challenge the runtime profile, parser, projector, and
 * validator rather than inheriting their constants.
 */

export const LEGALITY_OPERATIONS = {
  'Kn-Kn': { family: 'regular', directions: ['>>', '<<'], front: 'knit', rear: 'knit' },
  'Tu-Tu': { family: 'regular', directions: ['>>', '<<'], front: 'tuck', rear: 'tuck' },
  'Kn-Tu': { family: 'regular', directions: ['>>', '<<'], front: 'knit', rear: 'tuck' },
  'Tu-Kn': { family: 'regular', directions: ['>>', '<<'], front: 'tuck', rear: 'knit' },
  'Tr-Rl': { family: 'transfer', directions: ['<<'], source: 'front', target: 'rear', rackMultiplier: -1 },
  'Tr-Rr': { family: 'transfer', directions: ['>>'], source: 'front', target: 'rear', rackMultiplier: -1 },
  'Rl-Tr': { family: 'transfer', directions: ['<<'], source: 'rear', target: 'front', rackMultiplier: 1 },
  'Rr-Tr': { family: 'transfer', directions: ['>>'], source: 'rear', target: 'front', rackMultiplier: 1 },
} as const

export const LEGALITY_DIRECTIONS = ['>>', '<<'] as const
export const LEGALITY_CARRIERS = ['0', '1', '2', '3', '4', '5', '6'] as const
export const LEGALITY_RACKS = [
  -4, -3.5, -3, -2.5, -2, -1.5, -1, -0.5, 0,
  0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4,
] as const

export type LegalityOperation = keyof typeof LEGALITY_OPERATIONS
export type LegalityDirection = typeof LEGALITY_DIRECTIONS[number]
export type LegalityCarrier = typeof LEGALITY_CARRIERS[number]
export type LegalityBed = 'front' | 'rear'

export const LEGALITY_CORE_CASE_COUNT = 1_904

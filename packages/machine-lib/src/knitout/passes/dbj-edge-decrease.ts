import { b, f, type BedNeedle } from '../types.js'

/** Experimental edge shaping for an occupied front AND rear bed.
 * Each layer returns to its own bed; no front/back loops are merged.
 * Scratch needles are one column outside the active interval.
 * This is a taper, not the eight-line rounded crown used for single jersey.
 */
export interface DoubleJacquardEdgeCrown {
  steps: number
  rowsPerStep: number
}

export interface EdgeDecreaseTransfer {
  rack: number
  from: BedNeedle
  to: BedNeedle
  /** Scratch destinations must be empty; merges must contain the same layer. */
  landing: 'empty' | 'merge'
}

export function doubleJacquardEdgeTransfers(lo: number, hi: number): EdgeDecreaseTransfer[] {
  if (!Number.isInteger(lo) || !Number.isInteger(hi) || hi - lo + 1 < 10) throw new Error('DBJ edge decrease needs at least 10 active columns')
  // Knitout racking r aligns front n with back n-r.
  return [
    { rack: 1, from: f(lo), to: b(lo - 1), landing: 'empty' },
    { rack: 0, from: b(lo), to: f(lo), landing: 'empty' },
    { rack: -1, from: f(lo), to: b(lo + 1), landing: 'merge' },
    { rack: 2, from: b(lo - 1), to: f(lo + 1), landing: 'merge' },
    { rack: -1, from: f(hi), to: b(hi + 1), landing: 'empty' },
    { rack: 0, from: b(hi), to: f(hi), landing: 'empty' },
    { rack: 1, from: f(hi), to: b(hi - 1), landing: 'merge' },
    { rack: -2, from: b(hi + 1), to: f(hi - 1), landing: 'merge' },
  ]
}

export function validateDoubleJacquardEdgeCrown(lo: number, hi: number, crown: DoubleJacquardEdgeCrown): void {
  // Leave scratch columns inside the knitout 1..252 bed. The final trace
  // validator additionally checks actual racked actions and carriage stops.
  if (!Number.isInteger(lo) || !Number.isInteger(hi) || lo < 2 || hi > 251) throw new Error('DBJ edge crown needs one free scratch column outside each edge')
  if (!Number.isInteger(crown.steps) || crown.steps < 1 || hi - lo + 1 - 2 * crown.steps < 8) throw new Error('DBJ edge crown steps must leave at least eight columns on each bed')
  if (!Number.isInteger(crown.rowsPerStep) || crown.rowsPerStep < 2 || crown.rowsPerStep > 20) throw new Error('DBJ edge crown needs 2..20 design rows per step')
}

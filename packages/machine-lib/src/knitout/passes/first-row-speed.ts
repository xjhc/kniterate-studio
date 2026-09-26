import { CarriageSimulator } from '../sim/carriage-simulator.js';

export interface FirstRowSpeedOverride {
  speed: number;
  restoreSpeed: number;
  /** Optional first-row stitch number (Customist fairisle knits the first
   *  body row at the handoff stitch) and the body stitch to restore. */
  stitch?: number;
  restoreStitch?: number;
}

export function applyFirstRowSpeedOverride(
  sim: CarriageSimulator,
  row: number,
  override: FirstRowSpeedOverride | undefined,
): void {
  if (row === 0 && override) {
    sim.setSpeed(override.speed);
    if (override.stitch !== undefined) sim.setStitch(override.stitch);
  }
}

export function restoreFirstRowSpeedOverride(
  sim: CarriageSimulator,
  row: number,
  override: FirstRowSpeedOverride | undefined,
): void {
  if (row === 0 && override) {
    sim.setSpeed(override.restoreSpeed);
    if (override.restoreStitch !== undefined) sim.setStitch(override.restoreStitch);
  }
}

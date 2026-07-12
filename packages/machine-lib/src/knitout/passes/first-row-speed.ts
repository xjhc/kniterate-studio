import { CarriageSimulator } from '../sim/carriage-simulator.js';

export interface FirstRowSpeedOverride {
  speed: number;
  restoreSpeed: number;
}

export function applyFirstRowSpeedOverride(
  sim: CarriageSimulator,
  row: number,
  override: FirstRowSpeedOverride | undefined,
): void {
  if (row === 0 && override) sim.setSpeed(override.speed);
}

export function restoreFirstRowSpeedOverride(
  sim: CarriageSimulator,
  row: number,
  override: FirstRowSpeedOverride | undefined,
): void {
  if (row === 0 && override) sim.setSpeed(override.restoreSpeed);
}

import type { BedNeedle, CarrierId, Direction } from '../types.js';
import type { CarrierSimState, Side } from '../sim/types.js';

export interface CarrierHandoffState {
  readonly carrier: CarrierId;
  readonly side: Side;
  readonly simulatorState?: CarrierSimState;
}

export type SimulatorHandoff = ReadonlyMap<CarrierId, CarrierHandoffState>;

export interface SimulatorSeedFallback {
  readonly anchorNeedle: BedNeedle;
  readonly anchorDirection: Direction;
}

export interface SimulatorHandoffTarget {
  seedCarrierState(state: CarrierSimState): void;
  seedCarrier(
    carrier: CarrierId,
    opts: {
      side: Side;
      anchorNeedle: BedNeedle;
      anchorDirection: Direction;
    },
  ): void;
}

export interface SimulatorBoundaryState {
  readonly finalCarrierStates: ReadonlyMap<CarrierId, CarrierSimState>;
  readonly releasedCarriers?: readonly CarrierId[];
}

export function simulatorHandoffFromSides(
  sides: Partial<Record<CarrierId, Side>>,
): SimulatorHandoff {
  const out = new Map<CarrierId, CarrierHandoffState>();
  for (const [carrier, side] of Object.entries(sides) as Array<[CarrierId, Side | undefined]>) {
    if (!side) continue;
    out.set(carrier, { carrier, side });
  }
  return out;
}

export function seedSimulatorCarrierFromHandoff(
  sim: SimulatorHandoffTarget,
  handoff: SimulatorHandoff,
  carrier: CarrierId,
  fallbackForSide: (side: Side) => SimulatorSeedFallback,
): boolean {
  const state = handoff.get(carrier);
  if (!state) return false;
  if (state.simulatorState) {
    sim.seedCarrierState(state.simulatorState);
    return true;
  }
  const fallback = fallbackForSide(state.side);
  sim.seedCarrier(carrier, {
    side: state.side,
    anchorNeedle: fallback.anchorNeedle,
    anchorDirection: fallback.anchorDirection,
  });
  return true;
}

export function simulatorHandoffFromBoundary(
  boundary: SimulatorBoundaryState,
): SimulatorHandoff {
  const out = new Map<CarrierId, CarrierHandoffState>();
  for (const [carrier, simulatorState] of boundary.finalCarrierStates) {
    out.set(carrier, {
      carrier,
      side: simulatorState.side,
      simulatorState,
    });
  }
  for (const c of boundary.releasedCarriers ?? []) out.delete(c);
  return out;
}
